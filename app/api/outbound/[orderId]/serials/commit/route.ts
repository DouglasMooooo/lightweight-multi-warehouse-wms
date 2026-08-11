import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { BulkSerialService } from "@/services/server/bulk-serial-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  lineId: z.string().min(1),
  serialNumbers: z.array(z.string()).min(1).max(1000),
  registerUnknownSerials: z.array(z.string()).max(1000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const startedAt = performance.now();
  try {
    const { orderId } = await context.params;
    const input = schema.parse(await request.json());
    const result = await new BulkSerialService().commit({ orderId, ...input });
    console.info("wms_timing", {
      route: "POST /api/outbound/:id/serials/commit",
      durationMs: Math.round(performance.now() - startedAt),
      queryName: "bulkSerialCommit",
      rowCount: result.submitted,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_BATCH" : "INTERNAL_ERROR";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk serial commit failed.", code },
      { status: code === "INTERNAL_ERROR" ? 500 : 400 },
    );
  }
}
