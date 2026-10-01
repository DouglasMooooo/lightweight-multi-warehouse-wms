import { NextResponse } from "next/server";
import { z } from "zod";
import { timed } from "@/lib/performance";
import { LabelPreviewService } from "@/services/server/label-preview-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { code: "INVALID_LABEL_BATCH", error: "Select between 1 and 100 existing orders." },
      { status: 400 },
    );
  const result = await timed(
    {
      route: "POST /api/labels/batch-preview",
      queryName: "batchLabelPreview",
      rowCount: (value) => value.labels.length,
    },
    () => new LabelPreviewService().previewBatch(parsed.data.orderIds),
  );
  return NextResponse.json(result, { status: result.validation.valid ? 200 : 422 });
}
