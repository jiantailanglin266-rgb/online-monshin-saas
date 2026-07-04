"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

/** 医師用シェル（クライアントゲート）。認可の正はAPI層（requireRole） */
export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then(async (r) => {
      if (!r.ok) {
        router.replace("/login");
        return;
      }
      const me = await r.json();
      if (me.role !== "doctor") {
        router.replace("/login");
        return;
      }
      if (!me.mfaEnrolled) {
        router.replace("/auth/mfa");
        return;
      }
      setName(me.displayName);
    });
  }, [router]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/doctor" className="font-bold text-primary">
              MediBridge <span className="text-ink-sub text-[13px] font-normal">医師用</span>
            </Link>
            <nav className="flex gap-4 text-[14px] text-ink-sub">
              <Link href="/doctor" className="hover:text-ink">本日の診療</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink-sub">{name ? `Dr. ${name}` : ""}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">{name ? children : null}</div>
    </div>
  );
}
