import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { WmsApplicationService } from "@/services/server/wms-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ shNo: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  try {
    const { shNo } = requestSchema.parse(await request.json());
    return NextResponse.json(await timed(
      { route: "POST /api/erp/outbound/confirm", queryName: "erpOutboundConfirm" },
      () => new WmsApplicationService().confirmOutboundImport(shNo),
    ));
  } catch (error) {
    const status = error instanceof DomainError || error instanceof z.ZodError ? 400 : 502;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "ERP import failed.",
      code: error instanceof DomainError ? error.code : error instanceof z.ZodError ? "INVALID_REQUEST" : "ERP_REQUEST_FAILED",
    }, { status });
  }
}
