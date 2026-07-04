"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { Role } from "@/lib/auth/types";

const roleHome: Record<string, string> = {
  patient: "/mypage",
  doctor: "/doctor",
  clinic_admin: "/admin",
  super_admin: "/admin",
};

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function demoLogin(role: Role) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("ログインに失敗しました");
      return;
    }
    router.push(roleHome[role]);
    router.refresh();
  }

  async function realLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { createSupabaseBrowser } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowser();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setBusy(false);
      setError("メールアドレスまたはパスワードが正しくありません");
      return;
    }
    const me = await fetch("/api/v1/me").then((r) => (r.ok ? r.json() : null));
    setBusy(false);
    router.push(me ? (roleHome[me.role] ?? "/") : "/");
    router.refresh();
  }

  if (demo) {
    return (
      <div className="mt-6 grid gap-3">
        <p className="text-ink-sub text-[15px]">
          デモモードです。ロールを選んでログインしてください。
        </p>
        <Button disabled={busy} onClick={() => demoLogin("patient")}>
          患者としてログイン（佐藤 花子）
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => demoLogin("doctor")}>
          医師としてログイン（田中 一郎）
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => demoLogin("clinic_admin")}>
          クリニック管理者としてログイン
        </Button>
        {error && <p className="text-l1 text-[15px]">{error}</p>}
        <p className="text-[13px] text-ink-sub">
          ※管理者は二段階認証が未設定のため、設定画面へ誘導されます（MFA強制フローのデモ）。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={realLogin} className="mt-6 grid gap-4">
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">メールアドレス</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-12 rounded-xl border border-line bg-surface px-4"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">パスワード</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-12 rounded-xl border border-line bg-surface px-4"
        />
      </label>
      {error && <p className="text-l1 text-[15px]">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "確認しています…" : "ログイン"}
      </Button>
    </form>
  );
}
