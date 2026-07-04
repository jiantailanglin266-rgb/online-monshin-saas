import { isDemoMode } from "@/lib/env";

export function DemoBanner() {
  if (!isDemoMode) return null;
  return (
    <div className="bg-l2-soft text-l2 border-b border-l2/30 px-4 py-1.5 text-center text-[13px] font-medium">
      デモモードで動作中（Supabase未設定・データはサーバー再起動で初期化されます）
    </div>
  );
}
