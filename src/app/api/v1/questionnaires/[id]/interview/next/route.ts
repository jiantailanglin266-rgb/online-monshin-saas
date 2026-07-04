import { NextResponse, type NextRequest } from "next/server";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { interviewRepo } from "@/lib/repo/interview";
import { buildAiContext } from "@/lib/ai/context";
import { runInitialAnalysis, runQuestionGen } from "@/lib/ai/gateway";
import { nextFallbackQuestion } from "@/lib/ai/fallback";
import { MAX_AI_QUESTIONS, type InterviewPlan } from "@/lib/types/questionnaire";

type Params = { params: Promise<{ id: string }> };

/**
 * 次の追加質問を返す。
 * - 未回答の質問があればそれを返す（生成しない：連打・リロードでのAI多重呼び出し防止）
 * - 8問到達・プラン消化・AIがdone → done:true
 * - AI障害時は定型質問（source='fallback'）
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const qRepo = questionnaireRepo();
    const iRepo = interviewRepo();

    const q = await qRepo.findOwn(ctx, id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "問診が見つかりません");
    if (q.status !== "ai_interview") {
      throw new ApiError(409, "INVALID_STATUS_TRANSITION", "追加質問を受け付けていない状態です");
    }

    const questions = await iRepo.list(ctx, id);
    const unanswered = questions.find((x) => !x.answeredAt);
    if (unanswered) return NextResponse.json({ done: false, question: unanswered });

    if (questions.length >= MAX_AI_QUESTIONS) {
      return NextResponse.json({ done: true });
    }

    const meta = await qRepo.getOwnPatientMeta(ctx);
    if (!meta) throw new ApiError(404, "NOT_FOUND", "患者情報が見つかりません");
    const aiCtx = buildAiContext(meta, q, questions);
    const env = { clinicId: ctx.clinicId!, questionnaireId: id };

    // interview_plan が無ければこの場で生成（submit時のAI①が失敗していても復旧できる）
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
        if (gen.data.done || !gen.data.question) return NextResponse.json({ done: true });
        // 既出質問と同一文はアプリ層でも弾く（PHASE7メモ §3）
        if (!asked.includes(gen.data.question.text)) {
          const created = await iRepo.add(ctx, id, {
            questionText: gen.data.question.text,
            questionType: gen.data.question.type,
            options: gen.data.question.options,
            source: "ai",
          });
          return NextResponse.json({ done: false, question: created });
        }
      }
    }

    // フォールバック：定型質問
    const fb = nextFallbackQuestion(q.templateType, asked);
    if (!fb) return NextResponse.json({ done: true });
    const created = await iRepo.add(ctx, id, {
      questionText: fb.text,
      questionType: fb.type,
      options: fb.options,
      source: "fallback",
    });
    return NextResponse.json({ done: false, question: created });
  } catch (e) {
    return errorResponse(e);
  }
}
