export type TemplateType = "internal" | "dermatology";

export type QStatus =
  | "draft"
  | "ai_interview"
  | "triaged"
  | "doctor_reviewed"
  | "consulted"
  | "abandoned";

export interface Lifestyle {
  smoking?: string;
  alcohol?: string;
  sleep?: string;
}

/** リポジトリ層・API・UIで共有する問診の形。PIIは含まない（患者名は載せない）。 */
export interface Questionnaire {
  id: string;
  clinicId: string;
  patientId: string;
  templateType: TemplateType;
  status: QStatus;
  emergencyFlagged: boolean;
  chiefComplaintCategory: string | null;
  chiefComplaintText: string | null;
  onset: string | null;
  painScale: number | null;
  bodyTemp: number | null; // null = 未計測
  historySnapshot: string[];
  medicationsSnapshot: string[];
  allergiesSnapshot: string[];
  pregnancyStatus: string | null;
  lifestyle: Lifestyle;
  freeText: string | null;
  currentStep: number;
  submittedAt: string | null;
  createdAt: string;
  imageCount: number;
  interviewPlan: InterviewPlan | null;
  suggestedDepartments: string[];
}

/** PATCH で更新できるフィールド（部分更新） */
export interface QuestionnairePatch {
  chiefComplaintCategory?: string;
  chiefComplaintText?: string;
  onset?: string;
  painScale?: number | null;
  bodyTemp?: number | null;
  historySnapshot?: string[];
  medicationsSnapshot?: string[];
  allergiesSnapshot?: string[];
  pregnancyStatus?: string;
  lifestyle?: Lifestyle;
  freeText?: string;
  currentStep?: number;
}

export interface InterviewTopic {
  topic: string;
  why?: string;
  urgencyRelated?: boolean;
}

export interface InterviewPlan {
  topics: InterviewTopic[];
}

export type AiQuestionType = "single_choice" | "multi_choice" | "free_text";

export interface AiQuestionItem {
  id: string;
  seq: number;
  questionText: string;
  questionType: AiQuestionType;
  options: string[] | null;
  answer: string | string[] | null;
  answeredAt: string | null;
  source: "ai" | "fallback";
}

export const MAX_AI_QUESTIONS = 8;

export type TriageLevel = "L1" | "L2" | "L3" | "L4";

const SEVERITY: Record<TriageLevel, number> = { L1: 4, L2: 3, L3: 2, L4: 1 };

/** 重症側を返す（final_level = max(ai, rule) の合成に使用） */
export function maxSeverity(a: TriageLevel, b: TriageLevel): TriageLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

export function severityRank(l: TriageLevel): number {
  return SEVERITY[l];
}

export interface TriageResultItem {
  id: string;
  finalLevel: TriageLevel;
  aiLevel: TriageLevel | null;
  ruleLevel: TriageLevel;
  aiReasons: unknown;
  ruleHits: unknown;
  createdAt: string;
}

export interface SoapSentence {
  text: string;
  refs: string[];
}

export interface SoapData {
  s: SoapSentence[];
  o: SoapSentence[];
  a: SoapSentence[];
  p: SoapSentence[];
}

export const DEPARTMENTS: Record<string, string> = {
  internal: "内科",
  dermatology: "皮膚科",
  ent: "耳鼻咽喉科",
  pediatrics: "小児科",
  gynecology: "婦人科",
  psychiatry: "精神科・心療内科",
  orthopedics: "整形外科",
  ophthalmology: "眼科",
};

export function departmentLabel(code: string): string {
  return DEPARTMENTS[code] ?? code;
}

export const TOTAL_STEPS = 7;

export const CATEGORIES: { key: string; label: string }[] = [
  { key: "fever", label: "発熱・かぜ症状" },
  { key: "headache", label: "頭痛" },
  { key: "chest", label: "胸の痛み・どうき" },
  { key: "breath", label: "息苦しさ・せき" },
  { key: "stomach", label: "腹痛・胃の不調" },
  { key: "nausea", label: "吐き気・おう吐" },
  { key: "bowel", label: "下痢・便の異常" },
  { key: "skin", label: "皮膚の症状" },
  { key: "injury", label: "けが・からだの痛み" },
  { key: "mental", label: "こころの不調" },
  { key: "other", label: "その他" },
];

export const ONSET_OPTIONS: { key: string; label: string }[] = [
  { key: "today", label: "今日から" },
  { key: "few_days", label: "2〜3日前から" },
  { key: "one_week", label: "1週間くらい前から" },
  { key: "over_month", label: "1か月以上前から" },
  { key: "unknown", label: "はっきりしない" },
];

export const PREGNANCY_OPTIONS: { key: string; label: string }[] = [
  { key: "no", label: "妊娠していない" },
  { key: "pregnant", label: "妊娠している" },
  { key: "possible", label: "妊娠の可能性がある" },
  { key: "no_answer", label: "回答しない" },
];

export function categoryLabel(key: string | null): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? "—";
}
