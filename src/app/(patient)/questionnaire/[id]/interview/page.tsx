import { staticPoolIds } from "@/lib/staticdemo/pool";
import { InterviewClient } from "./InterviewClient";

export function generateStaticParams() {
  return staticPoolIds();
}

/** S-06 AI追加質問チャット */
export default function InterviewPage() {
  return <InterviewClient />;
}
