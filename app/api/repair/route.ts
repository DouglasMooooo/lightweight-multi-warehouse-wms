import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { PageQueryService } from "@/services/server/page-query-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await timed(
    { route: "GET /api/repair", queryName: "repairQueue", rowCount: (value) => value.rows.length },
    () => new PageQueryService().repairQueue({
      page: Number(params.get("page") || 1),
      pageSize: Number(params.get("pageSize") || 50),
      warehouse: params.get("warehouse") || undefined,
      status: params.get("status") || undefined,
      query: params.get("q") || undefined,
      serialNumber: params.get("sn") || undefined,
      receivedFrom: params.get("receivedFrom") ? new Date(params.get("receivedFrom")!) : undefined,
      receivedTo: params.get("receivedTo") ? new Date(params.get("receivedTo")!) : undefined,
    }),
  );
  return NextResponse.json(result);
}
