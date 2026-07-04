import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/env";

const bodySchema = z.object({
  clinicSlug: z.string().min(1),
  name: z.string().min(1).max(60),
  nameKana: z.string().min(1).max(60),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(["male", "female", "other", "no_answer"]),
  consents: z.object({
    terms: z.literal(true),
    sensitiveData: z.literal(true),
    aiProcessingOffshore: z.literal(true),
  }),
});

const CONSENT_VERSION = "2026-07-01";

/**
 * 患者プロフィール登録（本番系のみ）。
 * supabase.auth.signUp 完了後、セッション保持者本人のプロフィールを作成する。
 * 同意3項目（規約・要配慮個人情報・AI処理/外国送信）すべてが true でなければ 400。
 */
export async function POST(request: NextRequest) {
  if (isDemoMode) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "デモモードでは登録不要です" } },
      { status: 404 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "入力内容をご確認ください（同意が必要な項目があります）",
        },
      },
      { status: 400 }
    );
  }

  const { createSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "ログインしてください" } },
      { status: 401 }
    );
  }

  const { prisma } = await import("@/lib/db/prisma");
  const db = prisma();
  const b = parsed.data;

  const clinic = await db.clinic.findUnique({ where: { slug: b.clinicSlug } });
  if (!clinic || clinic.status !== "active") {
    return NextResponse.json(
      { error: { code: "CLINIC_NOT_FOUND", message: "クリニックが見つかりません" } },
      { status: 404 }
    );
  }

  const existing = await db.user.findUnique({ where: { id: user.id } });
  if (existing) {
    return NextResponse.json({ ok: true, alreadyRegistered: true });
  }

  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: user.id, // auth.uid() 本人のみ。他人のIDに紐付け不可（Phase 5 自己レビュー対応）
        role: "patient",
        clinicId: clinic.id,
        email: user.email ?? "",
      },
    });
    await tx.patient.create({
      data: {
        userId: user.id,
        clinicId: clinic.id,
        name: b.name,
        nameKana: b.nameKana,
        birthDate: new Date(b.birthDate),
        sex: b.sex,
      },
    });
    const consentRows = [
      { consentType: "terms" },
      { consentType: "sensitive_data" },
      { consentType: "ai_processing_offshore" },
    ].map((c) => ({
      userId: user.id,
      consentType: c.consentType,
      version: CONSENT_VERSION,
      granted: true,
    }));
    await tx.consent.createMany({ data: consentRows });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        actorRole: "patient",
        clinicId: clinic.id,
        action: "auth.register",
        metadata: { consentVersion: CONSENT_VERSION },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
