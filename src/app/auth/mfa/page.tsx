"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MfaSetup } from "./MfaSetup";

export default function MfaPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ demo: boolean; homePath: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then(async (r) => {
      if (!r.ok) {
        router.replace("/login");
        return;
      }
      const m = await r.json();
      if (m.role === "patient") {
        router.replace("/mypage"); // 患者はMFA対象外（MVP）
        return;
      }
      const homePath = m.role === "doctor" ? "/doctor" : "/admin";
      if (m.mfaEnrolled) {
        router.replace(homePath);
        return;
      }
      setMe({ demo: m.demo, homePath });
    });
  }, [router]);

  if (!me) return null;

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="text-[24px] font-bold">二段階認証の設定</h1>
      <p className="mt-3 text-ink-sub text-[15px]">
        医療情報を扱うアカウントでは、二段階認証の設定が必要です。
        設定が完了するまで、各機能はご利用いただけません。
      </p>
      <MfaSetup demo={me.demo} homePath={me.homePath} />
    </main>
  );
}
