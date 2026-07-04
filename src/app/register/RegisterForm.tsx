"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * 本番系の患者登録。
 * 同意は項目別チェック（Phase 2 S-04）：一括同意にしない。
 */
export function RegisterForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    nameKana: "",
    birthDate: "",
    sex: "no_answer",
    clinicSlug: "demo",
    consentTerms: false,
    consentSensitive: false,
    consentAi: false,
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const allConsented = form.consentTerms && form.consentSensitive && form.consentAi;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!allConsented) return;
    setBusy(true);
    setError(null);

    const { createSupabaseBrowser } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowser();
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });
    if (err) {
      setBusy(false);
      setError("登録に失敗しました。メールアドレスをご確認ください。");
      return;
    }
    if (!data.session) {
      // メール確認が必要な設定の場合
      setBusy(false);
      setNeedsEmailConfirm(true);
      return;
    }
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicSlug: form.clinicSlug,
        name: form.name,
        nameKana: form.nameKana,
        birthDate: form.birthDate,
        sex: form.sex,
        consents: {
          terms: form.consentTerms,
          sensitiveData: form.consentSensitive,
          aiProcessingOffshore: form.consentAi,
        },
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "登録に失敗しました");
      return;
    }
    router.push("/mypage");
    router.refresh();
  }

  if (needsEmailConfirm) {
    return (
      <div className="mt-6 rounded-xl bg-primary-soft p-5">
        <p className="font-bold">確認メールをお送りしました</p>
        <p className="mt-2 text-[15px] text-ink-sub">
          メール内のリンクを開いたあと、ログインしてお手続きを続けてください。
        </p>
      </div>
    );
  }

  const inputCls = "min-h-12 rounded-xl border border-line bg-surface px-4";

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">メールアドレス</span>
        <input type="email" required className={inputCls} value={form.email}
          onChange={(e) => set("email", e.target.value)} autoComplete="email" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">パスワード（8文字以上）</span>
        <input type="password" required minLength={8} className={inputCls} value={form.password}
          onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">お名前</span>
        <input required className={inputCls} value={form.name}
          onChange={(e) => set("name", e.target.value)} autoComplete="name" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">お名前（ふりがな）</span>
        <input required className={inputCls} value={form.nameKana}
          onChange={(e) => set("nameKana", e.target.value)} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">生年月日</span>
        <input type="date" required className={inputCls} value={form.birthDate}
          onChange={(e) => set("birthDate", e.target.value)} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-bold">性別</span>
        <select className={inputCls} value={form.sex} onChange={(e) => set("sex", e.target.value)}>
          <option value="no_answer">回答しない</option>
          <option value="female">女性</option>
          <option value="male">男性</option>
          <option value="other">その他</option>
        </select>
      </label>

      <div className="mt-2 grid gap-3 rounded-xl border border-line bg-surface p-4">
        <p className="font-bold text-[15px]">ご確認とご同意（それぞれご確認ください）</p>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" className="mt-1 size-5" checked={form.consentTerms}
            onChange={(e) => set("consentTerms", e.target.checked)} />
          <span>利用規約・プライバシーポリシーに同意します</span>
        </label>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" className="mt-1 size-5" checked={form.consentSensitive}
            onChange={(e) => set("consentSensitive", e.target.checked)} />
          <span>症状・病歴などの健康に関する情報を、診療の目的で取得・利用することに同意します</span>
        </label>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" className="mt-1 size-5" checked={form.consentAi}
            onChange={(e) => set("consentAi", e.target.checked)} />
          <span>
            問診内容の整理のため、外国にあるAIサービス（学習には使用されません）へ、
            氏名・連絡先を除いた情報が送信されることに同意します
          </span>
        </label>
      </div>

      {error && <p className="text-l1 text-[15px]">{error}</p>}
      <Button type="submit" disabled={busy || !allConsented}>
        {busy ? "登録しています…" : "同意して登録する"}
      </Button>
    </form>
  );
}
