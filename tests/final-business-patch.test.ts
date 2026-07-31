import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { matchExpectedInboundBatch } from "@/domain/bulk-operations";
import { calculateOperationalKpis } from "@/domain/reporting";
import type { ERPAdapter } from "@/integrations/erp-adapter";
import { LabelPreviewService } from "@/services/server/label-preview-service";
import { BulkOperationsService } from "@/services/server/bulk-operations-service";

vi.mock("server-only", () => ({}));

describe("Final patch batch labels", () => {
  it("loads selected authoritative orders and produces one page per Pickup Code", async () => {
    const orders = [
      {
        id: "order-1",
        shNo: "SH-1",
        pickupCode: "PK-1",
        status: "Ready_for_Pickup",
        warehouse: { code: "SYD" },
        lines: [{
          requiredQty: 2,
          erpWarehouse: "Sydney Good Product Warehouse",
          product: { sku: "SKU-A", model: "MODEL-A" },
        }],
      },
      {
        id: "order-2",
        shNo: "SH-2",
        pickupCode: "PK-1",
        status: "Prepared",
        warehouse: { code: "SYD" },
        lines: [{
          requiredQty: 3,
          erpWarehouse: "Sydney Good Product Warehouse",
          product: { sku: "SKU-A", model: "MODEL-A" },
        }],
      },
      {
        id: "order-3",
        shNo: "SH-3",
        pickupCode: null,
        status: "Ready_for_Pickup",
        warehouse: { code: "SYD" },
        lines: [{
          requiredQty: 1,
          erpWarehouse: "Sydney Repair Warehouse",
          product: { sku: "SKU-B", model: "MODEL-B" },
        }],
      },
    ];
    const prisma = {
      outboundOrder: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          orders.filter((order) => where.id.in.includes(order.id)),
        ),
      },
    };
    const result = await new LabelPreviewService(prisma as never).previewBatch([
      "order-1",
      "order-2",
      "order-3",
    ]);
    expect(result.validation.valid).toBe(true);
    expect(result.totals).toEqual({
      selectedOrders: 3,
      pickupCodes: 2,
      labelPages: 2,
      totalUnits: 6,
    });
    expect(result.labels[0].shNos).toEqual(["SH-1", "SH-2"]);
    expect(result.labels[0].lines[0].qty).toBe(5);
  });

  it("rejects non-Awaiting-Pickup orders instead of trusting the client", async () => {
    const prisma = {
      outboundOrder: {
        findMany: vi.fn(async () => [{
          id: "order-1",
          shNo: "SH-1",
          pickupCode: "PK-1",
          status: "Allocated",
          warehouse: { code: "SYD" },
          lines: [],
        }]),
      },
    };
    const result = await new LabelPreviewService(prisma as never).previewBatch(["order-1"]);
    expect(result.validation.valid).toBe(false);
    expect(result.labels).toEqual([]);
  });
});

describe("Final patch faulty SN automation", () => {
  it("uses WMS outbound history first, ERP fallback second, and detects duplicates", async () => {
    const prisma = {
      warehouse: { findUnique: vi.fn(async () => ({ id: "warehouse-syd", code: "SYD" })) },
      serialNumber: {
        findMany: vi.fn(async () => [{
          id: "serial-wms",
          serialNumber: "WMS-1",
          status: "Outbound",
          sourceDocument: null,
          product: { sku: "SKU-WMS", model: "MODEL-WMS" },
          currentWarehouse: { code: "SYD" },
          repairReturns: [],
        }]),
      },
      outboundAllocation: {
        findMany: vi.fn(async () => [{
          serialNumberId: "serial-wms",
          dispatchedAt: new Date("2026-07-01"),
          outboundOrderLine: { outboundOrder: { shNo: "SH-WMS-1" } },
        }]),
      },
    };
    const erp: ERPAdapter = {
      findBySerialNumber: vi.fn(async (serialNumber) =>
        serialNumber === "ERP-1"
          ? {
              serialNumber,
              relatedShNo: "SH-ERP-1",
              sku: "SKU-ERP",
              model: "MODEL-ERP",
              originalOutboundDate: "2026-07-01",
              warehouse: "Sydney",
              erpStatus: "Returned unit expected",
            }
          : null,
      ),
      getOutboundOrder: vi.fn(async () => null),
      getTransferOrder: vi.fn(async () => null),
      writeBackOutbound: vi.fn(async () => ({ accepted: true })),
      writeBackTransfer: vi.fn(async () => ({ accepted: true })),
      healthCheck: vi.fn(async () => ({ ok: true, adapter: "Test ERP" })),
    };
    const result = await new BulkOperationsService(prisma as never, erp).validateFaulty({
      warehouseCode: "SYD",
      serialNumbers: ["WMS-1", "ERP-1", "ERP-1", "UNKNOWN-1"],
    });
    expect(result.condition).toBe("Repair");
    expect(result.results.map((row) => [row.serialNumber, row.shNo, row.sku, row.code])).toEqual([
      ["WMS-1", "SH-WMS-1", "SKU-WMS", "VALID"],
      ["ERP-1", "SH-ERP-1", "SKU-ERP", "VALID"],
      ["ERP-1", "SH-ERP-1", "SKU-ERP", "DUPLICATE_IN_BATCH"],
      ["UNKNOWN-1", undefined, undefined, "UNKNOWN_SN"],
    ]);
    expect(erp.findBySerialNumber).toHaveBeenCalledTimes(2);
  });
});

describe("Final patch expected inbound matching", () => {
  it("automatically matches normal rows and leaves only discrepancies", () => {
    const result = matchExpectedInboundBatch({
      expected: [
        { serialNumber: "SN-1", sku: "SKU-A" },
        { serialNumber: "SN-2", sku: "SKU-A" },
        { serialNumber: "SN-3", sku: "SKU-B" },
      ],
      received: [
        { serialNumber: "SN-1", sku: "SKU-A" },
        { serialNumber: "SN-2", sku: "SKU-X" },
        { serialNumber: "SN-4", sku: "SKU-B" },
      ],
    });
    expect(result.summary).toEqual({ expected: 3, received: 3, matched: 1, exceptions: 3 });
    expect(result.results.map((row) => row.result)).toEqual([
      "EXPECTED_AND_RECEIVED",
      "SKU_MISMATCH",
      "UNEXPECTED_SN",
      "MISSING",
    ]);
  });
});

describe("Final patch operational KPIs", () => {
  it("calculates operational turnover, inventory days and configured area metrics", () => {
    expect(calculateOperationalKpis({
      openingPhysical: 100,
      closingPhysical: 120,
      outboundQty: 55,
      periodDays: 30,
      floorAreaSqm: 220,
    })).toMatchObject({
      averagePhysical: 110,
      operationalTurnover: 0.5,
      inventoryDays: 60,
      outboundDensity: 0.25,
      inventoryDensity: 0.5,
      areaConfigured: true,
    });
  });

  it("returns unavailable area metrics when warehouse area is missing", () => {
    const result = calculateOperationalKpis({
      openingPhysical: 100,
      closingPhysical: 100,
      outboundQty: 10,
      periodDays: 7,
    });
    expect(result.areaConfigured).toBe(false);
    expect(result.outboundDensity).toBeUndefined();
    expect(result.inventoryDensity).toBeUndefined();
  });

  it("handles a zero-outbound period without dividing by zero", () => {
    const result = calculateOperationalKpis({
      openingPhysical: 100,
      closingPhysical: 100,
      outboundQty: 0,
      periodDays: 30,
    });
    expect(result.operationalTurnover).toBe(0);
    expect(result.inventoryDays).toBeUndefined();
  });
});

describe("Final patch transfer lifecycle", () => {
  it("receives against the existing Transfer ID and never creates a destination transfer", () => {
    const source = readFileSync("services/server/transfer-receipt-service.ts", "utf8");
    expect(source).toContain("transferId,");
    expect(source).toContain('type: "receiveTransfer"');
    expect(source).not.toContain("transferOrder.create");
  });
});
