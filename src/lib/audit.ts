import "server-only";
import { isDemoMode } from "@/lib/env";
import type { AuthContext } from "@/lib/auth/types";

/** 監査ログ記録。医療情報に触れる操作は必ず呼ぶこと（Phase 4 §1.3）。 */
export async function audit(
  ctx: AuthContext | null,
  action: string,
  fields: {
    resourceType?: string;
    resourceId?: string;
    patientId?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  if (isDemoMode) {
    console.log(`[audit] ${action}`, { actor: ctx?.userId, ...fields });
    return;
  }
  const { prisma } = await import("@/lib/db/prisma");
  await prisma().auditLog.create({
    data: {
      actorUserId: ctx?.userId ?? null,
      actorRole: ctx?.role ?? null,
      clinicId: ctx?.clinicId ?? null,
      action,
      resourceType: fields.resourceType,
      resourceId: fields.resourceId,
      patientId: fields.patientId,
      metadata: (fields.metadata ?? undefined) as never,
    },
  });
}
