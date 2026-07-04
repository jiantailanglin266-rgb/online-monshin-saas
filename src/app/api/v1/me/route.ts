import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "ログインしてください" } },
      { status: 401 }
    );
  }
  // クライアントに返すのは表示に必要な最小限
  return NextResponse.json({
    role: ctx.role,
    displayName: ctx.displayName,
    email: ctx.email,
    mfaEnrolled: ctx.mfaEnrolled,
    demo: ctx.demo,
  });
}
