import { describe, expect, it, vi } from "vitest";
import {
  outboundOperatorStage,
  outboundQueueFor,
  statusesForOutboundQueue,
} from "@/domain/outbound-presentation";
import { BulkScanSession, parseQRScan, QRScanResolver, type ScanResult } from "@/domain/scan";
import { buildPickupBatchLabels, buildUnitSNLabels } from "@/domain/label-policy";
import { translate } from "@/i18n/config";
import { groupValidTransferScans } from "@/domain/transfer-scan";
import { sydWarehouseLayout, sydneyAreaForLocation } from "@/warehouse-layouts/syd";

describe("Sprint 6 outbound presentation semantics", () => {
  it("maps physical workflow states to operator-facing queues without changing domain codes", () => {
    expect(outboundOperatorStage("Imported")).toBe("TO_PREPARE");
    expect(outboundOperatorStage("Partially_Prepared")).toBe("PARTIALLY_PREPARED");
    expect(outboundOperatorStage("Prepared")).toBe("AWAITING_PICKUP");
    expect(outboundOperatorStage("Ready_for_Pickup")).toBe("AWAITING_PICKUP");
    expect(outboundOperatorStage("Outbound")).toBe("OUTBOUND");
    expect(outboundOperatorStage("ERP_Synced")).toBe("ERP_SYNCED");
    expect(outboundOperatorStage("Prepared", "Failed")).toBe("ERP_ISSUE");
    expect(outboundQueueFor("Prepared")).toBe("Awaiting_Pickup");
    expect(statusesForOutboundQueue("To_Prepare")).toContain("Pending_Allocation");
  });

  it("has matching English and Simplified Chinese operator labels", () => {
    for (const key of [
      "outbound.stage.toPrepare",
      "outbound.stage.awaitingPickup",
      "transfer.receiveTitle",
      "label.pickupBatch",
      "map.floorPlan",
    ]) {
      expect(translate("en", key)).not.toContain("⟦");
      expect(translate("zh-CN", key)).not.toBe(translate("en", key));
      expect(translate("zh-CN", key)).not.toBe(key);
    }
  });
});

describe("Sprint 6 shared scan resolver", () => {
  it("parses structured QR, pipe QR and plain SN values", () => {
    expect(parseQRScan("SKU=12-345-67890-12;SN=abc-001")).toMatchObject({
      sku: "12-345-67890-12",
      serialNumber: "ABC-001",
      source: "QR_STRUCTURED",
    });
    expect(parseQRScan("12-345-67890-12|abc-002")).toMatchObject({
      sku: "12-345-67890-12",
      serialNumber: "ABC-002",
      source: "QR_STRUCTURED",
    });
    expect(parseQRScan(" abc-003 ")).toMatchObject({
      serialNumber: "ABC-003",
      source: "MANUAL",
    });
  });

  it("prefers WMS, falls back to ERP and never invents an unknown SKU", async () => {
    const findWms = vi.fn(async (serialNumber: string) =>
      serialNumber === "WMS-1"
        ? { serialNumber, sku: "12-345-67890-12", model: "H3" }
        : null,
    );
    const findErp = vi.fn(async (serialNumber: string) =>
      serialNumber === "ERP-1"
        ? { serialNumber, sku: "98-765-43210-01", model: "AIO" }
        : null,
    );
    const resolver = new QRScanResolver(findWms, findErp);
    expect((await resolver.resolve("WMS-1", "scan-1")).source).toBe("WMS_SERIAL");
    expect((await resolver.resolve("ERP-1", "scan-2")).source).toBe("ERP_LOOKUP");
    const unknown = await resolver.resolve("UNKNOWN-1", "scan-3");
    expect(unknown.validationStatus).toBe("MANUAL_REVIEW");
    expect(unknown.sku).toBeUndefined();
  });

  it("rejects rapid duplicates while keeping the operator session editable", () => {
    const session = new BulkScanSession();
    const first: ScanResult = {
      scanId: "one",
      rawValue: "SN-1",
      serialNumber: "SN-1",
      source: "WMS_SERIAL",
      validationStatus: "VALID",
      message: "ok",
    };
    session.add(first);
    expect(session.add({ ...first, scanId: "two" }).validationStatus).toBe("DUPLICATE_SCAN");
    session.remove("one");
    expect(session.results()).toHaveLength(1);
  });
});

describe("Sprint 6 label policy", () => {
  it("groups pickup batches but keeps ERP warehouses separate", () => {
    const labels = buildPickupBatchLabels([
      {
        shNo: "SH-1",
        pickupCode: "PK-9",
        lines: [
          { sku: "SKU-1", model: "M1", erpWarehouse: "Sydney Good Product Warehouse", qty: 2 },
        ],
      },
      {
        shNo: "SH-2",
        pickupCode: "PK-9",
        lines: [
          { sku: "SKU-1", model: "M1", erpWarehouse: "Sydney Repair Warehouse", qty: 1 },
        ],
      },
    ]);
    expect(labels).toHaveLength(1);
    expect(labels[0].shNos).toEqual(["SH-1", "SH-2"]);
    expect(labels[0].lines).toHaveLength(2);
    expect(labels[0].totalQty).toBe(3);
  });

  it("falls back to one SH batch per page when Pickup Code is missing", () => {
    const labels = buildPickupBatchLabels([
      { shNo: "SH-1", lines: [{ sku: "SKU-1", model: "M1", erpWarehouse: "WH", qty: 1 }] },
      { shNo: "SH-2", lines: [{ sku: "SKU-1", model: "M1", erpWarehouse: "WH", qty: 1 }] },
    ]);
    expect(labels.map((label) => label.groupKey)).toEqual(["SH:SH-1", "SH:SH-2"]);
    expect(labels.every((label) => label.pageCount === 1)).toBe(true);
  });

  it("prints one unit label per SN with quantity one", () => {
    const labels = buildUnitSNLabels([
      { shNo: "SH-1", serialNumber: "SN-1", sku: "SKU-1", model: "M1", erpWarehouse: "WH" },
      { shNo: "SH-1", serialNumber: "SN-2", sku: "SKU-1", model: "M1", erpWarehouse: "WH" },
    ]);
    expect(labels).toHaveLength(2);
    expect(labels.every((label) => label.totalQty === 1 && label.lines[0].qty === 1)).toBe(true);
  });
});

describe("Sprint 6 Sydney SVG layout policy", () => {
  it("keeps layout configuration free of inventory quantities", () => {
    expect(sydWarehouseLayout.map((area) => area.id)).toEqual([
      "REPAIR", "R1", "R2", "RETURN", "FLEX", "DISPATCH",
    ]);
    for (const area of sydWarehouseLayout) {
      expect(area).not.toHaveProperty("qty");
      expect(area).not.toHaveProperty("physicalQty");
      expect(area).not.toHaveProperty("frozenQty");
    }
  });

  it("derives areas from physical rack and service metadata", () => {
    expect(sydneyAreaForLocation({ code: "R1-4-2-L", rack: "R1", zone: "Rack" })).toBe("R1");
    expect(sydneyAreaForLocation({ code: "REPAIR-BENCH-2", zone: "Repair" })).toBe("REPAIR");
    expect(sydneyAreaForLocation({ code: "UNKNOWN", zone: "Unknown" })).toBeUndefined();
  });
});

describe("Sprint 6 scanner-first transfer grouping", () => {
  it("groups 30 Repair_Good machines into product-and-condition transfer lines", async () => {
    const serialRows = Array.from({ length: 30 }, (_, index) => ({
      id: `serial-${index + 1}`,
      serialNumber: `RG-${String(index + 1).padStart(3, "0")}`,
      productId: index < 12 ? "product-eq" : index < 20 ? "product-cq" : "product-h3",
      product: index < 12
        ? { sku: "97-223-00107-00", model: "EQ4800-S" }
        : index < 20
          ? { sku: "97-229-00012-00", model: "CQ6-S" }
          : { sku: "97-230-00001-00", model: "H3" },
      condition: "Repair_Good",
      status: "In_Stock",
      currentWarehouseId: "warehouse-syd",
      currentLocationId: "location-r1",
      currentWarehouse: { code: "SYD" },
      currentLocation: { code: "R1-4-2-L" },
    }));
    const groups = groupValidTransferScans(serialRows.map((row) => ({
      validationStatus: "VALID",
      productId: row.productId,
      sku: row.product.sku,
      model: row.product.model,
      condition: row.condition as "Repair_Good",
      serialId: row.id,
    })));
    expect(groups.reduce((sum, group) => sum + group.quantity, 0)).toBe(30);
    expect(groups.map((group) => [group.sku, group.condition, group.quantity])).toEqual([
      ["97-223-00107-00", "Repair_Good", 12],
      ["97-229-00012-00", "Repair_Good", 8],
      ["97-230-00001-00", "Repair_Good", 10],
    ]);
  });
});
