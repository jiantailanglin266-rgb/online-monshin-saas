import { z } from "zod";

/** AI出力のJSON契約（AI_PROMPTS.md と1:1対応）。zodで構造検査する（SAFE-1 第一ガード） */

export const initialAnalysisSchema = z.object({
  symptom_structure: z.object({
    chief_complaint: z.string(),
    location: z.string().nullable(),
    quality: z.string().nullable(),
    timeline: z.string(),
    associated: z.array(z.string()),
  }),
  missing_info: z.array(z.string()),
  interview_plan: z
    .array(
      z.object({
        topic: z.string(),
        why: z.string().optional().default(""),
        urgency_related: z.boolean().optional().default(false),
      })
    )
    .max(8),
});
export type InitialAnalysisResult = z.infer<typeof initialAnalysisSchema>;

export const questionGenSchema = z.object({
  done: z.boolean(),
  question: z
    .object({
      text: z.string().min(1).max(80),
      type: z.enum(["single_choice", "multi_choice", "free_text"]),
      options: z.array(z.string().max(40)).min(2).max(5).nullable(),
      topic: z.string().optional().default(""),
    })
    .nullable(),
});
export type QuestionGenResult = z.infer<typeof questionGenSchema>;

export const triageSchema = z.object({
  level: z.enum(["L1", "L2", "L3", "L4"]),
  uncertain: z.boolean(),
  reasons: z.array(
    z.object({
      answer_ref: z.string(),
      finding: z.string(),
      weight: z.enum(["major", "minor"]),
    })
  ),
  escalation_note: z.string().nullable(),
});
export type TriageAiResult = z.infer<typeof triageSchema>;

const soapSentence = z.object({
  text: z.string(),
  refs: z.array(z.string()).default([]),
});

export const soapSchema = z.object({
  s: z.array(soapSentence),
  o: z.array(soapSentence),
  a: z.array(soapSentence),
  p: z.array(soapSentence),
});
export type SoapAiResult = z.infer<typeof soapSchema>;

export const departmentSchema = z.object({
  departments: z
    .array(
      z.object({
        code: z.enum([
          "internal",
          "dermatology",
          "ent",
          "pediatrics",
          "gynecology",
          "psychiatry",
          "orthopedics",
          "ophthalmology",
        ]),
        reason: z.string(),
      })
    )
    .min(1)
    .max(2),
});
export type DepartmentAiResult = z.infer<typeof departmentSchema>;

export const dangerCheckSchema = z.object({
  danger: z.boolean(),
  categories: z.array(z.string()),
  evidence: z.array(z.object({ answer_ref: z.string(), text: z.string() })),
  suicide_risk: z.boolean(),
});
export type DangerCheckResult = z.infer<typeof dangerCheckSchema>;

/**
 * 患者に露出するテキストの禁止表現（AI_PROMPTS.md §7 初版）。
 * 検知時はリトライ→フォールバック（SAFE-1 第二ガード）。
 */
const BANNED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /大丈夫/, label: "安心保証" },
  { re: /心配(いり|あり)ません/, label: "安心保証" },
  { re: /問題ありません/, label: "安心保証" },
  { re: /軽症/, label: "安心保証" },
  { re: /(病|症|炎|がん|癌)です/, label: "診断断定" },
  { re: /診断/, label: "診断言及" },
  { re: /(飲んで|服用して|塗って)(ください|みて)/, label: "服薬指示" },
  { re: /市販薬/, label: "服薬指示" },
  { re: /お薬を(飲|使)/, label: "服薬指示" },
  { re: /！！/, label: "不安を煽る表現" },
  { re: /死/, label: "不安を煽る表現" },
  { re: /[<>{}]/, label: "インジェクション痕跡" },
  { re: /https?:\/\//, label: "URL混入" },
];

export function findBannedPhrase(text: string): string | null {
  for (const p of BANNED_PATTERNS) {
    if (p.re.test(text)) return `${p.label}: ${p.re}`;
  }
  return null;
}
