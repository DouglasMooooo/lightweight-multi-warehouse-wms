import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { TransferReceiptService } from "@/services/server/transfer-receipt-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const schema = z.object({
  action: z.enum(["validate", "confirm"]),
  destinationLocation: z.string().trim().min(1).max(64),
  rawValues: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: Request, context: { params: Promise<{ transferId: string }> }) {
  try {
    const { transferId } = await context.params;
    const input = schema.parse(await request.json());
    const service = new TransferReceiptService();
    const result = await timed(
      {
        route: "POST /api/transfers/[transferId]/receipt",
        queryName: `transferReceipt:${input.action}`,
        rowCount: () => input.rawValues.length,
      },
      () => input.action === "confirm"
        ? service.confirm(transferId, input.destinationLocation, input.rawValues)
        : service.validate(transferId, input.destinationLocation, input.rawValues),
    );
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof DomainError
      ? error.code
      : error instanceof z.ZodError
        ? "INVALID_TRANSFER_RECEIPT"
        : "TRANSFER_RECEIPT_FAILED";
    return NextResponse.json(
      { code, error: error instanceof Error ? error.message : "Transfer receipt failed." },
      { status: code === "TRANSFER_RECEIPT_FAILED" ? 500 : 400 },
    );
  }
}
