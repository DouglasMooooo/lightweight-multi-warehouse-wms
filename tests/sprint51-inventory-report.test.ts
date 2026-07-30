import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  aggregateInventoryReport,
  applyInventoryReportFilters,
  buildInventoryReportCsv,
} from "@/domain/inventory-report";
import { sortRackLocations } from "@/domain/warehouse-map";
import { InventoryReportService } from "@/services/server/inventory-report-service";
import { WarehouseMapService } from "@/services/server/warehouse-map-service";
import { translate } from "@/i18n/config";

vi.mock("server-only", () => ({}));

const balanceInputs = [
  {
    warehouseCode: "SYD", productId: "p1", sku: "SKU-P", model: "EQ4800-S", itemType: "Product" as const,
    condition: "New" as const, locationId: "l1", physicalQty: 10, frozenQty: 2, inTransitQty: 1,
    legacySerialGap: false,
  },
  {
    warehouseCode: "SYD", productId: "p1", sku: "SKU-P", model: "EQ4800-S", itemType: "Product" as const,
    condition: "Repair_Good" as const, locationId: "l2", physicalQty: 3, frozenQty: 0, inTransitQty: 0,
    legacySerialGap: true,
  },
  {
    warehouseCode: "SYD", productId: "m1", sku: "SKU-M", model: "Packing Material", itemType: "Material" as const,
    condition: "Material" as const, locationId: "l3", physicalQty: 20, frozenQty: 5, inTransitQty: 0,
    legacySerialGap: false,
  },
];

describe("Sprint 5.1 product inventory reporting", () => {
  it("aggregates Inventory Balance quantities with correct availability and condition breakdown", () => {
    const [row] = aggregateInventoryReport(balanceInputs.slice(0, 2));
    expect(row).toMatchObject({
      physicalQty: 13,
      frozenQty: 2,
      availableQty: 11,
      inTransitQty: 1,
      newQty: 10,
      repairGoodQty: 3,
      repairQty: 0,
      locationCount: 2,
      legacySerialGap: true,
    });
  });

  it("keeps SN coverage separate from inventory quantity", () => {
    const [row] = aggregateInventoryReport(
      balanceInputs.slice(0, 2),
      new Map([["SYD:p1", 9]]),
    );
    expect(row.physicalQty).toBe(13);
    expect(row.knownSerialCount).toBe(9);
    expect(row.serialCoverageGap).toBe(4);
  });

  it("separates Product and Material report scopes", () => {
    const rows = aggregateInventoryReport(balanceInputs);
    expect(applyInventoryReportFilters(rows, { itemType: "Product" }).map((row) => row.sku)).toEqual(["SKU-P"]);
    expect(applyInventoryReportFilters(rows, { itemType: "Material" }).map((row) => row.sku)).toEqual(["SKU-M"]);
  });

  it("exports only the currently filtered report rows", () => {
    const rows = applyInventoryReportFilters(aggregateInventoryReport(balanceInputs), {
      itemType: "Product",
      availableOnly: true,
    });
    const csv = buildInventoryReportCsv(rows);
    expect(csv).toContain("SKU-P");
    expect(csv).not.toContain("SKU-M");
    expect(csv).toContain("Physical,Available,Frozen");
  });

  it("builds the bounded API result from database aggregates", async () => {
    const decimal = (value: number) => new Prisma.Decimal(value);
    const service = new InventoryReportService({
      inventoryBalance: {
        groupBy: vi.fn(async () => [
          {
            warehouseId: "w1", productId: "p1", locationId: "l1", itemType: "Product",
            condition: "New", legacySerialGap: false,
            _sum: { physicalQty: decimal(8), frozenQty: decimal(3), inTransitQty: decimal(2) },
          },
        ]),
      },
      product: {
        findMany: vi.fn(async () => [{ id: "p1", sku: "SKU-P", model: "EQ4800-S", itemType: "Product" }]),
      },
      warehouse: {
        findMany: vi.fn(async () => [{ id: "w1", code: "SYD" }]),
      },
      serialNumber: {
        groupBy: vi.fn(async () => [{ productId: "p1", currentWarehouseId: "w1", _count: { _all: 5 } }]),
      },
    } as never);
    const result = await service.report({ warehouse: "SYD", itemType: "Product" });
    expect(result.summary).toMatchObject({ physicalQty: 8, availableQty: 5, frozenQty: 3, inTransitQty: 2 });
    expect(result.rows[0]).toMatchObject({ knownSerialCount: 5, physicalQty: 8, availableQty: 5 });
  });
});

describe("Sprint 5.1 warehouse map search and structure", () => {
  it("keeps R1/R2 and L/M/R ordering driven by structured fields", () => {
    const sorted = sortRackLocations([
      { code: "R2-right", rack: "R2", row: 1, bay: 1, side: "R", serviceZone: false },
      { code: "R1-middle", rack: "R1", row: 4, bay: 1, side: "M", serviceZone: false },
      { code: "R1-left", rack: "R1", row: 4, bay: 1, side: "L", serviceZone: false },
    ]);
    expect(sorted.map((row) => row.code)).toEqual(["R1-left", "R1-middle", "R2-right"]);
  });

  it("highlights map locations found by SKU without preloading serials", async () => {
    const serialFind = vi.fn(async () => []);
    const result = await new WarehouseMapService({
      warehouse: { findUniqueOrThrow: vi.fn(async () => ({ id: "w1", code: "SYD", name: "Sydney", timezone: "Australia/Sydney" })) },
      location: { findMany: vi.fn(async () => [{ id: "l1", code: "R1-4-2-L", zone: "Rack", rack: "R1", row: 4, bay: 2, side: "L", serviceZone: false, balances: [] }]) },
      exception: { findMany: vi.fn(async () => []) },
      inventoryBalance: { findMany: vi.fn(async () => [{ location: { code: "R1-4-2-L" } }]) },
      serialNumber: { findMany: serialFind },
    } as never).map("SYD", "EQ4800-S");
    expect(result.matchingLocationCodes).toEqual(["R1-4-2-L"]);
    expect(serialFind).toHaveBeenCalledTimes(1);
  });

  it("highlights the exact current location found by SN", async () => {
    const result = await new WarehouseMapService({
      warehouse: { findUniqueOrThrow: vi.fn(async () => ({ id: "w1", code: "SYD", name: "Sydney", timezone: "Australia/Sydney" })) },
      location: { findMany: vi.fn(async () => [{ id: "l1", code: "R2-1-1-R", zone: "Rack", rack: "R2", row: 1, bay: 1, side: "R", serviceZone: false, balances: [] }]) },
      exception: { findMany: vi.fn(async () => []) },
      inventoryBalance: { findMany: vi.fn(async () => []) },
      serialNumber: { findMany: vi.fn(async () => [{ currentLocation: { code: "R2-1-1-R" } }]) },
    } as never).map("SYD", "60E123");
    expect(result.matchingLocationCodes).toEqual(["R2-1-1-R"]);
  });
});

describe("Sprint 5.1 bilingual presentation", () => {
  it("contains English and Simplified Chinese inventory report labels", () => {
    expect(translate("en", "report.title")).toBe("Product Inventory Report");
    expect(translate("zh-CN", "report.title")).toBe("产品库存报表");
    expect(translate("en", "map.summary.frozen")).toBe("Frozen Locations");
    expect(translate("zh-CN", "map.summary.frozen")).toBe("冻结库位");
  });
});
