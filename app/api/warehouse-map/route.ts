import { NextResponse } from "next/server";
import { timed } from "@/lib/performance";
import { WarehouseMapService } from "@/services/server/warehouse-map-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const warehouse = url.searchParams.get("warehouse") || "SYD";
  const location = url.searchParams.get("location");
  const rack = url.searchParams.get("rack");
  const area = url.searchParams.get("area");
  const query = url.searchParams.get("q") || "";
  try {
    if (location) {
      const detail = await timed(
        { route: "GET /api/warehouse-map", queryName: "warehouseLocationDetail" },
        () => new WarehouseMapService().detail(warehouse, location),
      );
      if (!detail) return NextResponse.json({ error: "Location not found.", code: "LOCATION_NOT_FOUND" }, { status: 404 });
      return NextResponse.json(detail);
    }
    if (rack) return NextResponse.json(await timed(
      { route: "GET /api/warehouse-map", queryName: "warehouseRackView", rowCount: (value) => value.locations.length },
      () => new WarehouseMapService().rack(warehouse, rack, query),
    ));
    if (area) return NextResponse.json(await timed(
      { route: "GET /api/warehouse-map", queryName: "warehouseServiceArea", rowCount: (value) => value.locations.length },
      () => new WarehouseMapService().area(warehouse, area, query),
    ));
    return NextResponse.json(await timed(
      { route: "GET /api/warehouse-map", queryName: "warehouseFloorPlan", rowCount: (value) => value.areas.length },
      () => new WarehouseMapService().floor(warehouse, query),
    ));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Warehouse map could not be loaded.",
      code: "WAREHOUSE_MAP_FAILED",
    }, { status: 500 });
  }
}
