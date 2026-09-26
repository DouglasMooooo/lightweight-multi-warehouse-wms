import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { ShadowImportService } from "@/services/server/shadow-import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const modeSchema = z.enum(["DRY_RUN", "SHADOW_SEED"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("An .xlsx file is required.", "FILE_REQUIRED");
    const cutoverAt = new Date(String(form.get("cutoverAt") ?? ""));
    if (Number.isNaN(cutoverAt.valueOf()))
      throw new DomainError("A valid shadow cutover timestamp is required.", "INVALID_CUTOVER_AT");
    const mode = modeSchema.parse(form.get("mode") ?? "DRY_RUN");
    const result = await timed(
      {
        route: "POST /api/reconciliation",
        queryName: "workbookReconciliation",
        rowCount: (value) => value.workbookRows,
      },
      async () => new ShadowImportService().run({
        buffer: Buffer.from(await file.arrayBuffer()),
        sourceFileName: file.name,
        mode,
        cutoverAt,
        replaceExisting: form.get("replaceExisting") === "true",
      }),
    );
    console.info("Shadow import completed", {
      batchKey: result.batchKey,
      fileName: result.sourceFileName,
      checksum: result.sourceChecksum,
      mode,
      totalRows: result.workbookRows,
      acceptedRows: result.acceptedRows,
      warningRows: result.warningRows,
      rejectedRows: result.rejectedRows,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shadow import failed.";
    const code =
      error instanceof DomainError
        ? error.code
        : error instanceof z.ZodError
          ? "INVALID_IMPORT_REQUEST"
          : "INTERNAL_ERROR";
    return NextResponse.json({ error: message, code }, { status: code === "INTERNAL_ERROR" ? 500 : 400 });
  }
}
