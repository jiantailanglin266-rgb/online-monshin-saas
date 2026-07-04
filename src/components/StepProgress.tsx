import { TOTAL_STEPS } from "@/lib/types/questionnaire";

/** セクション単位の進捗表示（「あと◯問」はAI質問数が可変のため使わない：Phase 2 §7） */
export function StepProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5" role="img" aria-label={`基本情報 ${step}/${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`size-2.5 rounded-full ${i < step ? "bg-primary" : "bg-line"}`}
          />
        ))}
      </div>
      <span className="text-[13px] text-ink-sub">
        基本情報 {step}/{TOTAL_STEPS}
      </span>
    </div>
  );
}
