import "server-only";
import { createClient } from "@supabase/supabase-js";

/** service role クライアント（Storage操作等、サーバー専用）。RLSをバイパスするため取り扱い注意。 */
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
