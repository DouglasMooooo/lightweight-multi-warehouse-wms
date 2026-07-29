import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { PageQueryService } from "@/services/server/page-query-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const allowed = new Set(["receiving", "repair", "move", "adjustment", "transfers", "stocktake", "exceptions", "admin"]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const section = params.get("section") || "";
  const warehouse = params.get("warehouse") || "SYD";
  if (!allowed.has(section))
    return NextResponse.json({ error: "Unsupported operations page." }, { status: 400 });
  return NextResponse.json(await timed(
    { route: "GET /api/operations", queryName: `operations:${section}` },
    () => new PageQueryService().operations(section, warehouse),
  ));
}
