"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { departmentLabel, type TriageLevel } from "@/lib/types/questionnaire";

/**
 * S-07 結果表示。final_level の定型文言・科目候補・免責のみ。
 * AI判定根拠・SOAP・uncertain は患者に出さない（PHASE4 §5・薬機法配慮）。
 */

const LEVEL_VIEW: Record<
  TriageLevel,
  { badge: string; headline: string; body: string; tone: string; badgeTone: string }
> = {
  L1: {
    badge: "🔴",
    headline: "すぐに救急要請（119）または救急外来の受診をご検討ください",
    body: "ご入力の内容には、早急な対応が必要な可能性のある症状が含まれています。",
    tone: "border-l1/40 bg-l1-soft",
    badgeTone: "text-l1",
  },
  L2: {
    badge: "🟠",
    headline: "本日中の受診をおすすめします",
    body: "ご入力内容から、早めに医師に相談されることをおすすめします。",
    tone: "border-l2/40 bg-l2-soft",
    badgeTone: "text-l2",
  },
  L3: {
    badge: "🔵",
    headline: "通常の診療でご相談ください",
    body: "ご入力内容は医師に共有されます。ご都合のよいタイミングでご相談ください。",
    tone: "border-l3/40 bg-l3-soft",
    badgeTone: "text-l3",
  },
  L4: {
    badge: "⚪",
    headline: "まずは様子を見ることも考えられます",
    body: "ご心配な場合や、症状が続く・強くなるときは、いつでも受診いただけます。",
    tone: "border-l4/40 bg-l4-soft",
    badgeTone: "text-l4",
  },
};

interface ResultData {
  status: string;
  currentStep: number;
  level: TriageLevel | null;
  departments: string[];
}

export function ResultClient() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ResultData | null>(null);

  useEffect(() => {
    fetch(`/api/v1/questionnaires/${id}/result`).then(async (r) => {
      if (!r.ok) {
        router.replace("/mypage");
        return;
      }
      const d = (await r.json()) as ResultData;
      if (d.status === "draft") {
        router.replace(`/questionnaire/${id}/step/${d.currentStep}`);
        return;
      }
      if (d.status === "ai_interview") {
        router.replace(`/questionnaire/${id}/interview`);
        return;
      }
      setData(d);
    });
  }, [id, router]);

  if (!data) return <p className="text-[15px] text-ink-sub">読み込んでいます…</p>;

  const level: TriageLevel = data.level ?? "L3";
  const v = LEVEL_VIEW[level];

  return (
    <main className="grid gap-4">
      <h1 className="text-[22px] font-bold">問診が完了しました</h1>

      <div className={`grid gap-3 rounded-2xl border p-5 ${v.tone}`}>
        <p className={`text-[19px] font-bold leading-snug ${v.badgeTone}`}>
          {v.badge} {v.headline}
        </p>
        <p className="text-[16px]">{v.body}</p>

        {level === "L1" && (
          <div className="grid gap-2">
            <a href="tel:119"
              className="block min-h-14 rounded-xl bg-l1 px-5 py-3.5 text-center text-[18px] font-bold text-white">
              📞 119 に電話する（救急）
            </a>
            <a href="tel:%237119"
              className="block min-h-14 rounded-xl border border-l1 bg-surface px-5 py-3.5 text-center text-[18px] font-bold text-l1">
              📞 #7119（救急安心センター）
            </a>
          </div>
        )}
      </div>

      {data.departments.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-[15px] font-bold">ご相談先の候補</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.departments.map((d) => (
              <span key={d}
                className="rounded-lg bg-primary-soft px-3 py-1.5 text-[15px] font-bold text-primary">
                {departmentLabel(d)}
              </span>
            ))}
          </div>
        </div>
      )}

      {level !== "L1" && (
        <div className="grid gap-2">
          <div className="grid min-h-13 place-items-center rounded-xl bg-primary/50 px-5 font-bold text-white">
            {level === "L2" ? "本日の診療枠をみる" : "診療の予約をする"}
          </div>
          <p className="text-center text-[13px] text-ink-sub">
            オンライン診療の予約機能は Phase 10 で実装されます
          </p>
          <p className="mt-1 text-[14px] text-ink-sub">
            症状が急に悪くなったときは、救急相談（#7119）または 119 をご利用ください。
          </p>
        </div>
      )}

      <Link href="/mypage" className="text-center text-[15px] text-ink-sub underline">
        マイページへもどる
      </Link>

      <p className="border-t border-line pt-3 text-[13px] text-ink-sub">
        ⓘ この表示は受診の目安であり、診断ではありません。最終的な判断は医師が行います。
      </p>
    </main>
  );
}
