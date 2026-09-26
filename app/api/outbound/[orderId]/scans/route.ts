import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { OutboundBatchScanService } from "@/services/server/outbound-batch-scan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  action: z.enum(["validate", "lookup", "confirm"]),
  rows: z.array(z.object({
    rowId: z.string().trim().min(1).max(80),
    rawValue: z.string().trim().min(1).max(512),
    supportingSku: z.string().trim().max(80).optional(),
    supportingShNo: z.string().trim().max(80).optional(),
    targetLineId: z.string().trim().max(80).optional(),
    included: z.boolean().optional(),
    operatorRemark: z.string().trim().max(240).optional(),
  })).min(1).max(500),
  reviewBatchReference: z.string().trim().min(6).max(80).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    const input = schema.parse(await request.json());
    const service = new OutboundBatchScanService();
    return NextResponse.json(await timed<unknown>(
      { route: "POST /api/outbound/:id/scans", queryName: `outboundReview:${input.action}`, rowCount: () => input.rows.length },
      () => input.action === "confirm"
        ? service.confirmPreparation(
            orderId,
            input.rows,
            input.reviewBatchReference ?? `OBR-${crypto.randomUUID()}`,
          )
        : service.validate(orderId, input.rows),
    ));
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_OUTBOUND_SCAN_BATCH" : "OUTBOUND_SCAN_FAILED";
    return NextResponse.json({ code, error: error instanceof Error ? error.message : "Outbound scan failed." }, { status: code === "OUTBOUND_SCAN_FAILED" ? 500 : 400 });
  }
}
