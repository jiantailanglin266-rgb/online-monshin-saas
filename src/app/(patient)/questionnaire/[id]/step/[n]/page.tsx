import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { StepProgress } from "@/components/StepProgress";
import { TOTAL_STEPS } from "@/lib/types/questionnaire";
import { StepForm } from "./StepForm";

export default async function StepPage({
  params,
}: {
  params: Promise<{ id: string; n: string }>;
}) {
  const { id, n } = await params;
  const step = Number(n);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) notFound();

  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "patient") notFound();

  const repo = questionnaireRepo();
  const q = await repo.findOwn(ctx, id);
  if (!q) notFound();
  if (q.status !== "draft") redirect(`/questionnaire/${id}/interview`);

  const meta = await repo.getOwnPatientMeta(ctx);

  return (
    <main className="grid gap-5">
      <StepProgress step={step} />
      <StepForm q={q} step={step} patientSex={meta?.sex ?? "no_answer"} />
    </main>
  );
}
