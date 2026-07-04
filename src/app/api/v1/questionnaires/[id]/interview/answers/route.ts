import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { interviewRepo } from "@/lib/repo/interview";
import { evaluateTextDanger } from "@/lib/triage/rules";
import { buildAiContext } from "@/lib/ai/context";
import { runDangerCheck } from "@/lib/ai/gateway";
import { isDemoMode } from "@/lib/env";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  questionId: z.string().uuid(),
  answer: z.union([z.string().max(1000), z.array(z.string().max(200)).max(10)]),
});

type Params = { params: Promise<{ id: string }> };

/** 追加質問への回答保存。ルール危険判定を常時、AI危険検知（⑥）を3問ごとに実行。 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "入力内容をご確認ください" } },
        { status: 400 }
      );
    }

    const qRepo = questionnaireRepo();
    const q = await qRepo.findOwn(ctx, id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "問診が見つかりません");
    if (q.status !== "ai_interview") {
      throw new ApiError(409, "INVALID_STATUS_TRANSITION", "回答を受け付けていない状態です");
    }

    const iRepo = interviewRepo();
    const saved = await iRepo.answer(ctx, id, parsed.data.questionId, parsed.data.answer);
    if (!saved) throw new ApiError(404, "NOT_FOUND", "質問が見つかりません");

    // ルールベース危険判定（常時・同期）
    const answerText = Array.isArray(parsed.data.answer)
      ? parsed.data.answer.join("\n")
      : parsed.data.answer;
    let danger = evaluateTextDanger(answerText);

    // AI危険検知（⑥）：3問回答ごと（実プロバイダ時のみ。デモはルールで代替済み）
    if (!isDemoMode && !danger.suicideRisk && danger.level !== "L1") {
      const questions = await iRepo.list(ctx, id);
      const answeredCount = questions.filter((x) => x.answeredAt).length;
      if (answeredCount % 3 === 0) {
        const meta = await qRepo.getOwnPatientMeta(ctx);
        if (meta) {
          const res = await runDangerCheck(
            { clinicId: ctx.clinicId!, questionnaireId: id },
            buildAiContext(meta, q, questions)
          );
          if (res.ok && res.data.danger) {
            danger = {
              level: "L1",
              hits: res.data.categories.map((c) => ({
                ruleKey: `ai:${c}`,
                label: c,
                level: "L1" as const,
              })),
              suicideRisk: res.data.suicide_risk,
            };
          }
        }
      }
    }

    const isNewEmergency =
      !q.emergencyFlagged && (danger.level === "L1" || danger.suicideRisk);
    if (isNewEmergency) {
      await qRepo.flagEmergency(ctx, id);
      await audit(ctx, "questionnaire.emergency_flagged", {
        resourceType: "questionnaire",
        resourceId: id,
        patientId: ctx.patientId,
        metadata: { hits: danger.hits.map((h) => h.ruleKey), phase: "interview" },
      });
    }

    return NextResponse.json({
      saved: true,
      emergency: isNewEmergency
        ? { flagged: true, kind: danger.suicideRisk ? "suicide" : "general" }
        : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
