import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { TransferReviewService } from "@/services/server/transfer-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  action: z.enum(["validate", "lookup", "confirm"]),
  sourceWarehouse: z.enum(["SYD", "MEL", "BNE"]),
  destinationWarehouse: z.enum(["SYD", "MEL", "BNE"]),
  requiredCondition: z.enum(["New", "Repair_Good", "Repair"]),
  transferReference: z.string().trim().min(3).max(64),
  rows: z.array(z.object({
    rowId: z.string().trim().min(1).max(80),
    rawValue: z.string().trim().min(1).max(512),
    supportingSku: z.string().trim().max(80).optional(),
    supportingShNo: z.string().trim().max(80).optional(),
    targetLineId: z.string().trim().max(80).optional(),
    included: z.boolean().optional(),
    operatorRemark: z.string().trim().max(240).optional(),
  })).min(1).max(500),
  allowRepair: z.boolean().optional(),
  reviewBatchReference: z.string().trim().min(6).max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const service = new TransferReviewService();
    const result = await timed<unknown>(
      { route: "POST /api/transfers/batch", queryName: `transferReview:${input.action}`, rowCount: () => input.rows.length },
      () => input.action === "confirm" ? service.confirm(input) : service.validate(input),
    );
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_TRANSFER_BATCH" : "TRANSFER_BATCH_FAILED";
    return NextResponse.json({ code, error: error instanceof Error ? error.message : "Transfer batch failed." }, { status: code === "TRANSFER_BATCH_FAILED" ? 500 : 400 });
  }
}
