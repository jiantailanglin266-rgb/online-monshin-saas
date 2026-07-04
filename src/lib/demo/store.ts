import type { Role } from "@/lib/auth/types";
import type {
  AiQuestionItem,
  Questionnaire,
  SoapData,
  TriageResultItem,
} from "@/lib/types/questionnaire";

export interface DemoAiQuestion extends AiQuestionItem {
  questionnaireId: string;
  clinicId: string;
}

export interface DemoTriageResult extends TriageResultItem {
  questionnaireId: string;
  clinicId: string;
}

export interface DemoAiSummary {
  id: string;
  questionnaireId: string;
  clinicId: string;
  soap: SoapData;
  status: "unconfirmed" | "confirmed";
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

/**
 * デモモード専用のインメモリストア。
 * 本番コードから参照してよいのは lib/auth / repo 層のデモ分岐のみ。
 * サーバープロセスが生きている間だけ保持される（再起動でシードに戻る）。
 */

export interface DemoUser {
  id: string;
  role: Role;
  clinicId: string | null;
  email: string;
  displayName: string;
  mfaEnrolled: boolean;
  patientId?: string;
  doctorId?: string;
}

export const DEMO_CLINIC = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "デモクリニック",
  slug: "demo",
  departments: ["internal", "dermatology"],
};

export interface DemoPatient {
  id: string;
  userId: string;
  clinicId: string;
  name: string;
  nameKana: string;
  birthDate: string; // YYYY-MM-DD
  sex: "male" | "female" | "other" | "no_answer";
  baselineHistory: string[];
  baselineMedications: string[];
  baselineAllergies: string[];
}

export interface DemoImage {
  id: string;
  questionnaireId: string;
  clinicId: string;
  mimeType: string;
  byteSize: number;
  dataUrl: string; // デモ専用：メモリ上にbase64で保持
}

interface DemoDb {
  users: DemoUser[];
  patients: DemoPatient[];
  questionnaires: Questionnaire[];
  images: DemoImage[];
  aiQuestions: DemoAiQuestion[];
  triageResults: DemoTriageResult[];
  aiSummaries: DemoAiSummary[];
}

// HMR・複数ルート間でインスタンスを共有するため globalThis に載せる
const g = globalThis as unknown as { __mbDemoDb?: DemoDb };

function seed(): DemoDb {
  return {
    users: [
      {
        id: "u0000000-0000-4000-8000-000000000001",
        role: "patient",
        clinicId: DEMO_CLINIC.id,
        email: "patient@demo.jp",
        displayName: "佐藤 花子",
        mfaEnrolled: false,
        patientId: "p0000000-0000-4000-8000-000000000001",
      },
      {
        id: "u0000000-0000-4000-8000-000000000002",
        role: "doctor",
        clinicId: DEMO_CLINIC.id,
        email: "doctor@demo.jp",
        displayName: "田中 一郎",
        mfaEnrolled: true,
        doctorId: "d0000000-0000-4000-8000-000000000001",
      },
      {
        id: "u0000000-0000-4000-8000-000000000003",
        role: "clinic_admin",
        clinicId: DEMO_CLINIC.id,
        email: "admin@demo.jp",
        displayName: "管理者",
        // 管理者はあえて未登録にして、MFA強制フローをデモできるようにする
        mfaEnrolled: false,
      },
    ],
    patients: [
      {
        id: "p0000000-0000-4000-8000-000000000001",
        userId: "u0000000-0000-4000-8000-000000000001",
        clinicId: DEMO_CLINIC.id,
        name: "佐藤 花子",
        nameKana: "さとう はなこ",
        birthDate: "1992-04-12",
        sex: "female",
        baselineHistory: ["高血圧"],
        baselineMedications: ["アムロジピン 5mg（1日1回）"],
        baselineAllergies: [],
      },
    ],
    questionnaires: [],
    images: [],
    aiQuestions: [],
    triageResults: [],
    aiSummaries: [],
  };
}

export function demoDb(): DemoDb {
  if (!g.__mbDemoDb) g.__mbDemoDb = seed();
  return g.__mbDemoDb;
}

export function findDemoUser(id: string): DemoUser | undefined {
  return demoDb().users.find((u) => u.id === id);
}

export function findDemoUserByRole(role: Role): DemoUser | undefined {
  return demoDb().users.find((u) => u.role === role);
}
