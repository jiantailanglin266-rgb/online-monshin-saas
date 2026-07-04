// NOTE: 静的デモ(GitHub Pages)のブラウザ内エンジンからも利用するため "server-only" は付けない。
// サーバー専用の秘匿情報はこのモジュールには置かないこと。
import { newId } from "@/lib/id";
import { isDemoMode } from "@/lib/env";
import type { AuthContext } from "@/lib/auth/types";
import type { AiQuestionItem, AiQuestionType } from "@/lib/types/questionnaire";
import { demoDb } from "@/lib/demo/store";

/** AI追加質問のリポジトリ。問診の所有権チェックは呼び出し側（questionnaireRepo.findOwn）が先に行う前提。 */

export interface NewAiQuestion {
  questionText: string;
  questionType: AiQuestionType;
  options: string[] | null;
  source: "ai" | "fallback";
}

export interface InterviewRepo {
  list(ctx: AuthContext, questionnaireId: string): Promise<AiQuestionItem[]>;
  add(ctx: AuthContext, questionnaireId: string, q: NewAiQuestion): Promise<AiQuestionItem>;
  answer(
    ctx: AuthContext,
    questionnaireId: string,
    questionId: string,
    answer: string | string[]
  ): Promise<AiQuestionItem | null>;
}

const demoRepo: InterviewRepo = {
  async list(ctx, questionnaireId) {
    return demoDb()
      .aiQuestions.filter(
        (q) => q.questionnaireId === questionnaireId && q.clinicId === ctx.clinicId
      )
      .sort((a, b) => a.seq - b.seq);
  },

  async add(ctx, questionnaireId, q) {
    const existing = await this.list(ctx, questionnaireId);
    const item = {
      id: newId(),
      questionnaireId,
      clinicId: ctx.clinicId!,
      seq: existing.length + 1,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      answer: null,
      answeredAt: null,
      source: q.source,
    };
    demoDb().aiQuestions.push(item);
    return item;
  },

  async answer(ctx, questionnaireId, questionId, answer) {
    const item = demoDb().aiQuestions.find(
      (q) =>
        q.id === questionId &&
        q.questionnaireId === questionnaireId &&
        q.clinicId === ctx.clinicId
    );
    if (!item || item.answeredAt) return null;
    item.answer = answer;
    item.answeredAt = new Date().toISOString();
    return item;
  },
};

type PrismaRow = {
  id: string;
  seq: number;
  questionText: string;
  questionType: string;
  options: unknown;
  answer: unknown;
  answeredAt: Date | null;
  source: string;
};

function toItem(row: PrismaRow): AiQuestionItem {
  return {
    id: row.id,
    seq: row.seq,
    questionText: row.questionText,
    questionType: row.questionType as AiQuestionType,
    options: (row.options as string[] | null) ?? null,
    answer: (row.answer as string | string[] | null) ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    source: row.source as "ai" | "fallback",
  };
}

const prismaRepo: InterviewRepo = {
  async list(ctx, questionnaireId) {
    const { prisma } = await import("@/lib/db/prisma");
    const rows = await prisma().aiQuestion.findMany({
      where: { questionnaireId, clinicId: ctx.clinicId! },
      orderBy: { seq: "asc" },
    });
    return rows.map((r) => toItem(r as unknown as PrismaRow));
  },

  async add(ctx, questionnaireId, q) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma();
    const count = await db.aiQuestion.count({
      where: { questionnaireId, clinicId: ctx.clinicId! },
    });
    const row = await db.aiQuestion.create({
      data: {
        questionnaireId,
        clinicId: ctx.clinicId!,
        seq: count + 1,
        questionText: q.questionText,
        questionType: q.questionType,
        options: (q.options ?? undefined) as never,
        source: q.source,
      },
    });
    return toItem(row as unknown as PrismaRow);
  },

  async answer(ctx, questionnaireId, questionId, answer) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma();
    const existing = await db.aiQuestion.findFirst({
      where: { id: questionId, questionnaireId, clinicId: ctx.clinicId!, answeredAt: null },
    });
    if (!existing) return null;
    const row = await db.aiQuestion.update({
      where: { id: existing.id },
      data: { answer: answer as never, answeredAt: new Date() },
    });
    return toItem(row as unknown as PrismaRow);
  },
};

export function interviewRepo(): InterviewRepo {
  return isDemoMode ? demoRepo : prismaRepo;
}
