"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

/** クリニック管理者用シェル（クライアントゲート）。認可の正はAPI層（requireRole） */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then(async (r) => {
      if (!r.ok) {
        router.replace("/login");
        return;
      }
      const me = await r.json();
      if (me.role !== "clinic_admin" && me.role !== "super_admin") {
        router.replace("/login");
        return;
      }
      if (!me.mfaEnrolled) {
        router.replace("/auth/mfa");
        return;
      }
      setEmail(me.email ?? me.displayName ?? "admin");
    });
  }, [router]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/admin" className="font-bold text-primary">
            MediBridge <span className="text-ink-sub text-[13px] font-normal">管理</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink-sub">{email ?? ""}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">{email ? children : null}</div>
    </div>
  );
}
