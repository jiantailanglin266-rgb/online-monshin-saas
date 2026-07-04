"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TemplateChoice() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(templateType: "internal" | "dermatology") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/questionnaires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateType }),
    });
    if (!res.ok) {
      setBusy(false);
      setError("開始できませんでした。時間をおいてお試しください。");
      return;
    }
    const { id, currentStep } = await res.json();
    router.push(`/questionnaire/${id}/step/${currentStep ?? 1}`);
  }

  return (
    <div className="grid gap-3">
      <button
        disabled={busy}
        onClick={() => start("internal")}
        className="rounded-2xl border border-line bg-surface p-5 text-left hover:border-primary/50 hover:bg-primary-soft disabled:opacity-60"
      >
        <p className="text-[18px] font-bold">からだの不調について</p>
        <p className="mt-1 text-[14px] text-ink-sub">
          発熱・痛み・せき・おなかの不調など
        </p>
      </button>
      <button
        disabled={busy}
        onClick={() => start("dermatology")}
        className="rounded-2xl border border-line bg-surface p-5 text-left hover:border-primary/50 hover:bg-primary-soft disabled:opacity-60"
      >
        <p className="text-[18px] font-bold">皮膚の症状について</p>
        <p className="mt-1 text-[14px] text-ink-sub">
          かゆみ・湿疹・できものなど（あとで写真を添付できます）
        </p>
      </button>
      {error && <p className="text-l1 text-[15px]">{error}</p>}
    </div>
  );
}
