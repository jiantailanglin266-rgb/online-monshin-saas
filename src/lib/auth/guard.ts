import "server-only";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import type { AuthContext, Role } from "@/lib/auth/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message } },
      { status: e.status }
    );
  }
  console.error(e);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "サーバーエラーが発生しました" } },
    { status: 500 }
  );
}

/**
 * APIハンドラ用の認可ガード。
 * - 未認証: 401
 * - ロール不一致: 404（存在の漏えい防止。PHASE4 §1.2）
 * - 医療従事者でMFA未登録: 403 MFA_REQUIRED
 */
export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new ApiError(401, "UNAUTHENTICATED", "ログインしてください");
  if (!roles.includes(ctx.role))
    throw new ApiError(404, "NOT_FOUND", "リソースが見つかりません");
  if (
    (ctx.role === "doctor" || ctx.role === "clinic_admin" || ctx.role === "super_admin") &&
    !ctx.mfaEnrolled
  ) {
    throw new ApiError(403, "MFA_REQUIRED", "二段階認証の設定が必要です");
  }
  return ctx;
}
