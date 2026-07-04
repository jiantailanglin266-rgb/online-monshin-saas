export type Role = "patient" | "doctor" | "clinic_admin" | "super_admin";

/**
 * 全APIハンドラ・サーバーコンポーネントが認可判断に使う唯一のコンテキスト。
 * role は DB（users.role）由来。JWTクレームには依存しない（Phase 5 設計判断）。
 */
export interface AuthContext {
  userId: string;
  role: Role;
  clinicId: string | null;
  patientId?: string;
  doctorId?: string;
  displayName: string;
  email: string;
  mfaEnrolled: boolean;
  demo: boolean;
}
