import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { parseQRScan } from "@/domain/scan";
import { OutboundPreparationService } from "@/services/server/outbound-preparation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const row = z.object({
  rowId: z.string().trim().min(1).max(80),
  rawValue: z.string().trim().min(1).max(512),
  included: z.boolean().optional(),
  operatorRemark: z.string().trim().max(240).optional(),
});
const schema = z.object({
  action: z.enum(["validate", "lookup", "confirm"]),
  lineId: z.string().min(1),
  locationCode: z.string().min(1),
  quantity: z.number().positive(),
  rows: z.array(row).max(500).default([]),
  reviewBatchReference: z.string().trim().min(6).max(80).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    const input = schema.parse(await request.json());
    const service = new OutboundPreparationService();
    const serialNumbers = input.rows
      .filter((item) => item.included !== false)
      .map((item) => parseQRScan(item.rawValue).serialNumber);
    if (input.action === "confirm")
      return NextResponse.json(await service.confirm({
        orderId,
        lineId: input.lineId,
        locationCode: input.locationCode,
        quantity: input.quantity,
        serialNumbers,
        reviewBatchReference: input.reviewBatchReference,
      }));
    return NextResponse.json(await service.validate({
      orderId,
      lineId: input.lineId,
      locationCode: input.locationCode,
      quantity: input.quantity,
      serialNumbers,
      reviewBatchReference: input.reviewBatchReference,
    }, input.rows));
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_PREPARATION" : "PREPARATION_FAILED";
    return NextResponse.json(
      { code, error: error instanceof Error ? error.message : "Confirm Preparation failed." },
      { status: code === "PREPARATION_FAILED" ? 500 : 400 },
    );
  }
}
