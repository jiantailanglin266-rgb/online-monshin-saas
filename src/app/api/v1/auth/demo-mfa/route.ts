import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { getAuthContext } from "@/lib/auth/context";
import { findDemoUser } from "@/lib/demo/store";

/** デモモード専用：二段階認証の有効化をシミュレートする。 */
export async function POST() {
  if (!isDemoMode) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "リソースが見つかりません" } },
      { status: 404 }
    );
  }
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "ログインしてください" } },
      { status: 401 }
    );
  }
  const user = findDemoUser(ctx.userId);
  if (user) user.mfaEnrolled = true;
  return NextResponse.json({ ok: true });
}
