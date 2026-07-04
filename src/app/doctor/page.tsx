import { Card } from "@/components/ui/Card";

export default function DoctorDashboard() {
  return (
    <main className="grid gap-4">
      <h1 className="text-[22px] font-bold">本日の診療</h1>

      <Card className="border-l1/30">
        <p className="font-bold text-l1">緊急対応（L1 / L2）</p>
        <p className="mt-2 text-[15px] text-ink-sub">現在、緊急度の高い問診はありません。</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-bold">問診一覧</p>
          <p className="text-[13px] text-ink-sub">フィルター（Phase 9 で実装）</p>
        </div>
        <p className="mt-3 text-[15px] text-ink-sub">
          問診はまだありません。問診機能は Phase 6〜8 で実装されます。
        </p>
      </Card>
    </main>
  );
}
