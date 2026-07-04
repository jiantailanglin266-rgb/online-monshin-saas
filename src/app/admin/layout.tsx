import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/context";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "clinic_admin" && ctx.role !== "super_admin") notFound();
  if (!ctx.mfaEnrolled) redirect("/auth/mfa");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/admin" className="font-bold text-primary">
            MediBridge <span className="text-ink-sub text-[13px] font-normal">管理</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink-sub">{ctx.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
    </div>
  );
}
