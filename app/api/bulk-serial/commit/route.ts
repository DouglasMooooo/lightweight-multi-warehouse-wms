import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { BulkOperationsService } from "@/services/server/bulk-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const newInbound = z.object({
  mode: z.literal("NEW_INBOUND"),
  warehouseCode: z.string().min(1),
  locationCode: z.string().min(1),
  sku: z.string().min(1),
  expectedQty: z.number().int().positive(),
  serialNumbers: z.array(z.string()).min(1).max(5000),
  sourceDocument: z.string().max(120).optional(),
});
const faulty = z.object({
  mode: z.literal("FAULTY_RECEIVING"),
  warehouseCode: z.string().min(1),
  locationCode: z.string().min(1).optional(),
  serialNumbers: z.array(z.string()).min(1).max(500),
  acceptSerialNumbers: z.array(z.string()).min(1).max(500),
});
const legacy = z.object({
  mode: z.literal("LEGACY_REPAIR_GOOD"),
  warehouseCode: z.string().min(1),
  locationCode: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  serialNumbers: z.array(z.string()).max(5000),
  reason: z.string().min(1).max(500),
});
const schema = z.discriminatedUnion("mode", [newInbound, faulty, legacy]);

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const service = new BulkOperationsService();
    const result = input.mode === "NEW_INBOUND"
      ? await service.commitNewInbound(input)
      : input.mode === "FAULTY_RECEIVING"
        ? await service.commitFaulty(input)
        : await service.commitLegacyRepairGood(input);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_BATCH" : "INTERNAL_ERROR";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk operation failed.", code },
      { status: code === "INTERNAL_ERROR" ? 500 : 400 },
    );
  }
}
