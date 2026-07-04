import { isDemoMode } from "@/lib/env";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="text-[24px] font-bold">ログイン</h1>
      <LoginForm demo={isDemoMode} />
    </main>
  );
}
