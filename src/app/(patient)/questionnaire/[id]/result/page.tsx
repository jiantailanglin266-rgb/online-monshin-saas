import { staticPoolIds } from "@/lib/staticdemo/pool";
import { ResultClient } from "./ResultClient";

export function generateStaticParams() {
  return staticPoolIds();
}

/** S-07 緊急度結果画面（患者向け） */
export default function ResultPage() {
  return <ResultClient />;
}
