import { NextResponse, type NextRequest } from "next/server";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { triageRepo } from "@/lib/repo/triage";

type Params = { params: Promise<{ id: string }> };

/**
 * 患者向け結果（S-07用）。final_level と科目候補のみ。
 * AI判定根拠・SOAP・uncertain は返さない（PHASE4 §5・薬機法配慮）。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const q = await questionnaireRepo().findOwn(ctx, id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "問診が見つかりません");
    const triage = await triageRepo().latest(ctx, id);
    return NextResponse.json({
      status: q.status,
      currentStep: q.currentStep,
      level: triage?.finalLevel ?? null,
      departments: q.suggestedDepartments,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
