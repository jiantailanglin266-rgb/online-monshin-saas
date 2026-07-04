// NOTE: 静的デモ(GitHub Pages)のブラウザ内エンジンからも利用するため "server-only" は付けない。
// サーバー専用の秘匿情報はこのモジュールには置かないこと。
import type { AiQuestionType, TemplateType } from "@/lib/types/questionnaire";

/**
 * AI障害時の定型追加質問（SAFE-7 / PHASE4 §4.6）。
 * source='fallback' として保存され、患者には区別なく表示される。
 */

export interface FallbackQuestion {
  text: string;
  type: AiQuestionType;
  options: string[] | null;
}

const COMMON: FallbackQuestion[] = [
  { text: "症状は良くなっていますか、悪くなっていますか？", type: "single_choice", options: ["良くなっている", "変わらない", "悪くなっている"] },
  { text: "食事や水分はとれていますか？", type: "single_choice", options: ["ふだん通りとれている", "少しとれている", "ほとんどとれていない"] },
  { text: "過去に同じような症状はありましたか？", type: "single_choice", options: ["ある", "ない", "わからない"] },
  { text: "ほかに気になる症状があれば教えてください", type: "free_text", options: null },
];

const BY_TEMPLATE: Record<TemplateType, FallbackQuestion[]> = {
  internal: COMMON,
  dermatology: [
    { text: "かゆみはありますか？", type: "single_choice", options: ["強いかゆみ", "少しかゆい", "かゆみはない"] },
    { text: "症状は広がってきていますか？", type: "single_choice", options: ["広がっている", "変わらない", "小さくなっている"] },
    ...COMMON,
  ],
};

export function nextFallbackQuestion(
  templateType: TemplateType,
  askedQuestionTexts: string[]
): FallbackQuestion | null {
  return BY_TEMPLATE[templateType].find((q) => !askedQuestionTexts.includes(q.text)) ?? null;
}
