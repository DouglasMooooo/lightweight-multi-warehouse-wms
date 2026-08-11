import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { PageQueryService } from "@/services/server/page-query-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const result = await timed(
    { route: "GET /api/audit", queryName: "auditPage", rowCount: (value) => value.rows.length },
    () => new PageQueryService().audit({
      page: Number(q.get("page") ?? 1), pageSize: Number(q.get("pageSize") ?? 50),
      operation: q.get("operation") ?? undefined, businessReference: q.get("businessReference") ?? undefined,
    }),
  );
  return NextResponse.json(result);
}
