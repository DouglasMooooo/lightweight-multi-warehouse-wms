import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { timed } from "@/lib/performance";
import { WmsApplicationService } from "@/services/server/wms-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await timed(
      { route: "GET /api/erp/health", queryName: "erpHealth" },
      () => new WmsApplicationService().erpHealth(),
    ));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: false,
      adapter: "Unavailable",
      error: error instanceof Error ? error.message : "ERP health check failed.",
      code: error instanceof DomainError ? error.code : "ERP_REQUEST_FAILED",
    }, { status: 503 });
  }
}
