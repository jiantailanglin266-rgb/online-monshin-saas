import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { MfaSetup } from "./MfaSetup";

export default async function MfaPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.role === "patient") redirect("/mypage"); // 患者はMFA対象外（MVP）
  if (ctx.mfaEnrolled) redirect(ctx.role === "doctor" ? "/doctor" : "/admin");

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="text-[24px] font-bold">二段階認証の設定</h1>
      <p className="mt-3 text-ink-sub text-[15px]">
        医療情報を扱うアカウントでは、二段階認証の設定が必要です。
        設定が完了するまで、各機能はご利用いただけません。
      </p>
      <MfaSetup demo={ctx.demo} homePath={ctx.role === "doctor" ? "/doctor" : "/admin"} />
    </main>
  );
}
