import "server-only";
import { randomUUID } from "crypto";
import { isDemoMode } from "@/lib/env";
import type { AuthContext } from "@/lib/auth/types";
import type {
  InterviewPlan,
  Questionnaire,
  QuestionnairePatch,
  TemplateType,
} from "@/lib/types/questionnaire";
import { demoDb } from "@/lib/demo/store";

/**
 * 問診リポジトリ。全メソッドが AuthContext を受け取り、
 * 患者スコープ（ctx.patientId）・テナントスコープ（ctx.clinicId）を必ず where に含める。
 * 直接 prisma.* / demoDb を触るコードをここ以外に書かないこと（Phase 3 §5 tenant guard）。
 */

export interface PatientMeta {
  sex: string;
  age: number;
  baselineHistory: string[];
  baselineMedications: string[];
  baselineAllergies: string[];
}

export interface NewImage {
  mimeType: string;
  byteSize: number;
  dataUrl: string;
}

export interface QuestionnaireRepo {
  createDraft(ctx: AuthContext, templateType: TemplateType): Promise<Questionnaire>;
  findOwn(ctx: AuthContext, id: string): Promise<Questionnaire | null>;
  listOwn(ctx: AuthContext): Promise<Questionnaire[]>;
  applyPatch(ctx: AuthContext, id: string, patch: QuestionnairePatch): Promise<Questionnaire | null>;
  submit(ctx: AuthContext, id: string): Promise<Questionnaire | null>;
  flagEmergency(ctx: AuthContext, id: string): Promise<void>;
  setInterviewPlan(ctx: AuthContext, id: string, plan: InterviewPlan): Promise<void>;
  /** ai_interview → triaged（科目候補も保存）。状態不一致なら null */
  markTriaged(ctx: AuthContext, id: string, departments: string[]): Promise<Questionnaire | null>;
  addImage(ctx: AuthContext, id: string, image: NewImage): Promise<number | null>;
  getOwnPatientMeta(ctx: AuthContext): Promise<PatientMeta | null>;
}

function calcAge(birthDate: string | Date): number {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// ---------------------------------------------------------------- demo impl

const demoRepo: QuestionnaireRepo = {
  async createDraft(ctx, templateType) {
    const db = demoDb();
    const existing = db.questionnaires.find(
      (q) => q.patientId === ctx.patientId && q.status === "draft"
    );
    if (existing) return existing;
    const patient = db.patients.find((p) => p.id === ctx.patientId);
    const q: Questionnaire = {
      id: randomUUID(),
      clinicId: ctx.clinicId!,
      patientId: ctx.patientId!,
      templateType,
      status: "draft",
      emergencyFlagged: false,
      chiefComplaintCategory: templateType === "dermatology" ? "skin" : null,
      chiefComplaintText: null,
      onset: null,
      painScale: null,
      bodyTemp: null,
      historySnapshot: patient?.baselineHistory ?? [],
      medicationsSnapshot: patient?.baselineMedications ?? [],
      allergiesSnapshot: patient?.baselineAllergies ?? [],
      pregnancyStatus: null,
      lifestyle: {},
      freeText: null,
      currentStep: 1,
      submittedAt: null,
      createdAt: new Date().toISOString(),
      imageCount: 0,
      interviewPlan: null,
      suggestedDepartments: [],
    };
    db.questionnaires.push(q);
    return q;
  },

  async findOwn(ctx, id) {
    return (
      demoDb().questionnaires.find(
        (q) => q.id === id && q.patientId === ctx.patientId && q.clinicId === ctx.clinicId
      ) ?? null
    );
  },

  async listOwn(ctx) {
    return demoDb()
      .questionnaires.filter((q) => q.patientId === ctx.patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async applyPatch(ctx, id, patch) {
    const q = await this.findOwn(ctx, id);
    if (!q || (q.status !== "draft" && q.status !== "ai_interview")) return null;
    Object.assign(q, patch);
    return q;
  },

  async submit(ctx, id) {
    const q = await this.findOwn(ctx, id);
    if (!q || q.status !== "draft") return q?.status === "ai_interview" ? q : null;
    q.status = "ai_interview";
    q.submittedAt = new Date().toISOString();
    // 既往歴等をマスタに書き戻し（次回問診の初期値になる）
    const patient = demoDb().patients.find((p) => p.id === ctx.patientId);
    if (patient) {
      patient.baselineHistory = q.historySnapshot;
      patient.baselineMedications = q.medicationsSnapshot;
      patient.baselineAllergies = q.allergiesSnapshot;
    }
    return q;
  },

  async flagEmergency(ctx, id) {
    const q = await this.findOwn(ctx, id);
    if (q) q.emergencyFlagged = true;
  },

  async setInterviewPlan(ctx, id, plan) {
    const q = await this.findOwn(ctx, id);
    if (q) q.interviewPlan = plan;
  },

  async markTriaged(ctx, id, departments) {
    const q = await this.findOwn(ctx, id);
    if (!q || q.status !== "ai_interview") return null;
    q.status = "triaged";
    q.suggestedDepartments = departments;
    return q;
  },

  async addImage(ctx, id, image) {
    const q = await this.findOwn(ctx, id);
    if (!q || q.imageCount >= 5) return null;
    demoDb().images.push({
      id: randomUUID(),
      questionnaireId: id,
      clinicId: q.clinicId,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      dataUrl: image.dataUrl,
    });
    q.imageCount++;
    return q.imageCount;
  },

  async getOwnPatientMeta(ctx) {
    const p = demoDb().patients.find((x) => x.id === ctx.patientId);
    if (!p) return null;
    return {
      sex: p.sex,
      age: calcAge(p.birthDate),
      baselineHistory: p.baselineHistory,
      baselineMedications: p.baselineMedications,
      baselineAllergies: p.baselineAllergies,
    };
  },
};

// -------------------------------------------------------------- prisma impl

type PrismaQ = {
  id: string;
  clinicId: string;
  patientId: string;
  templateType: string;
  status: string;
  emergencyFlagged: boolean;
  chiefComplaintCategory: string | null;
  chiefComplaintText: string | null;
  onset: string | null;
  painScale: number | null;
  bodyTemp: unknown;
  historySnapshot: unknown;
  medicationsSnapshot: unknown;
  allergiesSnapshot: unknown;
  pregnancyStatus: string | null;
  lifestyle: unknown;
  freeText: string | null;
  currentStep: number;
  submittedAt: Date | null;
  createdAt: Date;
  interviewPlan?: unknown;
  suggestedDepartments?: string[];
  _count?: { images: number };
};

function toQuestionnaire(row: PrismaQ): Questionnaire {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    templateType: row.templateType as TemplateType,
    status: row.status as Questionnaire["status"],
    emergencyFlagged: row.emergencyFlagged,
    chiefComplaintCategory: row.chiefComplaintCategory,
    chiefComplaintText: row.chiefComplaintText,
    onset: row.onset,
    painScale: row.painScale,
    bodyTemp: row.bodyTemp == null ? null : Number(row.bodyTemp),
    historySnapshot: (row.historySnapshot as string[]) ?? [],
    medicationsSnapshot: (row.medicationsSnapshot as string[]) ?? [],
    allergiesSnapshot: (row.allergiesSnapshot as string[]) ?? [],
    pregnancyStatus: row.pregnancyStatus,
    lifestyle: (row.lifestyle as Questionnaire["lifestyle"]) ?? {},
    freeText: row.freeText,
    currentStep: row.currentStep,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    imageCount: row._count?.images ?? 0,
    interviewPlan: (row.interviewPlan as InterviewPlan | null) ?? null,
    suggestedDepartments: row.suggestedDepartments ?? [],
  };
}

const prismaRepo: QuestionnaireRepo = {
  async createDraft(ctx, templateType) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma();
    const existing = await db.medicalQuestionnaire.findFirst({
      where: { patientId: ctx.patientId!, clinicId: ctx.clinicId!, status: "draft" },
      include: { _count: { select: { images: true } } },
    });
    if (existing) return toQuestionnaire(existing as unknown as PrismaQ);
    const patient = await db.patient.findFirst({
      where: { id: ctx.patientId!, clinicId: ctx.clinicId! },
    });
    const row = await db.medicalQuestionnaire.create({
      data: {
        clinicId: ctx.clinicId!,
        patientId: ctx.patientId!,
        templateType,
        chiefComplaintCategory: templateType === "dermatology" ? "skin" : null,
        historySnapshot: (patient?.baselineHistory as string[]) ?? [],
        medicationsSnapshot: (patient?.baselineMedications as string[]) ?? [],
        allergiesSnapshot: (patient?.baselineAllergies as string[]) ?? [],
      },
      include: { _count: { select: { images: true } } },
    });
    return toQuestionnaire(row as unknown as PrismaQ);
  },

  async findOwn(ctx, id) {
    const { prisma } = await import("@/lib/db/prisma");
    const row = await prisma().medicalQuestionnaire.findFirst({
      where: { id, patientId: ctx.patientId!, clinicId: ctx.clinicId! },
      include: { _count: { select: { images: true } } },
    });
    return row ? toQuestionnaire(row as unknown as PrismaQ) : null;
  },

  async listOwn(ctx) {
    const { prisma } = await import("@/lib/db/prisma");
    const rows = await prisma().medicalQuestionnaire.findMany({
      where: { patientId: ctx.patientId!, clinicId: ctx.clinicId! },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { images: true } } },
    });
    return rows.map((r) => toQuestionnaire(r as unknown as PrismaQ));
  },

  async applyPatch(ctx, id, patch) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma();
    const current = await db.medicalQuestionnaire.findFirst({
      where: {
        id,
        patientId: ctx.patientId!,
        clinicId: ctx.clinicId!,
        status: { in: ["draft", "ai_interview"] },
      },
    });
    if (!current) return null;
    const { lifestyle, ...rest } = patch;
    const row = await db.medicalQuestionnaire.update({
      where: { id: current.id },
      // Lifestyle は構造的に InputJsonValue 互換（string値のみ）だが索引シグネチャがないため明示キャスト
      data: { ...rest, ...(lifestyle !== undefined ? { lifestyle: lifestyle as never } : {}) },
      include: { _count: { select: { images: true } } },
    });
    return toQuestionnaire(row as unknown as PrismaQ);
  },

  async submit(ctx, id) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma();
    const current = await db.medicalQuestionnaire.findFirst({
      where: { id, patientId: ctx.patientId!, clinicId: ctx.clinicId! },
      include: { _count: { select: { images: true } } },
    });
    if (!current) return null;
    if (current.status === "ai_interview") return toQuestionnaire(current as unknown as PrismaQ);
    if (current.status !== "draft") return null;
    const [row] = await db.$transaction([
      db.medicalQuestionnaire.update({
        where: { id: current.id },
        data: { status: "ai_interview", submittedAt: new Date() },
        include: { _count: { select: { images: true } } },
      }),
      db.patient.update({
        where: { id: ctx.patientId! },
        data: {
          baselineHistory: current.historySnapshot as string[],
          baselineMedications: current.medicationsSnapshot as string[],
          baselineAllergies: current.allergiesSnapshot as string[],
        },
      }),
    ]);
    return toQuestionnaire(row as unknown as PrismaQ);
  },

  async flagEmergency(ctx, id) {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma().medicalQuestionnaire.updateMany({
      where: { id, patientId: ctx.patientId!, clinicId: ctx.clinicId! },
      data: { emergencyFlagged: true },
    });
  },

  async setInterviewPlan(ctx, id, plan) {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma().medicalQuestionnaire.updateMany({
      where: { id, patientId: ctx.patientId!, clinicId: ctx.clinicId! },
      data: { interviewPlan: plan as never },
    });
  },

  async markTriaged(ctx, id, departments) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma();
    const updated = await db.medicalQuestionnaire.updateMany({
      where: {
        id,
        patientId: ctx.patientId!,
        clinicId: ctx.clinicId!,
        status: "ai_interview",
      },
      data: { status: "triaged", suggestedDepartments: departments },
    });
    if (updated.count === 0) return null;
    return this.findOwn(ctx, id);
  },

  async addImage(ctx, id, image) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma();
    const q = await db.medicalQuestionnaire.findFirst({
      where: { id, patientId: ctx.patientId!, clinicId: ctx.clinicId! },
      include: { _count: { select: { images: true } } },
    });
    if (!q || q._count.images >= 5) return null;

    // Storage へアップロード（private bucket）
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdmin();
    const ext = image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg";
    const path = `${q.clinicId}/${q.id}/${randomUUID()}.${ext}`;
    const base64 = image.dataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(base64, "base64");
    const { error } = await admin.storage
      .from("medical-images")
      .upload(path, buffer, { contentType: image.mimeType });
    if (error) throw error;

    await db.uploadedImage.create({
      data: {
        questionnaireId: q.id,
        clinicId: q.clinicId,
        storagePath: path,
        mimeType: image.mimeType,
        byteSize: image.byteSize,
        // クライアント側canvas再エンコードでEXIF除去済み。
        // サーバー側での再検証は Phase 12 の残課題（PHASE6メモ参照）。
        exifStripped: true,
      },
    });
    return q._count.images + 1;
  },

  async getOwnPatientMeta(ctx) {
    const { prisma } = await import("@/lib/db/prisma");
    const p = await prisma().patient.findFirst({
      where: { id: ctx.patientId!, clinicId: ctx.clinicId! },
    });
    if (!p) return null;
    return {
      sex: p.sex,
      age: calcAge(p.birthDate),
      baselineHistory: (p.baselineHistory as string[]) ?? [],
      baselineMedications: (p.baselineMedications as string[]) ?? [],
      baselineAllergies: (p.baselineAllergies as string[]) ?? [],
    };
  },
};

export function questionnaireRepo(): QuestionnaireRepo {
  return isDemoMode ? demoRepo : prismaRepo;
}
