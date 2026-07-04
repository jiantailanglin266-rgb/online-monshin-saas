import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, errorResponse } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  templateType: z.enum(["internal", "dermatology"]),
});

/** 問診draft作成（既存draftがあればそれを返す） */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("patient");
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "不正なリクエストです" } },
        { status: 400 }
      );
    }
    const q = await questionnaireRepo().createDraft(ctx, parsed.data.templateType);
    await audit(ctx, "questionnaire.create", {
      resourceType: "questionnaire",
      resourceId: q.id,
      patientId: ctx.patientId,
    });
    return NextResponse.json({ id: q.id, currentStep: q.currentStep });
  } catch (e) {
    return errorResponse(e);
  }
}
