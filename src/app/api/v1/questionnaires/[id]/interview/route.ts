import { NextResponse, type NextRequest } from "next/server";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { interviewRepo } from "@/lib/repo/interview";
import { MAX_AI_QUESTIONS } from "@/lib/types/questionnaire";

type Params = { params: Promise<{ id: string }> };

/** インタビュー状態の取得（チャット再現用） */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const q = await questionnaireRepo().findOwn(ctx, id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "問診が見つかりません");
    const questions = await interviewRepo().list(ctx, id);
    const answered = questions.filter((x) => x.answeredAt).length;
    return NextResponse.json({
      status: q.status,
      questions,
      answeredCount: answered,
      maxQuestions: MAX_AI_QUESTIONS,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
