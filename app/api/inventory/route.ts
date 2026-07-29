import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { PageQueryService } from "@/services/server/page-query-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const yes = (value: string | null) => value === "true" || value === "1";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const result = await timed(
    { route: "GET /api/inventory", queryName: "inventoryPage", rowCount: (value) => value.rows.length },
    () => new PageQueryService().inventory({
      page: Number(q.get("page") ?? 1), pageSize: Number(q.get("pageSize") ?? 50),
      warehouse: q.get("warehouse") ?? undefined, location: q.get("location") ?? undefined,
      sku: q.get("sku") ?? undefined, model: q.get("model") ?? undefined,
      condition: q.get("condition") ?? undefined, itemType: q.get("itemType") ?? undefined,
      positiveOnly: yes(q.get("positiveOnly")), anomaliesOnly: yes(q.get("anomaliesOnly")),
      excludeRepair: yes(q.get("excludeRepair")),
    }),
  );
  return NextResponse.json(result);
}
