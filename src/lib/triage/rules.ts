import type { Questionnaire } from "@/lib/types/questionnaire";

/**
 * ルールベース危険判定エンジン（SAFE-2 の片翼）。
 * AI判定と独立して常時動作する。決定的（同じ入力→同じ出力）なので途中結果の保存は不要。
 * 方針：見落とし（false negative）最小化を優先し、過剰検知は許容する（Phase 1 R1）。
 */

export interface RuleHit {
  ruleKey: string;
  label: string;
  level: "L1" | "L2";
}

export interface RuleResult {
  level: "L1" | "L2" | null; // null = ヒットなし（L3/L4の判定はPhase 8で全体評価）
  hits: RuleHit[];
  suicideRisk: boolean;
}

const L1_KEYWORDS: [string, string][] = [
  ["息ができない", "呼吸困難の訴え"],
  ["呼吸が苦しい", "呼吸困難の訴え"],
  ["呼吸ができない", "呼吸困難の訴え"],
  ["意識がもうろう", "意識障害の示唆"],
  ["意識を失", "意識消失の示唆"],
  ["失神", "意識消失の示唆"],
  ["ろれつ", "構音障害の示唆（脳卒中サイン）"],
  ["呂律", "構音障害の示唆（脳卒中サイン）"],
  ["麻痺", "麻痺の訴え（脳卒中サイン）"],
  ["片側がしびれ", "片側性しびれ（脳卒中サイン）"],
  ["突然の激しい頭痛", "突然発症の激しい頭痛"],
  ["血を吐", "吐血の示唆"],
  ["吐血", "吐血の示唆"],
  ["下血", "下血の示唆"],
  ["黒い便", "黒色便の示唆"],
  ["血が止まらない", "持続する出血"],
  ["大量に出血", "大量出血"],
  ["けいれん", "けいれんの示唆"],
  ["唇が紫", "チアノーゼの示唆"],
];

const SUICIDE_KEYWORDS = [
  "死にたい",
  "消えたい",
  "自殺",
  "自傷",
  "リストカット",
  "生きていたくない",
  "いなくなりたい",
];

const L2_KEYWORDS: [string, string][] = [
  ["胸が痛", "胸痛の訴え"],
  ["胸の痛み", "胸痛の訴え"],
  ["動悸", "動悸の訴え"],
  ["どうき", "動悸の訴え"],
  ["息切れ", "息切れの訴え"],
  ["息苦し", "呼吸苦の訴え"],
  ["激しい痛み", "強い痛みの訴え"],
  ["高熱", "高熱の訴え"],
];

function collectText(q: Questionnaire): string {
  return [q.chiefComplaintText, q.freeText].filter(Boolean).join("\n");
}

/**
 * 任意テキスト（AI追加質問への回答等）の危険キーワード走査。
 * 問診全体の評価（evaluateDangerRules）からも利用される。
 */
export function evaluateTextDanger(text: string): RuleResult {
  const hits: RuleHit[] = [];
  let suicideRisk = false;

  for (const kw of SUICIDE_KEYWORDS) {
    if (text.includes(kw)) {
      suicideRisk = true;
      hits.push({ ruleKey: `kw_suicide`, label: "自傷・自殺念慮の示唆", level: "L1" });
      break;
    }
  }
  for (const [kw, label] of L1_KEYWORDS) {
    if (text.includes(kw)) hits.push({ ruleKey: `kw_l1:${kw}`, label, level: "L1" });
  }
  for (const [kw, label] of L2_KEYWORDS) {
    if (text.includes(kw)) hits.push({ ruleKey: `kw_l2:${kw}`, label, level: "L2" });
  }
  const level = hits.some((h) => h.level === "L1") ? "L1" : hits.length > 0 ? "L2" : null;
  return { level, hits, suicideRisk };
}

export function evaluateDangerRules(
  q: Questionnaire,
  meta?: { age?: number }
): RuleResult {
  const text = collectText(q);
  const textResult = evaluateTextDanger(text);
  const hits: RuleHit[] = [...textResult.hits];
  const suicideRisk = textResult.suicideRisk;

  // 属性による重み付け（妊娠・高齢は一段上げる：AI_PROMPTS.md ③判定ルール2のルール側実装）
  const pregnant = q.pregnancyStatus === "pregnant" || q.pregnancyStatus === "possible";
  if (pregnant && (q.chiefComplaintCategory === "stomach" || text.includes("出血"))) {
    hits.push({ ruleKey: "preg_abdomen", label: "妊娠中の腹痛・出血の訴え", level: "L2" });
  }
  if (meta?.age != null && meta.age >= 65 && q.bodyTemp != null && q.bodyTemp >= 38.0) {
    hits.push({ ruleKey: "elderly_fever", label: "65歳以上の発熱（38.0℃以上）", level: "L2" });
  }

  // カテゴリ由来
  if (q.chiefComplaintCategory === "chest") {
    hits.push({ ruleKey: "cat_chest", label: "主訴：胸の痛み・どうき", level: "L2" });
  }
  if (q.chiefComplaintCategory === "breath") {
    hits.push({ ruleKey: "cat_breath", label: "主訴：息苦しさ", level: "L2" });
  }
  // 胸痛カテゴリ × 呼吸苦テキスト は L1 に格上げ（心筋梗塞様の組み合わせ）
  const hasBreathText = ["息苦し", "呼吸", "息切れ"].some((k) => text.includes(k));
  if (q.chiefComplaintCategory === "chest" && hasBreathText) {
    hits.push({ ruleKey: "combo_chest_breath", label: "胸痛＋呼吸苦の組み合わせ", level: "L1" });
  }

  // バイタル閾値
  if (q.bodyTemp != null) {
    if (q.bodyTemp >= 40.5) {
      hits.push({ ruleKey: "temp_405", label: `体温 ${q.bodyTemp}℃（40.5℃以上）`, level: "L1" });
    } else if (q.bodyTemp >= 39.0) {
      hits.push({ ruleKey: "temp_39", label: `体温 ${q.bodyTemp}℃（39.0℃以上）`, level: "L2" });
    }
  }
  if (q.painScale != null && q.painScale >= 9) {
    hits.push({ ruleKey: "pain_9", label: `痛みの強さ ${q.painScale}/10`, level: "L2" });
  }

  const level = hits.some((h) => h.level === "L1") ? "L1" : hits.length > 0 ? "L2" : null;
  return { level, hits, suicideRisk };
}
