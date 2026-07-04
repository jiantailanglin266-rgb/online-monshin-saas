import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };
import { DEMO_SESSION_COOKIE, isDemoMode } from "@/lib/env";

/**
 * middleware は「セッションの有無」だけを見るUXレベルのゲート。
 * ロール・MFAの判定はサーバーコンポーネント層とAPI層（requireRole）が正（Phase 5 設計判断）。
 */
export async function middleware(request: NextRequest) {
  const loginUrl = new URL(
    `/login?next=${encodeURIComponent(request.nextUrl.pathname)}`,
    request.url
  );

  if (isDemoMode) {
    if (!request.cookies.has(DEMO_SESSION_COOKIE)) {
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 本番系：Supabaseセッションの検証とCookieリフレッシュ
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  matcher: [
    "/mypage/:path*",
    "/doctor/:path*",
    "/admin/:path*",
    "/questionnaire/:path*",
    "/appointments/:path*",
    "/auth/mfa",
  ],
};
