import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { PageQueryService } from "@/services/server/page-query-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await timed(
    { route: "GET /api/bootstrap", queryName: "applicationBootstrap" },
    () => new PageQueryService().bootstrap(),
  ));
}
