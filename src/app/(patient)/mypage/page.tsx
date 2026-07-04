"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { categoryLabel, type Questionnaire } from "@/lib/types/questionnaire";
import { Card } from "@/components/ui/Card";

const statusLabel: Record<string, string> = {
  draft: "入力の途中です",
  ai_interview: "送信済み",
  triaged: "送信済み",
  doctor_reviewed: "医師確認済み",
  consulted: "診療済み",
  abandoned: "中断",
};

function qLink(q: Questionnaire): string {
  if (q.status === "draft") return `/questionnaire/${q.id}/step/${q.currentStep}`;
  if (q.status === "ai_interview") return `/questionnaire/${q.id}/interview`;
  return `/questionnaire/${q.id}/result`;
}

export default function MyPage() {
  const [list, setList] = useState<Questionnaire[] | null>(null);

  useEffect(() => {
    fetch("/api/v1/questionnaires")
      .then((r) => (r.ok ? r.json() : { questionnaires: [] }))
      .then((b) => setList(b.questionnaires ?? []));
  }, []);

  return (
    <main className="grid gap-4">
      <h1 className="text-[22px] font-bold">マイページ</h1>

      <Card>
        <p className="font-bold">次回のご予約</p>
        <p className="mt-2 text-[15px] text-ink-sub">
          現在、ご予約はありません。（予約機能は Phase 10 で実装）
        </p>
      </Card>

      <Link href="/questionnaire/new" className="block">
        <Card className="border-primary/30 bg-primary-soft transition-colors hover:border-primary/60">
          <p className="font-bold text-primary">＋ 問診をはじめる</p>
          <p className="mt-2 text-[15px] text-ink-sub">
            体調が気になるときは、問診でお知らせください。医師に伝わる形に整理します。
          </p>
        </Card>
      </Link>

      <Card>
        <p className="font-bold">問診の履歴</p>
        {list === null ? (
          <p className="mt-2 text-[15px] text-ink-sub">読み込んでいます…</p>
        ) : list.length === 0 ? (
          <p className="mt-2 text-[15px] text-ink-sub">まだ問診の記録はありません。</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {list.map((q) => (
              <li key={q.id}>
                <Link
                  href={qLink(q)}
                  className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-primary/40"
                >
                  <span>
                    <span className="font-bold">{categoryLabel(q.chiefComplaintCategory)}</span>
                    <span className="ml-2 text-[13px] text-ink-sub">
                      {new Date(q.createdAt).toLocaleDateString("ja-JP")}
                    </span>
                  </span>
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[13px] font-bold ${
                      q.status === "draft" ? "bg-l2-soft text-l2" : "bg-primary-soft text-primary"
                    }`}
                  >
                    {statusLabel[q.status] ?? q.status}
                    {q.status === "draft" && `（${q.currentStep}/7）`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-2 text-[13px] text-ink-sub">
        本サービスの表示は受診の目安であり、診断ではありません。最終的な判断は医師が行います。
      </p>
    </main>
  );
}
