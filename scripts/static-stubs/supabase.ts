// 静的書き出しビルド専用スタブ：デモエンジンは Supabase に到達しない
export function createSupabaseServer(): never {
  throw new Error("supabase is not available in static demo build");
}
export function createSupabaseAdmin(): never {
  throw new Error("supabase is not available in static demo build");
}
