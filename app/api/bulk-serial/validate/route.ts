import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { serialsFromUpload } from "@/import/bulk-serial-file";
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
});
const schema = z.discriminatedUnion("mode", [newInbound, faulty]);

export async function POST(request: Request) {
  try {
    const input = request.headers.get("content-type")?.includes("multipart/form-data")
      ? await (async () => {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) throw new DomainError("A serial upload file is required.", "FILE_REQUIRED");
          const mode = form.get("mode");
          const serialNumbers = await serialsFromUpload(file);
          const requestedQty = Number(form.get("expectedQty") ?? 0);
          return schema.parse({
            mode,
            warehouseCode: form.get("warehouseCode"),
            locationCode: form.get("locationCode") || undefined,
            sku: form.get("sku") || undefined,
            expectedQty: mode === "NEW_INBOUND"
              ? requestedQty > 0 ? requestedQty : serialNumbers.length
              : undefined,
            sourceDocument: form.get("sourceDocument") || undefined,
            serialNumbers,
          });
        })()
      : schema.parse(await request.json());
    const service = new BulkOperationsService();
    const result = input.mode === "NEW_INBOUND"
      ? await service.validateNewInbound(input)
      : await service.validateFaulty(input);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_BATCH" : "INTERNAL_ERROR";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk validation failed.", code },
      { status: code === "INTERNAL_ERROR" ? 500 : 400 },
    );
  }
}
