import { describe, expect, it, vi } from "vitest";
import {
  deriveWarehouseLocationState,
  sortRackLocations,
  splitWarehouseLocations,
} from "@/domain/warehouse-map";
import type { ERPAdapter, ERPOutboundOrder } from "@/integrations/erp-adapter";
import { createERPAdapter } from "@/integrations/erp-adapter-factory";
import { KingdeeERPAdapter } from "@/integrations/kingdee-erp-adapter";
import { MockERPAdapter } from "@/integrations/mock-erp-adapter";
import { UnconfiguredERPAdapter } from "@/integrations/unconfigured-erp-adapter";
import { WarehouseMapService } from "@/services/server/warehouse-map-service";
import { WmsApplicationService } from "@/services/server/wms-service";
import { translate, translateStatus } from "@/i18n/config";

vi.mock("server-only", () => ({}));

const erpOrder: ERPOutboundOrder = {
  shNo: "SH-TEST-5001",
  physicalWarehouseCode: "SYD",
  pickupCode: "SYD-5001",
  customerLabel: "Replacement customer",
  replacementUnitInformation: [
    { sku: "SKU-NEW", model: "New model", quantity: 2, erpWarehouse: "Sydney Material Warehouse" },
    { sku: "SKU-RG", model: "Repair good model", quantity: 1, erpWarehouse: "Sydney Good Product Warehouse" },
  ],
};

function adapter(order: ERPOutboundOrder | null = erpOrder): ERPAdapter {
  return {
    findBySerialNumber: vi.fn(async () => null),
    getOutboundOrder: vi.fn(async () => order),
    getTransferOrder: vi.fn(async () => null),
    writeBackOutbound: vi.fn(async () => ({ accepted: true })),
    writeBackTransfer: vi.fn(async () => ({ accepted: true })),
    healthCheck: vi.fn(async () => ({ ok: true, adapter: "TestERP" })),
  };
}

function fakeImportPrisma(input?: {
  missingSku?: string;
  missingMapping?: string;
  duplicate?: { id: string; status: string; pickupCode?: string };
}) {
  const products = [
    { id: "product-new", sku: "SKU-NEW", model: "New model", active: true },
    { id: "product-rg", sku: "SKU-RG", model: "Repair good model", active: true },
  ].filter((row) => row.sku !== input?.missingSku);
  const mappings = [
    { erpWarehouse: "Sydney Material Warehouse", condition: "New", active: true },
    { erpWarehouse: "Sydney Good Product Warehouse", condition: "Repair_Good", active: true },
  ].filter((row) => row.erpWarehouse !== input?.missingMapping);
  let createdOrder: Record<string, unknown> | undefined;
  const outboundCreate = vi.fn(async ({ data }) => {
    createdOrder = { id: "created-order", shNo: data.shNo, status: data.status, pickupCode: data.pickupCode, lineCreates: data.lines.create };
    return createdOrder;
  });
  const tx = {
    user: { findFirst: vi.fn(async () => ({ id: "user-1", active: true, displayName: "Supervisor", role: { name: "Warehouse_Supervisor" } })) },
    warehouse: {
      findFirstOrThrow: vi.fn(async () => ({ id: "warehouse-syd", code: "SYD" })),
    },
    product: {
      findFirst: vi.fn(async ({ where }) => products.find((row) => row.sku === where.sku) ?? null),
    },
    outboundOrder: {
      findUnique: vi.fn(async () => createdOrder ?? input?.duplicate ?? null),
      create: outboundCreate,
    },
    eRPDocument: { create: vi.fn(async () => ({ id: "erp-doc" })) },
    auditLog: { create: vi.fn(async () => ({ id: "audit-1" })) },
  };
  const prisma = {
    warehouse: {
      findUnique: vi.fn(async ({ where }) => where.code === "SYD" ? { id: "warehouse-syd", code: "SYD" } : null),
    },
    product: { findMany: vi.fn(async () => products) },
    eRPWarehouseMapping: { findMany: vi.fn(async () => mappings) },
    outboundOrder: {
      findUnique: vi.fn(async () => input?.duplicate ?? null),
      findUniqueOrThrow: vi.fn(async () => createdOrder ?? input?.duplicate),
    },
    eRPDocument: { findFirst: vi.fn(async () => null) },
    eRPSyncJob: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (work) => work(tx)),
  };
  return { prisma, outboundCreate, getCreated: () => createdOrder };
}

describe("Sprint 5 ERP adapter selection", () => {
  it("uses Mock only for local development/test defaults", () => {
    expect(createERPAdapter({ APP_ENV: "development" })).toBeInstanceOf(MockERPAdapter);
    expect(createERPAdapter({ APP_ENV: "test" })).toBeInstanceOf(MockERPAdapter);
  });

  it("does not silently select Mock for Preview", async () => {
    const selected = createERPAdapter({ APP_ENV: "preview" });
    expect(selected).toBeInstanceOf(UnconfiguredERPAdapter);
    await expect(selected.healthCheck()).resolves.toEqual({ ok: false, adapter: "Not configured" });
  });

  it("forbids Mock and missing explicit configuration in Production", () => {
    expect(() => createERPAdapter({ APP_ENV: "production", ERP_ADAPTER: "mock" })).toThrow("Production cannot use Mock");
    expect(() => createERPAdapter({ APP_ENV: "production" })).toThrow("Unsupported ERP adapter");
  });

  it("selects Kingdee only with complete configuration", () => {
    const selected = createERPAdapter({
      APP_ENV: "preview",
      ERP_ADAPTER: "kingdee",
      KINGDEE_BASE_URL: "https://erp-gateway.example.invalid",
      KINGDEE_ACCESS_TOKEN: "test-token",
      KINGDEE_SERIAL_LOOKUP_PATH: "/serial",
      KINGDEE_OUTBOUND_ORDER_PATH: "/outbound",
      KINGDEE_TRANSFER_ORDER_PATH: "/transfer",
      KINGDEE_OUTBOUND_WRITEBACK_PATH: "/outbound/writeback",
      KINGDEE_TRANSFER_WRITEBACK_PATH: "/transfer/writeback",
      KINGDEE_HEALTH_PATH: "/health",
    });
    expect(selected).toBeInstanceOf(KingdeeERPAdapter);
  });
});

describe("Sprint 5 two-step ERP import", () => {
  it("previews multi-line mixed-condition replacement demand without creating an order", async () => {
    const fake = fakeImportPrisma();
    const service = new WmsApplicationService(fake.prisma as never, adapter());
    const preview = await service.previewOutboundImport(erpOrder.shNo);
    expect(preview.status).toBe("Ready");
    expect(preview.order.lines.map((line) => line.wmsCondition)).toEqual(["New", "Repair_Good"]);
    expect(fake.outboundCreate).not.toHaveBeenCalled();
  });

  it("returns actionable Product and ERP mapping issues", async () => {
    const missingProduct = fakeImportPrisma({ missingSku: "SKU-RG" });
    const productPreview = await new WmsApplicationService(missingProduct.prisma as never, adapter()).previewOutboundImport(erpOrder.shNo);
    expect(productPreview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ERP_PRODUCT_NOT_FOUND", value: "SKU-RG" }),
    ]));
    const missingMapping = fakeImportPrisma({ missingMapping: "Sydney Good Product Warehouse" });
    const mappingPreview = await new WmsApplicationService(missingMapping.prisma as never, adapter()).previewOutboundImport(erpOrder.shNo);
    expect(mappingPreview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ERP_WAREHOUSE_MAPPING_MISSING", value: "Sydney Good Product Warehouse" }),
    ]));
  });

  it("returns existing order context for duplicate SH", async () => {
    const fake = fakeImportPrisma({ duplicate: { id: "existing-1", status: "Prepared", pickupCode: "SYD-00991" } });
    const preview = await new WmsApplicationService(fake.prisma as never, adapter()).previewOutboundImport(erpOrder.shNo);
    expect(preview.status).toBe("Already_Imported");
    expect(preview.existingOrder).toEqual({ id: "existing-1", status: "Prepared", pickupCode: "SYD-00991" });
  });

  it("creates one order with both lines only after confirmation", async () => {
    const fake = fakeImportPrisma();
    const result = await new WmsApplicationService(fake.prisma as never, adapter()).confirmOutboundImport(erpOrder.shNo);
    expect(result.imported).toBe(true);
    expect(fake.outboundCreate).toHaveBeenCalledTimes(1);
    expect(fake.getCreated()?.lineCreates).toHaveLength(2);
    expect(fake.getCreated()?.lineCreates).toEqual(expect.arrayContaining([
      expect.objectContaining({ requiredCondition: "New", erpWarehouse: "Sydney Material Warehouse" }),
      expect.objectContaining({ requiredCondition: "Repair_Good", erpWarehouse: "Sydney Good Product Warehouse" }),
    ]));
  });
});

describe("Sprint 5 warehouse map layout and state", () => {
  it("orders rows high-to-low, bays left-to-right and sides L/M/R", () => {
    const sorted = sortRackLocations([
      { code: "R1-1-2-R", rack: "R1", row: 1, bay: 2, side: "R", serviceZone: false },
      { code: "R1-4-2-M", rack: "R1", row: 4, bay: 2, side: "M", serviceZone: false },
      { code: "R1-4-1-R", rack: "R1", row: 4, bay: 1, side: "R", serviceZone: false },
      { code: "R1-4-1-L", rack: "R1", row: 4, bay: 1, side: "L", serviceZone: false },
    ]);
    expect(sorted.map((row) => row.code)).toEqual(["R1-4-1-L", "R1-4-1-R", "R1-4-2-M", "R1-1-2-R"]);
  });

  it("renders service zones separately from structured racks", () => {
    const split = splitWarehouseLocations([
      { code: "R1-1-1-L", rack: "R1", row: 1, bay: 1, side: "L", serviceZone: false },
      { code: "REPAIR-01", serviceZone: true },
    ]);
    expect(split.rackLocations.map((row) => row.code)).toEqual(["R1-1-1-L"]);
    expect(split.serviceLocations.map((row) => row.code)).toEqual(["REPAIR-01"]);
  });

  it("recognizes empty, mixed, repair and frozen states", () => {
    expect(deriveWarehouseLocationState({ physicalQty: 0, frozenQty: 0, skuCount: 0, conditions: [], exceptionCount: 0 })).toBe("Empty");
    expect(deriveWarehouseLocationState({ physicalQty: 4, frozenQty: 0, skuCount: 2, conditions: ["New"], exceptionCount: 0 })).toBe("Mixed");
    expect(deriveWarehouseLocationState({ physicalQty: 1, frozenQty: 0, skuCount: 1, conditions: ["Repair"], exceptionCount: 0 })).toBe("Repair");
    expect(deriveWarehouseLocationState({ physicalQty: 3, frozenQty: 1, skuCount: 1, conditions: ["New"], exceptionCount: 0 })).toBe("Frozen");
  });

  it("does not preload serial objects for the initial map", async () => {
    const serialFind = vi.fn(async () => { throw new Error("serial preload must not run"); });
    const service = new WarehouseMapService({
      warehouse: { findUniqueOrThrow: vi.fn(async () => ({ id: "warehouse-syd", code: "SYD", name: "Sydney", timezone: "Australia/Sydney" })) },
      location: { findMany: vi.fn(async () => []) },
      exception: { findMany: vi.fn(async () => []) },
      inventoryBalance: { findMany: vi.fn(async () => []) },
      serialNumber: { findMany: serialFind },
    } as never);
    const result = await service.map("SYD");
    expect(serialFind).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("serials");
  });
});

describe("Sprint 5 bilingual operator presentation", () => {
  it("renders ERP and Warehouse Map labels in English and Simplified Chinese", () => {
    expect(translate("en", "map.title")).toBe("Warehouse Map");
    expect(translate("zh-CN", "map.title")).toBe("仓库库位图");
    expect(translate("en", "erp.confirmImport")).toBe("Confirm Import");
    expect(translate("zh-CN", "erp.confirmImport")).toBe("确认导入");
  });

  it("keeps domain codes unchanged while translating presentation labels", () => {
    expect(translateStatus("en", "Repair_Good")).toBe("Repair Good");
    expect(translateStatus("zh-CN", "Repair_Good")).not.toBe("Repair_Good");
    expect("Repair_Good").toBe("Repair_Good");
  });
});
