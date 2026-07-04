import "server-only";
import { cookies } from "next/headers";
import { DEMO_SESSION_COOKIE, isDemoMode } from "@/lib/env";
import { findDemoUser } from "@/lib/demo/store";
import type { AuthContext } from "@/lib/auth/types";

/**
 * 現在のリクエストの AuthContext を返す。未認証なら null。
 * role/clinicId は常にDB（デモ時はインメモリストア）から引く。JWTクレームを信用しない。
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  if (isDemoMode) return getDemoContext();
  return getSupabaseContext();
}

async function getDemoContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DEMO_SESSION_COOKIE)?.value;
  if (!raw) return null;
  let userId: string;
  try {
    userId = (JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { userId: string }).userId;
  } catch {
    return null;
  }
  const user = findDemoUser(userId);
  if (!user) return null;
  return {
    userId: user.id,
    role: user.role,
    clinicId: user.clinicId,
    patientId: user.patientId,
    doctorId: user.doctorId,
    displayName: user.displayName,
    email: user.email,
    mfaEnrolled: user.mfaEnrolled,
    demo: true,
  };
}

async function getSupabaseContext(): Promise<AuthContext | null> {
  const { createSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { prisma } = await import("@/lib/db/prisma");
  const row = await prisma().user.findUnique({
    where: { id: user.id },
    include: { patient: true, doctor: true },
  });
  if (!row) return null; // authユーザーはあるがプロフィール未作成（登録未完了）

  return {
    userId: row.id,
    role: row.role,
    clinicId: row.clinicId,
    patientId: row.patient?.id,
    doctorId: row.doctor?.id,
    displayName: row.patient?.name ?? row.doctor?.name ?? row.email,
    email: row.email,
    mfaEnrolled: row.mfaEnrolled,
    demo: false,
  };
}
