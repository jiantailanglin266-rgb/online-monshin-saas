import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, isDemoMode } from "@/lib/env";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  if (isDemoMode) {
    res.cookies.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  }
  // 本番系のセッション破棄はクライアント側 supabase.auth.signOut() が行う
  return res;
}
