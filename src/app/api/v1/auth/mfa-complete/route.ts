import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";

/**
 * TOTP登録完了の記録（本番系のみ）。
 * クライアントで supabase.auth.mfa.enroll → verify が成功した後に呼ばれ、
 * サーバー側で「本当にMFA要素が登録されているか」を確認してから users.mfa_enrolled を立てる。
 */
export async function POST() {
  if (isDemoMode) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "リソースが見つかりません" } },
      { status: 404 }
    );
  }

  const { createSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "ログインしてください" } },
      { status: 401 }
    );
  }

  // クライアント申告を信用せず、Authサーバー上の登録済み要素を確認する
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.some((f) => f.status === "verified") ?? false;
  if (error || !verified) {
    return NextResponse.json(
      { error: { code: "MFA_NOT_VERIFIED", message: "二段階認証が完了していません" } },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/db/prisma");
  await prisma().user.update({
    where: { id: user.id },
    data: { mfaEnrolled: true },
  });
  return NextResponse.json({ ok: true });
}
