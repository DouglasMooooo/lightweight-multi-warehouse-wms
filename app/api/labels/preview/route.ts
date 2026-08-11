import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { LabelPreviewService } from "@/services/server/label-preview-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const orderId = query.get("orderId") ?? "";
  const mode = query.get("mode") === "UNIT_SN_LABEL" ? "UNIT_SN_LABEL" : "BATCH_LABEL";
  if (!orderId)
    return NextResponse.json({ code: "ORDER_REQUIRED", error: "Outbound order is required." }, { status: 400 });
  const result = await timed(
    { route: "GET /api/labels/preview", queryName: "labelPreview", rowCount: (value) => value?.labels.length ?? 0 },
    () => new LabelPreviewService().preview(orderId, mode),
  );
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ code: "ORDER_NOT_FOUND", error: "Outbound order was not found." }, { status: 404 });
}
