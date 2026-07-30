import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { previewScanReviewFile } from "@/import/scan-review-file";
import { timed } from "@/lib/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 6 * 1024 * 1024)
      throw new DomainError("SN upload exceeds the request limit.", "FILE_TOO_LARGE");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new DomainError("An SN file is required.", "FILE_REQUIRED");
    const preview = await timed(
      {
        route: "POST /api/review-batches/parse",
        queryName: "scanReviewFilePreview",
        rowCount: (value) => value.rowsDetected,
      },
      () => previewScanReviewFile(file),
    );
    return NextResponse.json(preview);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : "FILE_PARSE_FAILED";
    return NextResponse.json(
      { code, error: error instanceof Error ? error.message : "SN file could not be parsed." },
      { status: code === "FILE_PARSE_FAILED" ? 500 : 400 },
    );
  }
}
