import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { BulkSerialRegistrationService } from "@/services/server/bulk-serial-registration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  warehouseCode: z.string().min(1),
  locationCode: z.string().min(1),
  sku: z.string().min(1),
  condition: z.enum(["New", "Repair_Good", "Repair", "Scrap", "Material"]),
  serialNumbers: z.array(z.string()).min(1).max(5000),
});

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await new BulkSerialRegistrationService().commit(schema.parse(await request.json())),
    );
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_BATCH" : "INTERNAL_ERROR";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk registration failed.", code },
      { status: code === "INTERNAL_ERROR" ? 500 : 400 },
    );
  }
}
