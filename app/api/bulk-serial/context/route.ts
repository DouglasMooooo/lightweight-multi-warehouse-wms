import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { BulkOperationsService } from "@/services/server/bulk-operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

export async function GET(request: Request) {
  const warehouse = new URL(request.url).searchParams.get("warehouse") || "SYD";
  return NextResponse.json(await timed(
    { route: "GET /api/bulk-serial/context", queryName: "bulkSerialContext", rowCount: (value) => value.products.length + value.locations.length },
    () => new BulkOperationsService().context(warehouse),
  ));
}
