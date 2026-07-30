import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { BatchTransferService } from "@/services/server/batch-transfer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  action: z.enum(["validate", "confirm"]),
  sourceWarehouse: z.enum(["SYD", "MEL", "BNE"]),
  destinationWarehouse: z.enum(["SYD", "MEL", "BNE"]),
  requiredCondition: z.enum(["New", "Repair_Good", "Repair"]),
  transferReference: z.string().trim().min(3).max(64),
  rawValues: z.array(z.string().min(1)).min(1).max(100),
  allowRepair: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const service = new BatchTransferService();
    const result = await timed(
      { route: "POST /api/transfers/batch", queryName: `transferBatch:${input.action}`, rowCount: () => input.rawValues.length },
      () => input.action === "confirm" ? service.confirm(input) : service.validate(input),
    );
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_TRANSFER_BATCH" : "TRANSFER_BATCH_FAILED";
    return NextResponse.json({ code, error: error instanceof Error ? error.message : "Transfer batch failed." }, { status: code === "TRANSFER_BATCH_FAILED" ? 500 : 400 });
  }
}
