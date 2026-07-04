import { Card } from "@/components/ui/Card";

export default function AdminHome() {
  return (
    <main className="grid gap-4">
      <h1 className="text-[22px] font-bold">クリニック管理</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="font-bold">診療枠管理</p>
          <p className="mt-2 text-[14px] text-ink-sub">Phase 10 で実装予定</p>
        </Card>
        <Card>
          <p className="font-bold">医師管理</p>
          <p className="mt-2 text-[14px] text-ink-sub">Phase 10 で実装予定</p>
        </Card>
        <Card>
          <p className="font-bold">クリニック設定</p>
          <p className="mt-2 text-[14px] text-ink-sub">Phase 12 で実装予定</p>
        </Card>
      </div>
    </main>
  );
}
