/**
 * 静的書き出しデモ（GitHub Pages）専用：ブラウザ内で /api/v1/* を模倣するエンジン。
 * StaticDemoBridge が fetch を横取りしてここへ届ける。
 *
 * - データ：既存のデモリポジトリ（インメモリ demoDb）＋ localStorage 永続化
 * - AI：既存のモック（AiGateway のデモ分岐をそのまま利用）
 * - 問診ID：事前書き出し済みプール q1〜q20 を巡回（lib/staticdemo/pool.ts）
 *
 * 通常ビルドでは next.config.ts がこのモジュールを noop スタブに alias するため、
 * バンドルに含まれない（"server-only" 系の依存はここからしか届かない）。
 */
import { demoDb, findDemoUser, findDemoUserByRole } from "@/lib/demo/store";
import type { AuthContext, Role } from "@/lib/auth/types";
import { evaluateDangerRules, evaluateTextDanger } from "@/lib/triage/rules";
import {
  runDangerCheck,
  runInitialAnalysis,
  runQuestionGen,
  runTriage,
  runSoap,
  runDepartment,
} from "@/lib/ai/gateway";
import { buildAiContext } from "@/lib/ai/context";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { interviewRepo } from "@/lib/repo/interview";
import { triageRepo, summaryRepo } from "@/lib/repo/triage";
import { nextFallbackQuestion } from "@/lib/ai/fallback";
import { mockDepartment, mockSoap } from "@/lib/ai/mock";
import {
  MAX_AI_QUESTIONS,
  maxSeverity,
  severityRank,
  type InterviewPlan,
  type TriageLevel,
} from "@/lib/types/questionnaire";
import { STATIC_POOL_SIZE } from "@/lib/staticdemo/pool";

const LS_DB = "mb_demo_db_v1";
const LS_USER = "mb_demo_user";
const LS_COUNTER = "mb_demo_qcounter";

type G = typeof globalThis & { __mbDemoDb?: unknown; __mbIdFactory?: (k?: string) => string | null };

let hydrated = false;
let pendingQuestionnaireId: string | null = null;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(LS_DB);
    if (raw) (globalThis as G).__mbDemoDb = JSON.parse(raw);
  } catch {
    /* 壊れていたらシードから */
  }
  // 問診IDだけプールから払い出す（それ以外はUUID）
  (globalThis as G).__mbIdFactory = (kind?: string) => {
    if (kind === "questionnaire" && pendingQuestionnaireId) {
      const id = pendingQuestionnaireId;
      pendingQuestionnaireId = null;
      return id;
    }
    return null;
  };
}

function persist(): void {
  try {
    localStorage.setItem(LS_DB, JSON.stringify(demoDb()));
  } catch {
    /* quota等は無視（デモ） */
  }
}

function getCtx(): AuthContext | null {
  const uid = localStorage.getItem(LS_USER);
  if (!uid) return null;
  const u = findDemoUser(uid);
  if (!u) return null;
  return {
    userId: u.id,
    role: u.role,
    clinicId: u.clinicId,
    patientId: u.patientId,
    doctorId: u.doctorId,
    displayName: u.displayName,
    email: u.email,
    mfaEnrolled: u.mfaEnrolled,
    demo: true,
  };
}

/** プールの次のIDを確保し、同IDの旧データを破棄する（巡回再利用） */
function reserveQuestionnaireId(): void {
  const counter = Number(localStorage.getItem(LS_COUNTER) ?? "0");
  const id = `q${(counter % STATIC_POOL_SIZE) + 1}`;
  localStorage.setItem(LS_COUNTER, String(counter + 1));
  const db = demoDb();
  db.questionnaires = db.questionnaires.filter((q) => q.id !== id);
  db.aiQuestions = db.aiQuestions.filter((q) => q.questionnaireId !== id);
  db.triageResults = db.triageResults.filter((t) => t.questionnaireId !== id);
  db.aiSummaries = db.aiSummaries.filter((s) => s.questionnaireId !== id);
  db.images = db.images.filter((i) => i.questionnaireId !== id);
  pendingQuestionnaireId = id;
}

interface Res {
  status: number;
  body: unknown;
}

const ok = (body: unknown): Res => ({ status: 200, body });
const err = (status: number, code: string, message: string): Res => ({
  status,
  body: { error: { code, message } },
});

export async function handleDemoApi(
  path: string,
  method: string,
  rawBody: string | null
): Promise<Response> {
  hydrate();
  let res: Res;
  try {
    const body = rawBody ? JSON.parse(rawBody) : null;
    res = await route(path.replace(/\/+$/, ""), method, body);
  } catch (e) {
    console.error("[static-demo]", e);
    res = err(500, "INTERNAL", "デモエンジンでエラーが発生しました");
  }
  persist();
  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function route(path: string, method: string, body: any): Promise<Res> {
  const seg = path.split("/").filter(Boolean);

  // ---- auth ----
  if (seg[0] === "auth") {
    if (seg[1] === "demo-login" && method === "POST") {
      const u = findDemoUserByRole(body?.role as Role);
      if (!u) return err(404, "NOT_FOUND", "デモユーザーが見つかりません");
      localStorage.setItem(LS_USER, u.id);
      return ok({ ok: true, role: u.role });
    }
    if (seg[1] === "logout" && method === "POST") {
      localStorage.removeItem(LS_USER);
      return ok({ ok: true });
    }
    if (seg[1] === "demo-mfa" && method === "POST") {
      const ctx = getCtx();
      if (!ctx) return err(401, "UNAUTHENTICATED", "ログインしてください");
      const u = findDemoUser(ctx.userId);
      if (u) u.mfaEnrolled = true;
      return ok({ ok: true });
    }
    return err(404, "NOT_FOUND", "リソースが見つかりません");
  }

  // ---- me ----
  if (seg[0] === "me" && method === "GET") {
    const ctx = getCtx();
    if (!ctx) return err(401, "UNAUTHENTICATED", "ログインしてください");
    return ok({
      role: ctx.role,
      displayName: ctx.displayName,
      email: ctx.email,
      mfaEnrolled: ctx.mfaEnrolled,
      demo: true,
    });
  }

  // ---- questionnaires ----
  if (seg[0] !== "questionnaires") return err(404, "NOT_FOUND", "リソースが見つかりません");
  const ctx = getCtx();
  if (!ctx) return err(401, "UNAUTHENTICATED", "ログインしてください");
  if (ctx.role !== "patient") return err(404, "NOT_FOUND", "リソースが見つかりません");

  const qRepo = questionnaireRepo();
  const iRepo = interviewRepo();
  const env = { clinicId: ctx.clinicId! };

  // GET /questionnaires（一覧）
  if (seg.length === 1 && method === "GET") {
    return ok({ questionnaires: await qRepo.listOwn(ctx) });
  }
  // POST /questionnaires（draft作成）
  if (seg.length === 1 && method === "POST") {
    const existingDraft = (await qRepo.listOwn(ctx)).find((q) => q.status === "draft");
    if (!existingDraft) reserveQuestionnaireId();
    const q = await qRepo.createDraft(ctx, body?.templateType === "dermatology" ? "dermatology" : "internal");
    return ok({ id: q.id, currentStep: q.currentStep });
  }

  const id = seg[1];
  const q = await qRepo.findOwn(ctx, id);
  if (!q) return err(404, "NOT_FOUND", "問診が見つかりません");
  const sub = seg.slice(2).join("/");

  // GET /questionnaires/:id
  if (!sub && method === "GET") {
    const meta = await qRepo.getOwnPatientMeta(ctx);
    return ok({ ...q, patientSex: meta?.sex ?? "no_answer", patientAge: meta?.age ?? null });
  }

  // PATCH /questionnaires/:id（ステップ保存＋ルール危険判定）
  if (!sub && method === "PATCH") {
    const wasFlagged = q.emergencyFlagged;
    const updated = await qRepo.applyPatch(ctx, id, body ?? {});
    if (!updated) return err(409, "INVALID_STATUS_TRANSITION", "この問診は編集できません");
    const result = evaluateDangerRules(updated);
    const isNew = !wasFlagged && (result.level === "L1" || result.suicideRisk);
    if (isNew) await qRepo.flagEmergency(ctx, id);
    return ok({
      saved: true,
      emergency: isNew ? { flagged: true, kind: result.suicideRisk ? "suicide" : "general" } : null,
    });
  }

  // POST /questionnaires/:id/submit
  if (sub === "submit" && method === "POST") {
    const submitted = await qRepo.submit(ctx, id);
    if (!submitted) return err(409, "INVALID_STATUS_TRANSITION", "この問診は送信できません");
    const meta = await qRepo.getOwnPatientMeta(ctx);
    let emergency: { flagged: boolean; kind: string } | null = null;
    if (meta) {
      const aiCtx = buildAiContext(meta, submitted, await iRepo.list(ctx, id));
      const danger = await runDangerCheck(env, aiCtx);
      if (danger.ok && danger.data.danger && !submitted.emergencyFlagged) {
        await qRepo.flagEmergency(ctx, id);
        emergency = { flagged: true, kind: danger.data.suicide_risk ? "suicide" : "general" };
      }
      if (!submitted.interviewPlan) {
        const analysis = await runInitialAnalysis(env, aiCtx);
        if (analysis.ok) {
          await qRepo.setInterviewPlan(ctx, id, {
            topics: analysis.data.interview_plan.map((t) => ({
              topic: t.topic,
              why: t.why,
              urgencyRelated: t.urgency_related,
            })),
          });
        }
      }
    }
    return ok({ ok: true, status: "ai_interview", emergency });
  }

  // POST /questionnaires/:id/images
  if (sub === "images" && method === "POST") {
    const dataUrl: string = body?.dataUrl ?? "";
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 4 * 1024 * 1024) {
      return err(400, "VALIDATION_ERROR", "画像はJPEG/PNG/WebP形式・3MB以内でお願いします");
    }
    const mimeType = dataUrl.substring(5, dataUrl.indexOf(";"));
    const byteSize = Math.floor((dataUrl.split(",")[1].length * 3) / 4);
    const count = await qRepo.addImage(ctx, id, { mimeType, byteSize, dataUrl });
    if (count === null) return err(409, "IMAGE_LIMIT", "画像は5枚までアップロードできます");
    return ok({ ok: true, imageCount: count });
  }

  // GET /questionnaires/:id/interview
  if (sub === "interview" && method === "GET") {
    const questions = await iRepo.list(ctx, id);
    return ok({
      status: q.status,
      questions,
      answeredCount: questions.filter((x) => x.answeredAt).length,
      maxQuestions: MAX_AI_QUESTIONS,
    });
  }

  // POST /questionnaires/:id/interview/next
  if (sub === "interview/next" && method === "POST") {
    if (q.status !== "ai_interview")
      return err(409, "INVALID_STATUS_TRANSITION", "追加質問を受け付けていない状態です");
    const questions = await iRepo.list(ctx, id);
    const unanswered = questions.find((x) => !x.answeredAt);
    if (unanswered) return ok({ done: false, question: unanswered });
    if (questions.length >= MAX_AI_QUESTIONS) return ok({ done: true });

    const meta = await qRepo.getOwnPatientMeta(ctx);
    if (!meta) return err(404, "NOT_FOUND", "患者情報が見つかりません");
    const aiCtx = buildAiContext(meta, q, questions);

    let plan: InterviewPlan | null = q.interviewPlan;
    if (!plan) {
      const analysis = await runInitialAnalysis(env, aiCtx);
      if (analysis.ok) {
        plan = {
          topics: analysis.data.interview_plan.map((t) => ({
            topic: t.topic,
            why: t.why,
            urgencyRelated: t.urgency_related,
          })),
        };
        await qRepo.setInterviewPlan(ctx, id, plan);
      }
    }
    const asked = questions.map((x) => x.questionText);
    const remaining = MAX_AI_QUESTIONS - questions.length;
    if (plan) {
      const gen = await runQuestionGen(env, aiCtx, plan.topics, asked, remaining);
      if (gen.ok) {
        if (gen.data.done || !gen.data.question) return ok({ done: true });
        if (!asked.includes(gen.data.question.text)) {
          const created = await iRepo.add(ctx, id, {
            questionText: gen.data.question.text,
            questionType: gen.data.question.type,
            options: gen.data.question.options,
            source: "ai",
          });
          return ok({ done: false, question: created });
        }
      }
    }
    const fb = nextFallbackQuestion(q.templateType, asked);
    if (!fb) return ok({ done: true });
    const created = await iRepo.add(ctx, id, {
      questionText: fb.text,
      questionType: fb.type,
      options: fb.options,
      source: "fallback",
    });
    return ok({ done: false, question: created });
  }

  // POST /questionnaires/:id/interview/answers
  if (sub === "interview/answers" && method === "POST") {
    if (q.status !== "ai_interview")
      return err(409, "INVALID_STATUS_TRANSITION", "回答を受け付けていない状態です");
    const saved = await iRepo.answer(ctx, id, body?.questionId, body?.answer);
    if (!saved) return err(404, "NOT_FOUND", "質問が見つかりません");
    const answerText = Array.isArray(body?.answer) ? body.answer.join("\n") : String(body?.answer ?? "");
    const danger = evaluateTextDanger(answerText);
    const isNew = !q.emergencyFlagged && (danger.level === "L1" || danger.suicideRisk);
    if (isNew) await qRepo.flagEmergency(ctx, id);
    return ok({
      saved: true,
      emergency: isNew ? { flagged: true, kind: danger.suicideRisk ? "suicide" : "general" } : null,
    });
  }

  // POST /questionnaires/:id/finalize
  if (sub === "finalize" && method === "POST") {
    if (q.status === "triaged" || q.status === "doctor_reviewed" || q.status === "consulted") {
      const existing = await triageRepo().latest(ctx, id);
      return ok({ ok: true, level: existing?.finalLevel ?? "L3", departments: q.suggestedDepartments });
    }
    if (q.status !== "ai_interview")
      return err(409, "INVALID_STATUS_TRANSITION", "この問診は確定できません");

    const meta = await qRepo.getOwnPatientMeta(ctx);
    if (!meta) return err(404, "NOT_FOUND", "患者情報が見つかりません");
    const questions = await iRepo.list(ctx, id);
    const aiCtx = buildAiContext(meta, q, questions);

    const rule = evaluateDangerRules(q, { age: meta.age });
    const ruleLevel: TriageLevel = rule.level ?? "L4";
    const triageAi = await runTriage(env, aiCtx, rule);
    const aiLevel: TriageLevel | null = triageAi.ok ? triageAi.data.level : null;
    const finalLevel = aiLevel ? maxSeverity(aiLevel, ruleLevel) : maxSeverity("L3", ruleLevel);
    const aiRuleGap = aiLevel != null && severityRank(ruleLevel) - severityRank(aiLevel) >= 2;

    await triageRepo().add(ctx, id, {
      finalLevel,
      aiLevel,
      ruleLevel,
      aiReasons: triageAi.ok
        ? {
            reasons: triageAi.data.reasons,
            uncertain: triageAi.data.uncertain,
            escalationNote: triageAi.data.escalation_note,
            aiRuleGap,
          }
        : { unavailable: true },
      ruleHits: rule.hits,
    });

    const soapAi = await runSoap(env, aiCtx);
    const soap = soapAi.ok
      ? soapAi.data
      : {
          ...mockSoap(aiCtx),
          a: [{ text: "AI要約なし。原文をご確認ください。", refs: [] }],
          p: [{ text: "AI要約なし。原文をご確認ください。", refs: [] }],
        };
    await summaryRepo().save(ctx, id, soap);

    const deptAi = await runDepartment(env, aiCtx);
    const departments = (deptAi.ok ? deptAi.data : mockDepartment(aiCtx)).departments
      .map((d) => d.code)
      .slice(0, 2);

    await qRepo.markTriaged(ctx, id, departments);
    return ok({ ok: true, level: finalLevel, departments });
  }

  // GET /questionnaires/:id/result
  if (sub === "result" && method === "GET") {
    const triage = await triageRepo().latest(ctx, id);
    return ok({
      status: q.status,
      currentStep: q.currentStep,
      level: triage?.finalLevel ?? null,
      departments: q.suggestedDepartments,
    });
  }

  return err(404, "NOT_FOUND", "リソースが見つかりません");
}
