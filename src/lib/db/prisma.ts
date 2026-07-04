import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __mbPrisma?: PrismaClient };

/**
 * Prisma は service role 相当の接続で RLS をバイパスする。
 * 直接 prisma.* を呼ばず、必ず AuthContext を受け取る repo 層経由で使うこと（Phase 3 §5）。
 */
export function prisma(): PrismaClient {
  if (!g.__mbPrisma) g.__mbPrisma = new PrismaClient();
  return g.__mbPrisma;
}
