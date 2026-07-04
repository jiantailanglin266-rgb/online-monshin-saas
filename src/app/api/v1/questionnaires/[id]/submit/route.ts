import { NextResponse, type NextRequest } from "next/server";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { interviewRepo } from "@/lib/repo/interview";
import { buildAiContext } from "@/lib/ai/context";
import { runDangerCheck, runInitialAnalysis } from "@/lib/ai/gateway";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * 基本7ステップ完了 → status=ai_interview。
 * 冪等：既にai_interviewなら200で現状を返す（PHASE4 §1.5）。
 * 送信時に AI⑥危険検知（安全優先で同期実行）＋ AI①初回解析（interview_plan生成）を行う。
 * ①が失敗しても interview/next 側で再生成されるため問診は止まらない（SAFE-7）。
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const repo = questionnaireRepo();
    const q = await repo.submit(ctx, id);
    if (!q) throw new ApiError(409, "INVALID_STATUS_TRANSITION", "この問診は送信できません");
    await audit(ctx, "questionnaire.submit", {
      resourceType: "questionnaire",
      resourceId: id,
      patientId: ctx.patientId,
    });

    const meta = await repo.getOwnPatientMeta(ctx);
    let emergency: { flagged: boolean; kind: string } | null = null;

    if (meta) {
      const questions = await interviewRepo().list(ctx, id);
      const aiCtx = buildAiContext(meta, q, questions);
      const env = { clinicId: ctx.clinicId!, questionnaireId: id };

      // ⑥ 危険検知（ルールの網を抜けたケースの上乗せ）
      const danger = await runDangerCheck(env, aiCtx);
      if (danger.ok && danger.data.danger && !q.emergencyFlagged) {
        await repo.flagEmergency(ctx, id);
        await audit(ctx, "questionnaire.emergency_flagged", {
          resourceType: "questionnaire",
          resourceId: id,
          patientId: ctx.patientId,
          metadata: { source: "ai_danger_check", categories: danger.data.categories },
        });
        emergency = {
          flagged: true,
          kind: danger.data.suicide_risk ? "suicide" : "general",
        };
      }

      // ① 初回解析 → interview_plan 保存（失敗は許容）
      if (!q.interviewPlan) {
        const analysis = await runInitialAnalysis(env, aiCtx);
        if (analysis.ok) {
          await repo.setInterviewPlan(ctx, id, {
            topics: analysis.data.interview_plan.map((t) => ({
              topic: t.topic,
              why: t.why,
              urgencyRelated: t.urgency_related,
            })),
          });
        }
      }
    }

    return NextResponse.json({ ok: true, status: q.status, emergency });
  } catch (e) {
    return errorResponse(e);
  }
}
