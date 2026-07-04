import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { InterviewChat } from "./InterviewChat";

/** S-06 AI追加質問チャット */
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "patient") notFound();
  const q = await questionnaireRepo().findOwn(ctx, id);
  if (!q) notFound();
  if (q.status === "draft") redirect(`/questionnaire/${id}/step/${q.currentStep}`);
  if (q.status !== "ai_interview") redirect(`/questionnaire/${id}/result`);

  return (
    <main className="grid gap-4">
      <div>
        <h1 className="text-[22px] font-bold">追加のおうかがい</h1>
        <p className="mt-1 text-[14px] text-ink-sub">
          AIアシスタントが、医師に伝えるための情報を整理します。
          お答えいただくほど、医師に正確に伝わります。
        </p>
      </div>
      <InterviewChat questionnaireId={id} active={q.status === "ai_interview"} />
    </main>
  );
}
