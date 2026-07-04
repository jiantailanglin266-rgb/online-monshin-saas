import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEMO_SESSION_COOKIE, isDemoMode } from "@/lib/env";
import { findDemoUserByRole } from "@/lib/demo/store";

const bodySchema = z.object({
  role: z.enum(["patient", "doctor", "clinic_admin"]),
});

/** デモモード専用ログイン。本番環境（Supabase設定済み）では存在しない扱いにする。 */
export async function POST(request: NextRequest) {
  if (!isDemoMode) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "リソースが見つかりません" } },
      { status: 404 }
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "不正なリクエストです" } },
      { status: 400 }
    );
  }
  const user = findDemoUserByRole(parsed.data.role);
  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "デモユーザーが見つかりません" } },
      { status: 404 }
    );
  }
  const value = Buffer.from(JSON.stringify({ userId: user.id }), "utf8").toString("base64");
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(DEMO_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
