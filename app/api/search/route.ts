import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { GlobalSearchService } from "@/services/server/global-search-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const warehouse = url.searchParams.get("warehouse") || undefined;
  try {
    return NextResponse.json(await timed(
      { route: "GET /api/search", queryName: "globalOperationalSearch" },
      () => new GlobalSearchService().search(query, warehouse),
    ));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Search failed.",
      code: "SEARCH_FAILED",
    }, { status: 500 });
  }
}
