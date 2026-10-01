import { NextResponse } from "next/server";
import type { StockCondition } from "@/domain/types";
import { timed } from "@/lib/performance";
import { InventoryReportService } from "@/services/server/inventory-report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ sku: string }> },
) {
  const { sku } = await context.params;
  const q = new URL(request.url).searchParams;
  const result = await timed(
    { route: "GET /api/reports/inventory/[sku]/locations", queryName: "inventoryProductLocations" },
    () => new InventoryReportService().locations(
      decodeURIComponent(sku),
      q.get("warehouse") || "SYD",
      (q.get("condition") || undefined) as StockCondition | undefined,
    ),
  );
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ error: "Product inventory report not found.", code: "REPORT_PRODUCT_NOT_FOUND" }, { status: 404 });
}
