import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import type { WmsCommand } from "@/domain/types";
import { WmsApplicationService } from "@/services/server/wms-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const condition = z.enum(["New", "Repair_Good", "Repair", "Scrap", "Material"]);
const warehouse = z.enum(["SYD", "MEL", "BNE"]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("importOutbound"),
    shNo: z.string().min(1),
  }),
  z.object({
    type: z.literal("allocateOutbound"),
    orderId: z.string().min(1),
    lineId: z.string().min(1),
    locationCode: z.string().min(1),
    qty: z.number().positive(),
    containerCode: z.string().optional(),
  }),
  z.object({
    type: z.literal("prepareOutbound"),
    orderId: z.string().min(1),
    lineId: z.string().min(1),
    allocationIds: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    type: z.literal("scanOutboundSerial"),
    orderId: z.string().min(1),
    lineId: z.string().min(1),
    serialNumber: z.string().min(1),
  }),
  z.object({ type: z.literal("dispatchOutbound"), orderId: z.string().min(1) }),
  z.object({
    type: z.literal("registerSerial"),
    serialNumber: z.string().min(1),
    sku: z.string().min(1),
    warehouseCode: warehouse,
    locationCode: z.string().min(1),
    condition,
  }),
  z.object({
    type: z.literal("adjustStock"),
    direction: z.enum(["In", "Out"]),
    warehouseCode: warehouse,
    locationCode: z.string().min(1),
    sku: z.string().optional(),
    itemType: z.enum(["Product", "Material"]),
    condition,
    qty: z.number().positive(),
    reason: z.string().min(1),
    remark: z.string().min(1),
    serialNumber: z.string().optional(),
  }),
  z.object({ type: z.literal("receiveFaulty"), serialNumber: z.string().min(1) }),
  z.object({
    type: z.literal("startRepair"),
    repairJobId: z.string().min(1),
    remark: z.string().min(1),
  }),
  z.object({
    type: z.literal("completeRepair"),
    repairJobId: z.string().min(1),
    targetLocationCode: z.string().min(1),
    outcome: z.enum(["Repair_Good", "Scrap", "Returned_Unrepaired"]),
    remark: z.string().min(1),
  }),
  z.object({
    type: z.literal("legacyRepairGoodIn"),
    warehouseCode: warehouse,
    locationCode: z.string().min(1),
    sku: z.string().min(1),
    qty: z.number().positive(),
    reason: z.string().min(1),
    remark: z.string().min(1),
    serialNumber: z.string().optional(),
  }),
  z.object({
    type: z.literal("moveStock"),
    warehouseCode: warehouse,
    sku: z.string().min(1),
    condition,
    fromLocation: z.string().min(1),
    toLocation: z.string().min(1),
    qty: z.number().positive(),
    remark: z.string().min(1),
    serialNumbers: z.array(z.string().min(1)).optional(),
  }),
  z.object({ type: z.literal("dispatchTransfer"), transferId: z.string().min(1) }),
  z.object({
    type: z.literal("receiveTransfer"),
    transferId: z.string().min(1),
    destinationLocation: z.string().min(1),
  }),
  z.object({ type: z.literal("resetDemo") }),
]);

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Warehouse operation failed.";
  const status = error instanceof DomainError || error instanceof z.ZodError ? 400 : 500;
  const code =
    error instanceof DomainError
      ? error.code
      : error instanceof z.ZodError
        ? "INVALID_COMMAND"
        : "INTERNAL_ERROR";
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET() {
  try {
    return NextResponse.json(await new WmsApplicationService().snapshot());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const command = commandSchema.parse(await request.json()) as WmsCommand;
    return NextResponse.json(await new WmsApplicationService().execute(command));
  } catch (error) {
    return errorResponse(error);
  }
}
