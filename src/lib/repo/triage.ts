// NOTE: 静的デモ(GitHub Pages)のブラウザ内エンジンからも利用するため "server-only" は付けない。
// サーバー専用の秘匿情報はこのモジュールには置かないこと。
import { newId } from "@/lib/id";
import { isDemoMode } from "@/lib/env";
import type { AuthContext } from "@/lib/auth/types";
import type { SoapData, TriageLevel, TriageResultItem } from "@/lib/types/questionnaire";
import { demoDb } from "@/lib/demo/store";

/**
 * 緊急度判定結果・SOAP要約のリポジトリ。
 * triage_results は追記専用（Phase 3 方針3）：更新はせず常に新規行を積む。
 * 問診の所有権チェックは呼び出し側が questionnaireRepo.findOwn で先に行う前提。
 */

export interface NewTriageResult {
  finalLevel: TriageLevel;
  aiLevel: TriageLevel | null;
  ruleLevel: TriageLevel;
  aiReasons?: unknown;
  ruleHits?: unknown;
}

export interface TriageRepo {
  add(ctx: AuthContext, questionnaireId: string, data: NewTriageResult): Promise<TriageResultItem>;
  latest(ctx: AuthContext, questionnaireId: string): Promise<TriageResultItem | null>;
}

export interface SummaryRepo {
  save(ctx: AuthContext, questionnaireId: string, soap: SoapData): Promise<void>;
  get(ctx: AuthContext, questionnaireId: string): Promise<{ soap: SoapData; status: string } | null>;
}

// ---------------------------------------------------------------- demo

const demoTriageRepo: TriageRepo = {
  async add(ctx, questionnaireId, data) {
    const item = {
      id: newId(),
      questionnaireId,
      clinicId: ctx.clinicId!,
      finalLevel: data.finalLevel,
      aiLevel: data.aiLevel,
      ruleLevel: data.ruleLevel,
      aiReasons: data.aiReasons ?? null,
      ruleHits: data.ruleHits ?? null,
      createdAt: new Date().toISOString(),
    };
    demoDb().triageResults.push(item);
    return item;
  },
  async latest(ctx, questionnaireId) {
    const rows = demoDb()
      .triageResults.filter(
        (t) => t.questionnaireId === questionnaireId && t.clinicId === ctx.clinicId
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0] ?? null;
  },
};

const demoSummaryRepo: SummaryRepo = {
  async save(ctx, questionnaireId, soap) {
    const db = demoDb();
    const existing = db.aiSummaries.find(
      (s) => s.questionnaireId === questionnaireId && s.clinicId === ctx.clinicId
    );
    if (existing) {
      existing.soap = soap;
      return;
    }
    db.aiSummaries.push({
      id: newId(),
      questionnaireId,
      clinicId: ctx.clinicId!,
      soap,
      status: "unconfirmed",
      confirmedBy: null,
      confirmedAt: null,
      createdAt: new Date().toISOString(),
    });
  },
  async get(ctx, questionnaireId) {
    const s = demoDb().aiSummaries.find(
      (x) => x.questionnaireId === questionnaireId && x.clinicId === ctx.clinicId
    );
    return s ? { soap: s.soap, status: s.status } : null;
  },
};

// ---------------------------------------------------------------- prisma

const soapToText = (rows: { text: string }[]) => rows.map((r) => r.text).join("\n");

const prismaTriageRepo: TriageRepo = {
  async add(ctx, questionnaireId, data) {
    const { prisma } = await import("@/lib/db/prisma");
    const row = await prisma().triageResult.create({
      data: {
        questionnaireId,
        clinicId: ctx.clinicId!,
        finalLevel: data.finalLevel,
        aiLevel: data.aiLevel,
        ruleLevel: data.ruleLevel,
        aiReasons: (data.aiReasons ?? undefined) as never,
        ruleHits: (data.ruleHits ?? undefined) as never,
        promptVersion: "v1.0",
      },
    });
    return {
      id: row.id,
      finalLevel: row.finalLevel as TriageLevel,
      aiLevel: row.aiLevel as TriageLevel | null,
      ruleLevel: row.ruleLevel as TriageLevel,
      aiReasons: row.aiReasons,
      ruleHits: row.ruleHits,
      createdAt: row.createdAt.toISOString(),
    };
  },
  async latest(ctx, questionnaireId) {
    const { prisma } = await import("@/lib/db/prisma");
    const row = await prisma().triageResult.findFirst({
      where: { questionnaireId, clinicId: ctx.clinicId! },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      finalLevel: row.finalLevel as TriageLevel,
      aiLevel: row.aiLevel as TriageLevel | null,
      ruleLevel: row.ruleLevel as TriageLevel,
      aiReasons: row.aiReasons,
      ruleHits: row.ruleHits,
      createdAt: row.createdAt.toISOString(),
    };
  },
};

const prismaSummaryRepo: SummaryRepo = {
  async save(ctx, questionnaireId, soap) {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma().aiSummary.upsert({
      where: { questionnaireId },
      create: {
        questionnaireId,
        clinicId: ctx.clinicId!,
        sText: soapToText(soap.s),
        oText: soapToText(soap.o),
        aText: soapToText(soap.a),
        pText: soapToText(soap.p),
        sourceRefs: soap as never, // 文単位の構造（原文対照ハイライト用）
      },
      update: {
        sText: soapToText(soap.s),
        oText: soapToText(soap.o),
        aText: soapToText(soap.a),
        pText: soapToText(soap.p),
        sourceRefs: soap as never,
      },
    });
  },
  async get(ctx, questionnaireId) {
    const { prisma } = await import("@/lib/db/prisma");
    const row = await prisma().aiSummary.findFirst({
      where: { questionnaireId, clinicId: ctx.clinicId! },
    });
    return row ? { soap: row.sourceRefs as unknown as SoapData, status: row.status } : null;
  },
};

export function triageRepo(): TriageRepo {
  return isDemoMode ? demoTriageRepo : prismaTriageRepo;
}

export function summaryRepo(): SummaryRepo {
  return isDemoMode ? demoSummaryRepo : prismaSummaryRepo;
}
