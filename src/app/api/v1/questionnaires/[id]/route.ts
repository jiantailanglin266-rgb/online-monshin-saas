import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { evaluateDangerRules } from "@/lib/triage/rules";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  chiefComplaintCategory: z.string().max(30).optional(),
  chiefComplaintText: z.string().max(2000).optional(),
  onset: z.enum(["today", "few_days", "one_week", "over_month", "unknown"]).optional(),
  painScale: z.number().int().min(0).max(10).nullable().optional(),
  bodyTemp: z.number().min(30).max(45).nullable().optional(),
  historySnapshot: z.array(z.string().max(200)).max(30).optional(),
  medicationsSnapshot: z.array(z.string().max(200)).max(30).optional(),
  allergiesSnapshot: z.array(z.string().max(200)).max(30).optional(),
  pregnancyStatus: z
    .enum(["pregnant", "possible", "no", "not_applicable", "no_answer"])
    .optional(),
  lifestyle: z
    .object({
      smoking: z.string().max(30).optional(),
      alcohol: z.string().max(30).optional(),
      sleep: z.string().max(30).optional(),
    })
    .optional(),
  freeText: z.string().max(2000).optional(),
  currentStep: z.number().int().min(1).max(7).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const q = await questionnaireRepo().findOwn(ctx, id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "問診が見つかりません");
    return NextResponse.json(q);
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * ステップ回答の保存。
 * 保存のたびにルールベース危険判定を同期実行し、L1級・自殺リスクの初回検知時は
 * レスポンスに emergency を含める（クライアントが S-07E へ遷移）。PHASE4 §2.2
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "入力内容をご確認ください" } },
        { status: 400 }
      );
    }

    const repo = questionnaireRepo();
    const before = await repo.findOwn(ctx, id);
    if (!before) throw new ApiError(404, "NOT_FOUND", "問診が見つかりません");
    const wasFlagged = before.emergencyFlagged;

    const q = await repo.applyPatch(ctx, id, parsed.data);
    if (!q) {
      throw new ApiError(409, "INVALID_STATUS_TRANSITION", "この問診は編集できません");
    }

    const result = evaluateDangerRules(q);
    const isNewEmergency = !wasFlagged && (result.level === "L1" || result.suicideRisk);
    if (isNewEmergency) {
      await repo.flagEmergency(ctx, id);
      await audit(ctx, "questionnaire.emergency_flagged", {
        resourceType: "questionnaire",
        resourceId: id,
        patientId: ctx.patientId,
        metadata: { hits: result.hits.map((h) => h.ruleKey), suicideRisk: result.suicideRisk },
      });
      // クリニックへの即時通知は Phase 10（通知基盤）で接続
    }

    return NextResponse.json({
      saved: true,
      emergency: isNewEmergency
        ? { flagged: true, kind: result.suicideRisk ? "suicide" : "general" }
        : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
