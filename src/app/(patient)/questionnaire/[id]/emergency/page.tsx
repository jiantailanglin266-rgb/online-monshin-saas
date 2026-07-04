import { Suspense } from "react";
import { staticPoolIds } from "@/lib/staticdemo/pool";
import { EmergencyClient } from "./EmergencyClient";

export function generateStaticParams() {
  return staticPoolIds();
}

/** S-07E 緊急アラート全画面（Phase 2 §4） */
export default function EmergencyPage() {
  return (
    <Suspense fallback={null}>
      <EmergencyClient />
    </Suspense>
  );
}
