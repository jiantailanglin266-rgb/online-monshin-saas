import { NextResponse, type NextRequest } from "next/server";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { interviewRepo } from "@/lib/repo/interview";
import { triageRepo, summaryRepo } from "@/lib/repo/triage";
import { buildAiContext } from "@/lib/ai/context";
import { runDepartment, runSoap, runTriage } from "@/lib/ai/gateway";
import { mockDepartment, mockSoap } from "@/lib/ai/mock";
import { evaluateDangerRules } from "@/lib/triage/rules";
import { maxSeverity, severityRank, type TriageLevel } from "@/lib/types/questionnaire";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * 問診の確定：AI③緊急度 + ④SOAP + ⑤科目提案 → status=triaged。
 * final_level = max(ai_level, rule_level)（重症側）。
 * 冪等：triaged 以降は既存結果を200で返す（PHASE4 §1.5）。
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const qRepo = questionnaireRepo();
    const q = await qRepo.findOwn(ctx, id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "問診が見つかりません");

    // 冪等：確定済みなら既存結果を返す
    if (q.status === "triaged" || q.status === "doctor_reviewed" || q.status === "consulted") {
      const existing = await triageRepo().latest(ctx, id);
      return NextResponse.json({
        ok: true,
        level: existing?.finalLevel ?? "L3",
        departments: q.suggestedDepartments,
      });
    }
    if (q.status !== "ai_interview") {
      throw new ApiError(409, "INVALID_STATUS_TRANSITION", "この問診は確定できません");
    }

    const meta = await qRepo.getOwnPatientMeta(ctx);
    if (!meta) throw new ApiError(404, "NOT_FOUND", "患者情報が見つかりません");
    const questions = await interviewRepo().list(ctx, id);
    const aiCtx = buildAiContext(meta, q, questions);
    const env = { clinicId: ctx.clinicId!, questionnaireId: id };

    // --- ③ 緊急度：ルール（常時）＋AI、重症側を採用 ---
    // ルールは「底上げ」専用：ヒットなし=L4（通常判定はAI側が担う。PHASE8メモ §2）
    const rule = evaluateDangerRules(q, { age: meta.age });
    const ruleLevel: TriageLevel = rule.level ?? "L4";

    const triageAi = await runTriage(env, aiCtx, rule);
    const aiLevel: TriageLevel | null = triageAi.ok ? triageAi.data.level : null;
    // AI判定なしの場合、ルール単独でL4（経過観察）を出すのは危険なため下限L3
    const finalLevel = aiLevel
      ? maxSeverity(aiLevel, ruleLevel)
      : maxSeverity("L3", ruleLevel);
    // AIがルールより2段階以上軽い場合は見落とし兆候（医師画面で警告：PHASE4 §4.5-3）
    const aiRuleGap =
      aiLevel != null && severityRank(ruleLevel) - severityRank(aiLevel) >= 2;

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

    // --- ④ SOAP（失敗時は機械的整理＋「AI要約なし」注記：SAFE-7） ---
    const soapAi = await runSoap(env, aiCtx);
    const soap = soapAi.ok
      ? soapAi.data
      : {
          ...mockSoap(aiCtx),
          a: [{ text: "AI要約なし。原文をご確認ください。", refs: [] }],
          p: [{ text: "AI要約なし。原文をご確認ください。", refs: [] }],
        };
    await summaryRepo().save(ctx, id, soap);

    // --- ⑤ 科目提案（失敗時は静的マッピング） ---
    const deptAi = await runDepartment(env, aiCtx);
    const departments = (deptAi.ok ? deptAi.data : mockDepartment(aiCtx)).departments
      .map((d) => d.code)
      .slice(0, 2);

    const updated = await qRepo.markTriaged(ctx, id, departments);
    if (!updated) {
      // 競合（同時finalize）：もう一方が確定済み。既存結果を返す
      const existing = await triageRepo().latest(ctx, id);
      return NextResponse.json({
        ok: true,
        level: existing?.finalLevel ?? finalLevel,
        departments: q.suggestedDepartments,
      });
    }

    await audit(ctx, "questionnaire.finalize", {
      resourceType: "questionnaire",
      resourceId: id,
      patientId: ctx.patientId,
      metadata: { finalLevel, aiLevel, ruleLevel, aiRuleGap },
    });
    // L1/L2 のクリニック即時通知は Phase 10（通知基盤）で接続

    return NextResponse.json({ ok: true, level: finalLevel, departments });
  } catch (e) {
    return errorResponse(e);
  }
}
