"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StepProgress } from "@/components/StepProgress";
import { TOTAL_STEPS, type Questionnaire } from "@/lib/types/questionnaire";
import { StepForm } from "./StepForm";

type QWithMeta = Questionnaire & { patientSex: string };

export function StepClient() {
  const router = useRouter();
  const { id, n } = useParams<{ id: string; n: string }>();
  const step = Number(n);
  const [q, setQ] = useState<QWithMeta | null>(null);

  useEffect(() => {
    if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
      router.replace("/mypage");
      return;
    }
    fetch(`/api/v1/questionnaires/${id}`).then(async (r) => {
      if (!r.ok) {
        router.replace("/mypage");
        return;
      }
      const data = (await r.json()) as QWithMeta;
      if (data.status !== "draft") {
        router.replace(`/questionnaire/${id}/interview`);
        return;
      }
      setQ(data);
    });
  }, [id, step, router]);

  if (!q) return <p className="text-[15px] text-ink-sub">読み込んでいます…</p>;

  return (
    <main className="grid gap-5">
      <StepProgress step={step} />
      {/* key でステップ遷移ごとにフォーム状態をリセット */}
      <StepForm key={`${q.id}-${step}`} q={q} step={step} patientSex={q.patientSex} />
    </main>
  );
}
