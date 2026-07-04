"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { InterviewChat } from "./InterviewChat";

export function InterviewClient() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/questionnaires/${id}`).then(async (r) => {
      if (!r.ok) {
        router.replace("/mypage");
        return;
      }
      const q = await r.json();
      if (q.status === "draft") {
        router.replace(`/questionnaire/${id}/step/${q.currentStep}`);
        return;
      }
      if (q.status !== "ai_interview") {
        router.replace(`/questionnaire/${id}/result`);
        return;
      }
      setReady(true);
    });
  }, [id, router]);

  if (!ready) return <p className="text-[15px] text-ink-sub">読み込んでいます…</p>;

  return (
    <main className="grid gap-4">
      <div>
        <h1 className="text-[22px] font-bold">追加のおうかがい</h1>
        <p className="mt-1 text-[14px] text-ink-sub">
          AIアシスタントが、医師に伝えるための情報を整理します。
          お答えいただくほど、医師に正確に伝わります。
        </p>
      </div>
      <InterviewChat questionnaireId={id} active />
    </main>
  );
}
