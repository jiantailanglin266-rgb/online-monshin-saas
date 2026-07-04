import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/context";
import { LogoutButton } from "@/components/LogoutButton";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "patient") notFound();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3">
          <Link href="/mypage" className="font-bold text-primary">
            MediBridge
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink-sub">{ctx.displayName} さん</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-lg px-5 py-6">{children}</div>
    </div>
  );
}
