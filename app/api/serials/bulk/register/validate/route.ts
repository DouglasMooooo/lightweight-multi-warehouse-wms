import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { serialsFromUpload } from "@/import/bulk-serial-file";
import { BulkSerialRegistrationService } from "@/services/server/bulk-serial-registration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  warehouseCode: z.string().min(1),
  locationCode: z.string().min(1),
  sku: z.string().min(1),
  condition: z.enum(["New", "Repair_Good", "Repair", "Scrap", "Material"]),
  serialNumbers: z.array(z.string()).max(5000),
});

export async function POST(request: Request) {
  try {
    let input: z.infer<typeof schema>;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new DomainError("A serial upload file is required.", "FILE_REQUIRED");
      input = schema.parse({
        warehouseCode: form.get("warehouseCode"),
        locationCode: form.get("locationCode"),
        sku: form.get("sku"),
        condition: form.get("condition"),
        serialNumbers: await serialsFromUpload(file),
      });
    } else input = schema.parse(await request.json());
    return NextResponse.json(await new BulkSerialRegistrationService().validate(input));
  } catch (error) {
    const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_BATCH" : "INTERNAL_ERROR";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk registration validation failed.", code },
      { status: code === "INTERNAL_ERROR" ? 500 : 400 },
    );
  }
}
