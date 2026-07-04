import { TOTAL_STEPS } from "@/lib/types/questionnaire";
import { staticPoolIds } from "@/lib/staticdemo/pool";
import { StepClient } from "./StepClient";

export function generateStaticParams() {
  return staticPoolIds().flatMap(({ id }) =>
    Array.from({ length: TOTAL_STEPS }, (_, i) => ({ id, n: String(i + 1) }))
  );
}

export default function StepPage() {
  return <StepClient />;
}
