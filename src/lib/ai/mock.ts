import "server-only";
import type { AiPatientContext } from "@/lib/ai/context";
import type {
  DangerCheckResult,
  DepartmentAiResult,
  InitialAnalysisResult,
  QuestionGenResult,
  SoapAiResult,
  TriageAiResult,
} from "@/lib/ai/schemas";
import { evaluateTextDanger, type RuleResult } from "@/lib/triage/rules";

/**
 * デモモード専用のモックAI。
 * カテゴリ別の決定的テンプレートで interview_plan と質問を生成する。
 * 本番系（APIキー設定時）はここに到達しない（gateway が分岐）。
 */

const PLAN_BY_CATEGORY: Record<string, string[]> = {
  "発熱・かぜ症状": [
    "息苦しさの有無",
    "せき・たんの様子",
    "のどの痛み",
    "食事と水分",
    "まわりの感染状況",
    "過去の同様症状",
  ],
  "頭痛": ["痛みの起こり方", "吐き気の有無", "目の見えにくさ", "過去の頭痛歴", "痛み止めの使用状況"],
  "胸の痛み・どうき": ["痛みの起こり方", "息苦しさの有無", "冷や汗の有無", "痛みの広がり", "過去の同様症状"],
  "息苦しさ・せき": ["安静時の息苦しさ", "せき・たんの様子", "発熱の有無", "喫煙の影響", "過去の同様症状"],
  "腹痛・胃の不調": ["痛みの場所", "痛みの起こり方", "吐き気の有無", "便の様子", "食事との関係"],
  "吐き気・おう吐": ["おう吐の回数", "水分がとれるか", "腹痛の有無", "食べたものとの関係"],
  "下痢・便の異常": ["便の回数と様子", "血が混じるか", "発熱の有無", "水分がとれるか"],
  "皮膚の症状": ["かゆみの有無", "症状の広がり方", "きっかけの心当たり", "過去の同様症状", "市販薬などの使用状況"],
  "けが・からだの痛み": ["きっかけの有無", "痛む場所と広がり", "動かせるか", "はれ・変形の有無"],
  "こころの不調": ["睡眠の様子", "食欲の変化", "気分の落ち込みの程度", "日常生活への影響", "相談できる相手"],
  "その他": ["症状の詳しい様子", "きっかけの心当たり", "過去の同様症状", "日常生活への影響"],
};

const QUESTION_BY_TOPIC: Record<
  string,
  { text: string; type: "single_choice" | "multi_choice" | "free_text"; options: string[] | null }
> = {
  "息苦しさの有無": { text: "息苦しさはありますか？", type: "single_choice", options: ["はい", "いいえ", "わからない"] },
  "安静時の息苦しさ": { text: "じっとしていても息苦しいですか？", type: "single_choice", options: ["はい", "いいえ", "わからない"] },
  "せき・たんの様子": { text: "せきやたんは出ていますか？", type: "single_choice", options: ["せきだけ出る", "たんも出る", "出ていない"] },
  "のどの痛み": { text: "のどの痛みはありますか？", type: "single_choice", options: ["はい", "いいえ"] },
  "食事と水分": { text: "食事や水分はとれていますか？", type: "single_choice", options: ["ふだん通りとれている", "少しとれている", "ほとんどとれていない"] },
  "まわりの感染状況": { text: "まわりに同じような症状の方はいますか？", type: "single_choice", options: ["いる", "いない", "わからない"] },
  "過去の同様症状": { text: "過去に同じような症状はありましたか？", type: "single_choice", options: ["ある", "ない", "わからない"] },
  "痛みの起こり方": { text: "痛みは突然はじまりましたか？", type: "single_choice", options: ["突然はじまった", "だんだん強くなった", "わからない"] },
  "吐き気の有無": { text: "吐き気やおう吐はありますか？", type: "single_choice", options: ["吐き気がある", "吐いてしまった", "ない"] },
  "目の見えにくさ": { text: "目の見えにくさはありますか？", type: "single_choice", options: ["はい", "いいえ", "わからない"] },
  "過去の頭痛歴": { text: "ふだんから頭痛はありますか？", type: "single_choice", options: ["よくある", "ときどきある", "ほとんどない"] },
  "痛み止めの使用状況": { text: "痛み止めは使いましたか？", type: "single_choice", options: ["使った（効いた）", "使った（効かなかった）", "使っていない"] },
  "冷や汗の有無": { text: "冷や汗は出ていますか？", type: "single_choice", options: ["はい", "いいえ", "わからない"] },
  "痛みの広がり": { text: "痛みは肩や腕、あごに広がりますか？", type: "single_choice", options: ["広がる", "広がらない", "わからない"] },
  "発熱の有無": { text: "熱っぽさはありますか？", type: "single_choice", options: ["はい", "いいえ", "わからない"] },
  "喫煙の影響": { text: "たばこを吸うと症状は強くなりますか？", type: "single_choice", options: ["強くなる", "変わらない", "吸わない"] },
  "痛みの場所": { text: "おなかのどのあたりが痛みますか？", type: "single_choice", options: ["みぞおち", "右下", "左下", "全体", "わからない"] },
  "便の様子": { text: "便に変わった様子はありますか？", type: "single_choice", options: ["ゆるい・下痢", "かたい・便秘", "ふだん通り", "わからない"] },
  "食事との関係": { text: "食事のあとに症状は強くなりますか？", type: "single_choice", options: ["強くなる", "変わらない", "わからない"] },
  "おう吐の回数": { text: "今日は何回くらい吐きましたか？", type: "single_choice", options: ["1〜2回", "3〜5回", "6回以上", "吐いていない"] },
  "水分がとれるか": { text: "水分はとれていますか？", type: "single_choice", options: ["とれている", "少しとれている", "ほとんどとれない"] },
  "腹痛の有無": { text: "おなかの痛みはありますか？", type: "single_choice", options: ["はい", "いいえ"] },
  "食べたものとの関係": { text: "思い当たる食べものはありますか？", type: "free_text", options: null },
  "便の回数と様子": { text: "下痢は1日に何回くらいですか？", type: "single_choice", options: ["1〜3回", "4〜6回", "7回以上"] },
  "血が混じるか": { text: "便に血が混じっていますか？", type: "single_choice", options: ["混じっている", "混じっていない", "わからない"] },
  "かゆみの有無": { text: "かゆみはありますか？", type: "single_choice", options: ["強いかゆみ", "少しかゆい", "かゆみはない"] },
  "症状の広がり方": { text: "症状は広がってきていますか？", type: "single_choice", options: ["広がっている", "変わらない", "小さくなっている"] },
  "きっかけの心当たり": { text: "きっかけに心当たりはありますか？", type: "free_text", options: null },
  "市販薬などの使用状況": { text: "何かお薬や塗り薬を使いましたか？", type: "free_text", options: null },
  "きっかけの有無": { text: "けがのきっかけはありますか？", type: "single_choice", options: ["ぶつけた・ひねった", "思い当たらない", "わからない"] },
  "痛む場所と広がり": { text: "痛む場所を教えてください", type: "free_text", options: null },
  "動かせるか": { text: "痛いところは動かせますか？", type: "single_choice", options: ["動かせる", "痛くて動かせない", "わからない"] },
  "はれ・変形の有無": { text: "はれや変形はありますか？", type: "single_choice", options: ["はれている", "変形している", "どちらもない"] },
  "睡眠の様子": { text: "眠れていますか？", type: "single_choice", options: ["眠れている", "寝つきが悪い", "途中で目が覚める", "ほとんど眠れない"] },
  "食欲の変化": { text: "食欲はいかがですか？", type: "single_choice", options: ["ふだん通り", "少し落ちている", "かなり落ちている"] },
  "気分の落ち込みの程度": { text: "気分の落ち込みはどのくらい続いていますか？", type: "single_choice", options: ["数日", "2週間以上", "1か月以上", "わからない"] },
  "日常生活への影響": { text: "仕事や家事など、日常生活に影響はありますか？", type: "single_choice", options: ["大きく影響している", "少し影響している", "あまり影響はない"] },
  "相談できる相手": { text: "身近に相談できる方はいますか？", type: "single_choice", options: ["いる", "いない", "答えたくない"] },
  "症状の詳しい様子": { text: "症状についてもう少し教えてください", type: "free_text", options: null },
};

export function mockInitialAnalysis(ctx: AiPatientContext): InitialAnalysisResult {
  const topics = PLAN_BY_CATEGORY[ctx.questionnaire.chiefComplaintCategory] ?? PLAN_BY_CATEGORY["その他"];
  return {
    symptom_structure: {
      chief_complaint: ctx.questionnaire.chiefComplaintText || ctx.questionnaire.chiefComplaintCategory,
      location: null,
      quality: null,
      timeline: ctx.questionnaire.onset,
      associated: [],
    },
    missing_info: topics,
    interview_plan: topics.map((t, i) => ({ topic: t, why: "", urgency_related: i === 0 })),
  };
}

export function mockQuestionGen(
  plan: { topic: string }[],
  askedQuestionTexts: string[],
  remaining: number
): QuestionGenResult {
  if (remaining <= 0) return { done: true, question: null };
  for (const { topic } of plan) {
    const t = QUESTION_BY_TOPIC[topic] ?? {
      text: `${topic}について教えてください`,
      type: "free_text" as const,
      options: null,
    };
    if (!askedQuestionTexts.includes(t.text)) {
      return { done: false, question: { ...t, topic } };
    }
  }
  return { done: true, question: null };
}

/** モック③緊急度：ルール結果＋簡易ヒューリスティックで4分類を再現 */
export function mockTriage(ctx: AiPatientContext, rule: RuleResult): TriageAiResult {
  const qn = ctx.questionnaire;
  const reasons: TriageAiResult["reasons"] = [];
  let level: TriageAiResult["level"] = "L3";

  if (rule.level === "L1") {
    level = "L1";
    reasons.push(
      ...rule.hits
        .filter((h) => h.level === "L1")
        .slice(0, 3)
        .map((h) => ({ answer_ref: "rule", finding: h.label, weight: "major" as const }))
    );
  } else if (rule.level === "L2") {
    level = "L2";
    reasons.push(
      ...rule.hits.slice(0, 3).map((h) => ({
        answer_ref: "rule",
        finding: h.label,
        weight: "major" as const,
      }))
    );
  } else if ((qn.bodyTemp != null && qn.bodyTemp >= 38.5) || (qn.painScale ?? 0) >= 7) {
    level = "L2";
    if (qn.bodyTemp != null && qn.bodyTemp >= 38.5) {
      reasons.push({ answer_ref: "step:body_temp", finding: `体温 ${qn.bodyTemp}℃`, weight: "major" });
    }
    if ((qn.painScale ?? 0) >= 7) {
      reasons.push({ answer_ref: "step:pain_scale", finding: `痛みの強さ ${qn.painScale}/10`, weight: "major" });
    }
  } else if (
    qn.onset === "1か月以上前から" &&
    (qn.painScale ?? 0) <= 2 &&
    (qn.bodyTemp == null || qn.bodyTemp < 37.5)
  ) {
    level = "L4";
    reasons.push({
      answer_ref: "step:onset",
      finding: "1か月以上の経過で強い症状・発熱がない",
      weight: "minor",
    });
  } else {
    reasons.push({
      answer_ref: "step:chief_complaint",
      finding: "強い緊急性を示す回答は見られない",
      weight: "minor",
    });
  }
  return { level, uncertain: false, reasons, escalation_note: null };
}

const A_BY_CATEGORY: Record<string, string[]> = {
  "発熱・かぜ症状": ["発熱の経過と全身状態の確認", "呼吸器症状の増悪の有無の確認", "水分摂取状況の確認"],
  "頭痛": ["発症様式（突然か漸増か）の確認", "神経学的所見の確認", "随伴症状（吐き気・視覚異常）の確認"],
  "胸の痛み・どうき": ["胸痛の性状・持続時間の確認", "労作との関連の確認", "循環器リスク因子の確認"],
  "息苦しさ・せき": ["呼吸状態の評価", "咳・痰の性状の確認", "喫煙歴との関連の確認"],
  "腹痛・胃の不調": ["腹痛の部位・性状の確認", "腹膜刺激症状の確認", "食事・排便との関連の確認"],
  "皮膚の症状": ["皮疹の性状・分布の視診", "接触歴・アレルギー歴との関連の確認", "感染性の除外の検討"],
  "こころの不調": ["抑うつ状態の程度の評価", "希死念慮の有無の確認", "睡眠・食欲など生活機能への影響の確認"],
};

/** モック④SOAP：回答の機械的な構造化（AI障害時のフォールバックとしても使用） */
export function mockSoap(ctx: AiPatientContext): SoapAiResult {
  const qn = ctx.questionnaire;
  const s: SoapAiResult["s"] = [];
  if (qn.chiefComplaintText) {
    s.push({ text: `「${qn.chiefComplaintText}」との訴え。`, refs: ["step:chief_complaint"] });
  }
  s.push({ text: `主訴カテゴリ：${qn.chiefComplaintCategory}。発症時期：${qn.onset}。`, refs: ["step:onset"] });
  ctx.qa.forEach((x, i) => {
    if (x.a) s.push({ text: `${x.q} → ${x.a}`, refs: [`ai_q:${i + 1}`] });
  });
  if (qn.freeText) s.push({ text: `患者記載：「${qn.freeText}」`, refs: ["step:free_text"] });

  const o: SoapAiResult["o"] = [
    { text: `体温：${qn.bodyTemp != null ? `${qn.bodyTemp}℃` : "未計測"}`, refs: ["step:body_temp"] },
    { text: `痛みNRS：${qn.painScale ?? "未回答"}`, refs: ["step:pain_scale"] },
    { text: `既往歴：${qn.history.length ? qn.history.join("、") : "申告なし"}`, refs: ["step:history"] },
    { text: `服薬中：${qn.medications.length ? qn.medications.join("、") : "申告なし"}`, refs: ["step:medications"] },
    { text: `アレルギー：${qn.allergies.length ? qn.allergies.join("、") : "申告なし"}`, refs: ["step:allergies"] },
  ];
  if (ctx.pregnancyStatus && ctx.pregnancyStatus !== "not_applicable") {
    o.push({ text: `妊娠：${ctx.pregnancyStatus}`, refs: ["step:pregnancy"] });
  }
  if (qn.imageCount > 0) o.push({ text: `添付画像 ${qn.imageCount} 枚`, refs: ["images"] });

  const aTexts = A_BY_CATEGORY[qn.chiefComplaintCategory] ?? ["主訴に関連する身体所見の確認", "症状の経過（増悪・改善）の確認"];
  const a = aTexts.map((t) => ({ text: t, refs: ["step:chief_complaint"] }));

  const p: SoapAiResult["p"] = [
    { text: "症状の経過（増悪・改善傾向）の確認", refs: [] },
    { text: "生活への影響と受診希望の確認", refs: [] },
  ];
  return { s, o, a, p };
}

const DEPT_BY_CATEGORY: Record<string, string> = {
  "発熱・かぜ症状": "internal",
  "頭痛": "internal",
  "胸の痛み・どうき": "internal",
  "息苦しさ・せき": "internal",
  "腹痛・胃の不調": "internal",
  "吐き気・おう吐": "internal",
  "下痢・便の異常": "internal",
  "皮膚の症状": "dermatology",
  "けが・からだの痛み": "orthopedics",
  "こころの不調": "psychiatry",
  "その他": "internal",
};

/** モック⑤科目提案（AI障害時の静的マッピングとしても使用） */
export function mockDepartment(ctx: AiPatientContext): DepartmentAiResult {
  const primary = DEPT_BY_CATEGORY[ctx.questionnaire.chiefComplaintCategory] ?? "internal";
  const departments: DepartmentAiResult["departments"] = [];
  if (ctx.age <= 15) {
    departments.push({ code: "pediatrics", reason: "15歳以下" });
  }
  if (!departments.some((d) => d.code === primary)) {
    departments.push({ code: primary as DepartmentAiResult["departments"][number]["code"], reason: "主訴カテゴリより" });
  }
  return { departments: departments.slice(0, 2) };
}

export function mockDangerCheck(ctx: AiPatientContext): DangerCheckResult {
  const text = [
    ctx.questionnaire.chiefComplaintText,
    ctx.questionnaire.freeText,
    ...ctx.qa.map((x) => x.a),
  ].join("\n");
  const r = evaluateTextDanger(text);
  return {
    danger: r.level === "L1" || r.suicideRisk,
    categories: r.hits.map((h) => h.label),
    evidence: [],
    suicide_risk: r.suicideRisk,
  };
}
