import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/context";
import { LogoutButton } from "@/components/LogoutButton";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "doctor") notFound();
  if (!ctx.mfaEnrolled) redirect("/auth/mfa");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/doctor" className="font-bold text-primary">
              MediBridge <span className="text-ink-sub text-[13px] font-normal">医師用</span>
            </Link>
            <nav className="flex gap-4 text-[14px] text-ink-sub">
              <Link href="/doctor" className="hover:text-ink">本日の診療</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink-sub">Dr. {ctx.displayName}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
    </div>
  );
}
