import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { serialsFromUpload } from "@/import/bulk-serial-file";
import { BulkSerialService } from "@/services/server/bulk-serial-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  lineId: z.string().min(1),
  serialNumbers: z.array(z.string()).max(1000),
});

function failure(error: unknown) {
  const code = error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_BATCH" : "INTERNAL_ERROR";
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Bulk serial validation failed.", code },
    { status: code === "INTERNAL_ERROR" ? 500 : 400 },
  );
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const startedAt = performance.now();
  try {
    const { orderId } = await context.params;
    let input: z.infer<typeof schema>;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new DomainError("A serial upload file is required.", "FILE_REQUIRED");
      input = schema.parse({ lineId: form.get("lineId"), serialNumbers: await serialsFromUpload(file) });
    } else input = schema.parse(await request.json());
    const result = await new BulkSerialService().validate({ orderId, ...input });
    console.info("wms_timing", {
      route: "POST /api/outbound/:id/serials/validate",
      durationMs: Math.round(performance.now() - startedAt),
      queryName: "bulkSerialValidation",
      rowCount: result.summary.total,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
