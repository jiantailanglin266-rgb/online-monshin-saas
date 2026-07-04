import "server-only";
import type { ZodType, ZodTypeDef } from "zod";
import { isDemoMode } from "@/lib/env";
import type { AiPatientContext } from "@/lib/ai/context";
import {
  dangerCheckSchema,
  departmentSchema,
  findBannedPhrase,
  initialAnalysisSchema,
  questionGenSchema,
  soapSchema,
  triageSchema,
  type DangerCheckResult,
  type DepartmentAiResult,
  type InitialAnalysisResult,
  type QuestionGenResult,
  type SoapAiResult,
  type TriageAiResult,
} from "@/lib/ai/schemas";
import {
  PROMPT_VERSION,
  SYSTEM_PREAMBLE,
  dangerCheckPrompt,
  departmentPrompt,
  initialAnalysisPrompt,
  questionGenPrompt,
  soapPrompt,
  triagePrompt,
} from "@/lib/ai/prompts";
import { availableProviders, callProvider, modelFor } from "@/lib/ai/providers";
import {
  mockDangerCheck,
  mockDepartment,
  mockInitialAnalysis,
  mockQuestionGen,
  mockSoap,
  mockTriage,
} from "@/lib/ai/mock";
import type { RuleResult } from "@/lib/triage/rules";

/**
 * AiGateway：全AI呼び出しの唯一の入口。
 * ログ記録（ai_logs / SAFE-4）・構造検査・禁止表現検査（SAFE-1）・
 * プロバイダフォールバックを一手に担う。
 */

export type AiOutcome<T> = { ok: true; data: T } | { ok: false };

interface CallEnv {
  clinicId: string;
  questionnaireId?: string;
}

type Purpose = "initial_analysis" | "question_gen" | "triage" | "soap" | "department" | "danger_check";

async function logAi(
  env: CallEnv,
  purpose: Purpose,
  fields: {
    provider: string;
    model: string;
    request: unknown;
    response?: unknown;
    validation?: unknown;
    status: "ok" | "error" | "timeout" | "blocked";
    latencyMs: number;
  }
): Promise<void> {
  if (isDemoMode) {
    console.log(`[ai_log] ${purpose} ${fields.provider}/${fields.model} ${fields.status} ${fields.latencyMs}ms`);
    return;
  }
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma().aiLog.create({
      data: {
        clinicId: env.clinicId,
        questionnaireId: env.questionnaireId,
        purpose,
        provider: fields.provider,
        model: fields.model,
        promptVersion: PROMPT_VERSION,
        requestPayload: fields.request as never,
        responsePayload: (fields.response ?? undefined) as never,
        outputValidation: (fields.validation ?? undefined) as never,
        status: fields.status,
        latencyMs: fields.latencyMs,
      },
    });
  } catch (e) {
    console.error("ai_log write failed", e); // ログ失敗でAI機能自体は止めない
  }
}

/** ```json フェンス等を除去してからJSONパース */
function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

async function execute<T>(
  env: CallEnv,
  purpose: Purpose,
  opts: {
    tier: "smart" | "fast";
    temperature: number;
    timeoutMs: number;
    schema: ZodType<T, ZodTypeDef, unknown>;
    userPrompt: string;
    /** 患者に露出するテキストの抽出（禁止表現検査の対象） */
    patientFacingText?: (data: T) => string | null;
  }
): Promise<AiOutcome<T>> {
  for (const provider of availableProviders()) {
    const model = modelFor(provider, opts.tier);
    // 構造・表現の不合格は同一プロバイダで1回だけリトライ（PHASE4 §4.5）
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        const res = await callProvider(provider, model, SYSTEM_PREAMBLE, opts.userPrompt, {
          timeoutMs: opts.timeoutMs,
          temperature: opts.temperature,
        });
        const parsed = opts.schema.safeParse(parseJson(res.text));
        if (!parsed.success) {
          await logAi(env, purpose, {
            provider, model, request: { prompt: opts.userPrompt },
            response: { raw: res.text.slice(0, 4000) },
            validation: { schemaError: parsed.error.issues.slice(0, 5) },
            status: "blocked", latencyMs: Date.now() - started,
          });
          continue;
        }
        const facing = opts.patientFacingText?.(parsed.data) ?? null;
        const banned = facing ? findBannedPhrase(facing) : null;
        if (banned) {
          await logAi(env, purpose, {
            provider, model, request: { prompt: opts.userPrompt },
            response: parsed.data, validation: { banned },
            status: "blocked", latencyMs: Date.now() - started,
          });
          continue;
        }
        await logAi(env, purpose, {
          provider, model, request: { prompt: opts.userPrompt },
          response: parsed.data, status: "ok", latencyMs: Date.now() - started,
        });
        return { ok: true, data: parsed.data };
      } catch (e) {
        const isAbort = e instanceof Error && e.name === "AbortError";
        await logAi(env, purpose, {
          provider, model, request: { prompt: opts.userPrompt },
          response: { error: String(e) },
          status: isAbort ? "timeout" : "error", latencyMs: Date.now() - started,
        });
        break; // 通信エラー・タイムアウトはリトライせず次のプロバイダへ
      }
    }
  }
  return { ok: false };
}

// ------------------------------------------------------------ public API

export async function runInitialAnalysis(
  env: CallEnv,
  ctx: AiPatientContext
): Promise<AiOutcome<InitialAnalysisResult>> {
  if (isDemoMode) {
    const data = mockInitialAnalysis(ctx);
    await logAi(env, "initial_analysis", {
      provider: "mock", model: "mock", request: {}, status: "ok", latencyMs: 0,
    });
    return { ok: true, data };
  }
  return execute(env, "initial_analysis", {
    tier: "smart",
    temperature: 0.2,
    timeoutMs: 20000,
    schema: initialAnalysisSchema,
    userPrompt: initialAnalysisPrompt(ctx),
  });
}

export async function runQuestionGen(
  env: CallEnv,
  ctx: AiPatientContext,
  plan: { topic: string; urgencyRelated?: boolean }[],
  askedQuestionTexts: string[],
  remaining: number
): Promise<AiOutcome<QuestionGenResult>> {
  if (isDemoMode) {
    const data = mockQuestionGen(plan, askedQuestionTexts, remaining);
    await logAi(env, "question_gen", {
      provider: "mock", model: "mock", request: {}, status: "ok", latencyMs: 0,
    });
    return { ok: true, data };
  }
  return execute(env, "question_gen", {
    tier: "fast",
    temperature: 0.3,
    timeoutMs: 8000, // 応答8秒要件（PHASE1 §4）
    schema: questionGenSchema,
    userPrompt: questionGenPrompt(ctx, plan, askedQuestionTexts, remaining),
    patientFacingText: (d) =>
      d.question ? [d.question.text, ...(d.question.options ?? [])].join("\n") : null,
  });
}

/** ③緊急度判定。ruleForMock はデモモードのモック判定にのみ使用（実プロバイダは無視） */
export async function runTriage(
  env: CallEnv,
  ctx: AiPatientContext,
  ruleForMock: RuleResult
): Promise<AiOutcome<TriageAiResult>> {
  if (isDemoMode) {
    const data = mockTriage(ctx, ruleForMock);
    await logAi(env, "triage", {
      provider: "mock", model: "mock", request: {}, status: "ok", latencyMs: 0,
    });
    return { ok: true, data };
  }
  return execute(env, "triage", {
    tier: "smart",
    temperature: 0, // ぶれ最小化（PHASE4 §4.2）
    timeoutMs: 20000,
    schema: triageSchema,
    userPrompt: triagePrompt(ctx),
  });
}

/** ④SOAP要約（医師向け・患者非表示） */
export async function runSoap(
  env: CallEnv,
  ctx: AiPatientContext
): Promise<AiOutcome<SoapAiResult>> {
  if (isDemoMode) {
    const data = mockSoap(ctx);
    await logAi(env, "soap", {
      provider: "mock", model: "mock", request: {}, status: "ok", latencyMs: 0,
    });
    return { ok: true, data };
  }
  return execute(env, "soap", {
    tier: "smart",
    temperature: 0.2,
    timeoutMs: 20000,
    schema: soapSchema,
    userPrompt: soapPrompt(ctx),
  });
}

/** ⑤診療科目提案 */
export async function runDepartment(
  env: CallEnv,
  ctx: AiPatientContext
): Promise<AiOutcome<DepartmentAiResult>> {
  if (isDemoMode) {
    const data = mockDepartment(ctx);
    await logAi(env, "department", {
      provider: "mock", model: "mock", request: {}, status: "ok", latencyMs: 0,
    });
    return { ok: true, data };
  }
  return execute(env, "department", {
    tier: "fast",
    temperature: 0,
    timeoutMs: 10000,
    schema: departmentSchema,
    userPrompt: departmentPrompt(ctx),
  });
}

export async function runDangerCheck(
  env: CallEnv,
  ctx: AiPatientContext
): Promise<AiOutcome<DangerCheckResult>> {
  if (isDemoMode) {
    const data = mockDangerCheck(ctx);
    await logAi(env, "danger_check", {
      provider: "mock", model: "mock", request: {}, status: "ok", latencyMs: 0,
    });
    return { ok: true, data };
  }
  return execute(env, "danger_check", {
    tier: "smart",
    temperature: 0,
    timeoutMs: 20000,
    schema: dangerCheckSchema,
    userPrompt: dangerCheckPrompt(ctx),
  });
}
