import { NextResponse } from "next/server";
import { z } from "zod";
import { timed } from "@/lib/performance";
import { QRScanService } from "@/services/server/qr-scan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  rawValues: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json(await timed(
      { route: "POST /api/scans/resolve", queryName: "qrScanResolve", rowCount: () => input.rawValues.length },
      () => new QRScanService().resolveBatch(input.rawValues),
    ));
  } catch (error) {
    return NextResponse.json({
      code: error instanceof z.ZodError ? "INVALID_SCAN_BATCH" : "SCAN_RESOLUTION_FAILED",
      error: error instanceof Error ? error.message : "Scan resolution failed.",
    }, { status: 400 });
  }
}
