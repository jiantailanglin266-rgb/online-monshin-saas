// NOTE: 静的デモ(GitHub Pages)のブラウザ内エンジンからも利用するため "server-only" は付けない。
// サーバー専用の秘匿情報はこのモジュールには置かないこと。
import type { Questionnaire, AiQuestionItem } from "@/lib/types/questionnaire";
import { categoryLabel, ONSET_OPTIONS } from "@/lib/types/questionnaire";
import type { PatientMeta } from "@/lib/repo/questionnaires";

/**
 * AIへ渡すコンテキストの唯一の組立点（PHASE4 §4.3）。
 * 氏名・カナ・連絡先・生年月日は型に存在しないため構造上含められない。
 */
export interface AiPatientContext {
  age: number;
  sex: string;
  pregnancyStatus: string | null;
  questionnaire: {
    templateType: string;
    chiefComplaintCategory: string;
    chiefComplaintText: string;
    onset: string;
    painScale: number | null;
    bodyTemp: number | null;
    history: string[];
    medications: string[];
    allergies: string[];
    lifestyle: Record<string, string | undefined>;
    freeText: string;
    imageCount: number;
  };
  qa: { q: string; a: string }[];
}

export function buildAiContext(
  meta: PatientMeta,
  q: Questionnaire,
  questions: AiQuestionItem[]
): AiPatientContext {
  return {
    age: meta.age,
    sex: meta.sex,
    pregnancyStatus: q.pregnancyStatus,
    questionnaire: {
      templateType: q.templateType,
      chiefComplaintCategory: categoryLabel(q.chiefComplaintCategory),
      chiefComplaintText: q.chiefComplaintText ?? "",
      onset: ONSET_OPTIONS.find((o) => o.key === q.onset)?.label ?? "未回答",
      painScale: q.painScale,
      bodyTemp: q.bodyTemp,
      history: q.historySnapshot,
      medications: q.medicationsSnapshot,
      allergies: q.allergiesSnapshot,
      lifestyle: q.lifestyle as Record<string, string | undefined>,
      freeText: q.freeText ?? "",
      imageCount: q.imageCount,
    },
    qa: questions
      .filter((x) => x.answeredAt)
      .map((x) => ({
        q: x.questionText,
        a: Array.isArray(x.answer) ? x.answer.join("、") : (x.answer ?? ""),
      })),
  };
}
