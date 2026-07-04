"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function MfaSetup({ demo, homePath }: { demo: boolean; homePath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 本番系TOTPフロー用の状態
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function demoEnable() {
    setBusy(true);
    const res = await fetch("/api/v1/auth/demo-mfa", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("設定に失敗しました");
      return;
    }
    router.push(homePath);
    router.refresh();
  }

  async function startEnroll() {
    setBusy(true);
    setError(null);
    const { createSupabaseBrowser } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowser();
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (err || !data) {
      setError("設定を開始できませんでした。時間をおいてお試しください。");
      return;
    }
    setFactorId(data.id);
    setQrSvg(data.totp.qr_code);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { createSupabaseBrowser } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowser();
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) {
      setBusy(false);
      setError("確認に失敗しました");
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (vErr) {
      setBusy(false);
      setError("コードが正しくありません");
      return;
    }
    const res = await fetch("/api/v1/auth/mfa-complete", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("設定の保存に失敗しました");
      return;
    }
    router.push(homePath);
    router.refresh();
  }

  if (demo) {
    return (
      <div className="mt-6 grid gap-3">
        <div className="rounded-xl bg-primary-soft p-4 text-[15px]">
          デモモードのため、認証アプリの読み取りは省略されます。
        </div>
        <Button disabled={busy} onClick={demoEnable}>
          二段階認証を有効にする（デモ）
        </Button>
        {error && <p className="text-l1 text-[15px]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-4">
      {!qrSvg ? (
        <Button disabled={busy} onClick={startEnroll}>
          設定をはじめる
        </Button>
      ) : (
        <form onSubmit={verify} className="grid gap-4">
          <p className="text-[15px]">
            認証アプリ（Google Authenticator など）でQRコードを読み取り、
            表示された6桁のコードを入力してください。
          </p>
          <div
            className="mx-auto w-48 rounded-xl border border-line bg-white p-2"
            // Supabaseが返すQRコードSVG
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <input
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            placeholder="6桁のコード"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-12 rounded-xl border border-line bg-surface px-4 text-center text-[20px] tracking-widest"
          />
          <Button type="submit" disabled={busy || code.length !== 6}>
            確認して有効にする
          </Button>
        </form>
      )}
      {error && <p className="text-l1 text-[15px]">{error}</p>}
    </div>
  );
}
