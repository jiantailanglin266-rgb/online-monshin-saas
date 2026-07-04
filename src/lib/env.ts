/**
 * デモモード判定。
 * Supabase の環境変数が未設定なら、アプリ全体がインメモリのデモ実装で動作する。
 * NEXT_PUBLIC_ 変数はビルド時にインライン化されるため、クライアント側でも同じ判定が使える。
 */
export const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export const DEMO_SESSION_COOKIE = "mb_demo_session";
