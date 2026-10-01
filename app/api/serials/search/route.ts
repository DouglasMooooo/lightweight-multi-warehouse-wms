import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { PageQueryService } from "@/services/server/page-query-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await timed(
    { route: "GET /api/serials/search", queryName: "serialPrefixSearch", rowCount: (value) => value.rows.length },
    () => new PageQueryService().serialSearch(params.get("q") ?? "", Number(params.get("limit") ?? 25)),
  );
  return NextResponse.json(result);
}
