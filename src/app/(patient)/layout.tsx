"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * 患者用シェル（クライアントゲート）。
 * 認可の正はAPI層（requireRole）。ここはUXレベルのゲートとして /api/v1/me を確認する。
 * ※静的書き出し（GitHub Pages）対応のためサーバーゲートから移行（Phase 8.5）
 */
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then(async (r) => {
      if (!r.ok) {
        router.replace("/login");
        return;
      }
      const me = await r.json();
      if (me.role !== "patient") {
        router.replace("/login");
        return;
      }
      setName(me.displayName);
    });
  }, [router]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3">
          <Link href="/mypage" className="font-bold text-primary">
            MediBridge
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink-sub">{name ? `${name} さん` : ""}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-lg px-5 py-6">{name ? children : null}</div>
    </div>
  );
}
