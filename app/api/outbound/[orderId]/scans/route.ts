import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { OutboundBatchScanService } from "@/services/server/outbound-batch-scan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  action: z.enum(["validate", "commit"]),
  rawValues: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    const input = schema.parse(await request.json());
    const service = new OutboundBatchScanService();
    return NextResponse.json(await timed(
      { route: "POST /api/outbound/:id/scans", queryName: `outboundBatchScan:${input.action}`, rowCount: () => input.rawValues.length },
      () => input.action === "commit" ? service.commit(orderId, input.rawValues) : service.validate(orderId, input.rawValues),
    ));
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_OUTBOUND_SCAN_BATCH" : "OUTBOUND_SCAN_FAILED";
    return NextResponse.json({ code, error: error instanceof Error ? error.message : "Outbound scan failed." }, { status: code === "OUTBOUND_SCAN_FAILED" ? 500 : 400 });
  }
}
