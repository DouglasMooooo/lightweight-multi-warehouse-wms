import { NextResponse } from "next/server";
import type { ItemType, StockCondition } from "@/domain/types";
import { timed } from "@/lib/performance";
import { InventoryReportService } from "@/services/server/inventory-report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yes = (value: string | null) => value === "true" || value === "1";

function queryFrom(request: Request) {
  const q = new URL(request.url).searchParams;
  return {
    page: Number(q.get("page") ?? 1),
    pageSize: Number(q.get("pageSize") ?? 50),
    warehouse: q.get("warehouse") ?? undefined,
    query: q.get("q") ?? undefined,
    itemType: (q.get("itemType") ?? "Product") as ItemType | "All",
    condition: (q.get("condition") || undefined) as StockCondition | undefined,
    location: q.get("location") ?? undefined,
    availableOnly: yes(q.get("availableOnly")),
    frozenOnly: yes(q.get("frozenOnly")),
    legacyOnly: yes(q.get("legacyOnly")),
    sort: (q.get("sort") ?? "physical") as "sku" | "physical" | "available" | "frozen" | "inTransit",
    order: (q.get("order") ?? "desc") as "asc" | "desc",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = queryFrom(request);
  const service = new InventoryReportService();
  if (url.searchParams.get("format") === "csv") {
    const csv = await timed(
      { route: "GET /api/reports/inventory", queryName: "inventoryReportCsv" },
      () => service.csv(input),
    );
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="product-inventory-report.csv"',
      },
    });
  }
  return NextResponse.json(await timed(
    { route: "GET /api/reports/inventory", queryName: "inventoryReport", rowCount: (value) => value.rows.length },
    () => service.report(input),
  ));
}
