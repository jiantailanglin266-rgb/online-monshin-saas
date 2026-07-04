import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, errorResponse, ApiError } from "@/lib/auth/guard";
import { questionnaireRepo } from "@/lib/repo/questionnaires";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  // クライアントで canvas 再エンコード済み（EXIF除去・圧縮）の dataURL
  dataUrl: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .max(4 * 1024 * 1024), // base64で約4MB（実データ約3MB）まで
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole("patient");
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "画像はJPEG/PNG/WebP形式・3MB以内でお願いします",
          },
        },
        { status: 400 }
      );
    }
    const mimeType = parsed.data.dataUrl.substring(5, parsed.data.dataUrl.indexOf(";"));
    const byteSize = Math.floor((parsed.data.dataUrl.split(",")[1].length * 3) / 4);

    const count = await questionnaireRepo().addImage(ctx, id, {
      mimeType,
      byteSize,
      dataUrl: parsed.data.dataUrl,
    });
    if (count === null) {
      throw new ApiError(409, "IMAGE_LIMIT", "画像は5枚までアップロードできます");
    }
    await audit(ctx, "questionnaire.image_upload", {
      resourceType: "questionnaire",
      resourceId: id,
      patientId: ctx.patientId,
      metadata: { byteSize },
    });
    return NextResponse.json({ ok: true, imageCount: count });
  } catch (e) {
    return errorResponse(e);
  }
}
