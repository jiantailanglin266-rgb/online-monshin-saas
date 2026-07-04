import Link from "next/link";
import { isDemoMode } from "@/lib/env";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="text-[24px] font-bold">患者登録</h1>
      {isDemoMode ? (
        <div className="mt-6 rounded-xl bg-primary-soft p-5">
          <p>
            デモモードでは登録は不要です。ログイン画面からデモ用の患者アカウントをご利用ください。
          </p>
          <Link href="/login" className="mt-4 inline-block font-bold text-primary underline">
            ログイン画面へ
          </Link>
        </div>
      ) : (
        <RegisterForm />
      )}
    </main>
  );
}
