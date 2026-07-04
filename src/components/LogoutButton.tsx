"use client";

import { useRouter } from "next/navigation";
import { isDemoMode } from "@/lib/env";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    if (!isDemoMode) {
      const { createSupabaseBrowser } = await import("@/lib/supabase/client");
      await createSupabaseBrowser().auth.signOut();
    }
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-[14px] text-ink-sub underline hover:text-ink">
      ログアウト
    </button>
  );
}
