import { describe, expect, it } from "vitest";
import {
  allocateLine,
  importedOutbound,
  markOutbound,
  prepareAllocations,
} from "@/domain/outbound-workflow";
import { aggregatePickupLabel } from "@/domain/label-policy";
import {
  mondayToSunday,
  operationalMovementMetrics,
  operationalOrderMetrics,
} from "@/domain/reporting";
import {
  completeRepairAsset,
  recogniseLegacyRepairGood,
  startRepairAsset,
} from "@/domain/repair-workflow";
import { reconcileInventory, reconcileSerials } from "@/domain/reconciliation";

describe("Sprint 2 outbound workflow", () => {
  it("imports as Pending Allocation without allocations, frozen stock or outboundAt", () => {
    const order = importedOutbound("SH-A", [2], "2026-07-28T00:00:00Z");
    expect(order.status).toBe("Pending_Allocation");
    expect(order.importedAt).toBe("2026-07-28T00:00:00Z");
    expect(order.lines[0]).toMatchObject({ allocatedQty: 0, preparedQty: 0, allocations: [] });
    expect(order.outboundAt).toBeUndefined();
  });

  it("allocation references physical locations but does not prepare or freeze", () => {
    const imported = importedOutbound("SH-A", [5], "2026-07-28T00:00:00Z");
    const once = allocateLine(imported, 0, { id: "a", locationCode: "FLEX-01", quantity: 2 });
    const allocated = allocateLine(once, 0, { id: "b", locationCode: "R2-1-4-R", quantity: 3 });
    expect(allocated.status).toBe("Allocated");
    expect(allocated.allocatedAt).toBeDefined();
    expect(allocated.lines[0].allocatedQty).toBe(5);
    expect(allocated.lines[0].preparedQty).toBe(0);
    expect(allocated.lines[0].allocations.map((row) => row.locationCode)).toEqual([
      "FLEX-01",
      "R2-1-4-R",
    ]);
  });

  it("requires allocations before Prepared and stamps actual outbound time only at dispatch", () => {
    const imported = importedOutbound("SH-A", [1], "2026-07-28T00:00:00Z");
    expect(() => prepareAllocations(imported, [], "2026-07-28T01:00:00Z")).toThrow(
      "ORDER_NOT_ALLOCATED",
    );
    const allocated = allocateLine(imported, 0, {
      id: "a",
      locationCode: "FLEX-01",
      quantity: 1,
    });
    const prepared = prepareAllocations(allocated, ["a"], "2026-07-28T01:00:00Z");
    expect(prepared.lines[0].preparedQty).toBe(1);
    expect(prepared.readyForPickupAt).toBe("2026-07-28T01:00:00Z");
    expect(prepared.outboundAt).toBeUndefined();
    const outbound = markOutbound(prepared, "2026-07-29T05:30:00Z");
    expect(outbound.outboundAt).toBe("2026-07-29T05:30:00Z");
  });
});

describe("repair lifecycle", () => {
  it("records the operational start time", () => {
    const started = startRepairAsset(
      {
        jobId: "repair-1",
        serialId: "serial-1",
        serialNumber: "SN-001",
        productId: "product-1",
        warehouseId: "syd",
        locationId: "repair-location",
        condition: "Repair",
        serialStatus: "Repair",
        status: "Pending_Repair",
        receivedAt: "2026-07-28T00:00:00Z",
        source: "Native_Return",
      },
      "2026-07-28T01:00:00Z",
    );
    expect(started.status).toBe("In_Repair");
    expect(started.repairStartedAt).toBe("2026-07-28T01:00:00Z");
  });

  it("preserves the same serial and converts Repair to allocatable Repair_Good", () => {
    const completed = completeRepairAsset(
      {
        jobId: "repair-1",
        serialId: "serial-1",
        serialNumber: "SN-001",
        productId: "product-1",
        warehouseId: "syd",
        locationId: "repair-location",
        condition: "Repair",
        serialStatus: "Repair",
        status: "Pending_Repair",
        receivedAt: "2026-07-28T00:00:00Z",
        source: "Native_Return",
      },
      {
        targetLocationId: "flex-location",
        completedAt: "2026-07-29T00:00:00Z",
        outcome: "Repair_Good",
      },
    );
    expect(completed.serialId).toBe("serial-1");
    expect(completed.serialNumber).toBe("SN-001");
    expect(completed.condition).toBe("Repair_Good");
    expect(completed.serialStatus).toBe("In_Stock");
    expect(completed.locationId).toBe("flex-location");
  });

  it("requires a reason and audit for legacy Repair_Good recognition", () => {
    expect(() =>
      recogniseLegacyRepairGood({
        productId: "product-1",
        targetLocationId: "flex-location",
        quantity: 1,
        reason: "",
      }),
    ).toThrow("Reason is required");
    const recognised = recogniseLegacyRepairGood({
      productId: "product-1",
      targetLocationId: "flex-location",
      quantity: 2,
      reason: "Opening traceability gap",
    });
    expect(recognised).toMatchObject({
      source: "Legacy_Manual",
      auditRequired: true,
      traceabilityWarning: true,
      condition: "Repair_Good",
    });
    expect(recognised).not.toHaveProperty("jobId");
  });
});

describe("pickup label policy", () => {
  it("groups all SH lines by pickup and aggregates only identical SKU, model and ERP warehouse", () => {
    const label = aggregatePickupLabel([
      {
        shNo: "SH-A",
        pickupCode: "SYD-00271",
        lines: [
          { sku: "SKU-1", model: "M1", erpWarehouse: "Sydney Material Warehouse", qty: 1 },
          { sku: "SKU-1", model: "M1", erpWarehouse: "Sydney Material Warehouse", qty: 2 },
        ],
      },
      {
        shNo: "SH-B",
        pickupCode: "SYD-00271",
        lines: [
          { sku: "SKU-1", model: "M1", erpWarehouse: "Sydney Good Product Warehouse", qty: 1 },
        ],
      },
    ]);
    expect(label.shNos).toEqual(["SH-A", "SH-B"]);
    expect(label).toMatchObject({ labelType: "BATCH_LABEL", pageCount: 1 });
    expect(label.lines).toHaveLength(2);
    expect(label.lines.find((row) => row.erpWarehouse === "Sydney Material Warehouse")?.qty).toBe(3);
    expect(label.lines.find((row) => row.erpWarehouse === "Sydney Good Product Warehouse")?.qty).toBe(1);
  });
});

describe("semantic reporting", () => {
  it("uses warehouse-local Monday to Sunday boundaries", () => {
    const period = mondayToSunday(new Date("2026-07-28T03:00:00Z"), "Australia/Sydney");
    expect(period.from.toISOString()).toBe("2026-07-26T14:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-08-02T13:59:59.999Z");
  });

  it("uses outboundAt, counts unique SH and removes returned SH from outstanding", () => {
    const orders = [
      {
        shNo: "SH-A",
        preparedAt: "2026-07-27T23:00:00Z",
        outboundAt: "2026-07-28T02:00:00Z",
        lines: [
          { model: "EQ4800-S", reportMachine: true, reportGroup: "Battery", quantity: 1 },
          { model: "Cable", reportMachine: false, quantity: 2 },
        ],
      },
      {
        shNo: "SH-B",
        preparedAt: "2026-07-28T03:00:00Z",
        lines: [{ model: "CQ6-M", reportMachine: true, reportGroup: "Inverter", quantity: 1 }],
      },
    ];
    const period = {
      from: new Date("2026-07-28T00:00:00Z"),
      to: new Date("2026-07-28T23:59:59Z"),
    };
    const before = operationalOrderMetrics(orders, [], period.from, period.to);
    expect(before.preparedShCount).toBe(1);
    expect(before.outboundShCount).toBe(1);
    expect(before.outstandingReturns.map((row) => row.shNo)).toEqual(["SH-A"]);
    expect(before.machineMovements).toEqual({ "Battery: EQ4800-S": 1 });
    const after = operationalOrderMetrics(
      orders,
      [{ relatedShNo: "SH-A", receivedAt: "2026-07-29T00:00:00Z" }],
      period.from,
      period.to,
    );
    expect(after.outstandingReturns).toEqual([]);
  });

  it("uses effectiveAt for condition-specific movement metrics", () => {
    const metrics = operationalMovementMetrics(
      [
        { transactionType: "Inbound", condition: "New", quantity: 3, effectiveAt: "2026-07-28T01:00:00Z" },
        { transactionType: "Outbound", condition: "New", quantity: 2, effectiveAt: "2026-07-28T02:00:00Z" },
        { transactionType: "Repair_Completed", condition: "Repair_Good", quantity: 1, effectiveAt: "2026-07-28T03:00:00Z" },
        { transactionType: "Outbound", condition: "Repair_Good", quantity: 1, effectiveAt: "2026-07-28T04:00:00Z" },
      ],
      new Date("2026-07-28T00:00:00Z"),
      new Date("2026-07-28T23:59:59Z"),
    );
    expect(metrics).toMatchObject({
      newInbound: 3,
      newOutbound: 2,
      repairGoodInbound: 1,
      repairGoodOutbound: 1,
      repairCompleted: 1,
    });
  });
});

describe("spreadsheet reconciliation", () => {
  it("detects quantity, location and condition differences without overwriting either source", () => {
    const ledger = [
      { sku: "A", condition: "New", location: "L1", quantity: 2 },
      { sku: "B", condition: "New", location: "L1", quantity: 1 },
      { sku: "C", condition: "New", location: "L1", quantity: 1 },
    ];
    const wms = [
      { sku: "A", condition: "New", location: "L1", quantity: 3 },
      { sku: "B", condition: "Repair_Good", location: "L1", quantity: 1 },
      { sku: "C", condition: "New", location: "L2", quantity: 1 },
    ];
    const statuses = reconcileInventory(ledger, wms).map((row) => row.status);
    expect(statuses).toEqual(["QTY_DIFFERENCE", "CONDITION_DIFFERENCE", "LOCATION_DIFFERENCE"]);
    expect(ledger[0].quantity).toBe(2);
    expect(wms[0].quantity).toBe(3);
  });

  it("detects missing rows in both directions", () => {
    const results = reconcileInventory(
      [{ warehouse: "SYD", sku: "A", condition: "New", location: "L1", quantity: 1 }],
      [{ warehouse: "SYD", sku: "B", condition: "New", location: "L1", quantity: 1 }],
    );
    expect(results.map((row) => row.status)).toEqual(["MISSING_IN_WMS", "MISSING_IN_LEDGER"]);
  });

  it("classifies serial gaps separately from current operational mismatches", () => {
    const results = reconcileSerials(
      [
        {
          serialNumber: "SN-LEGACY",
          sku: "A",
          warehouse: "SYD",
          location: "L1",
          condition: "Repair",
          status: "Repair",
          legacyIncomplete: true,
        },
        {
          serialNumber: "SN-CURRENT",
          sku: "A",
          warehouse: "SYD",
          location: "L1",
          condition: "Repair_Good",
          status: "In_Stock",
        },
      ],
      [
        {
          serialNumber: "SN-CURRENT",
          sku: "A",
          warehouse: "SYD",
          location: "L2",
          condition: "Repair_Good",
          status: "In_Stock",
        },
      ],
    );
    expect(results[0]).toMatchObject({
      status: "SN_MISSING_IN_WMS",
      classification: "LEGACY_TRACEABILITY_GAP",
    });
    expect(results[1]).toMatchObject({
      status: "SN_WRONG_LOCATION",
      classification: "CURRENT_OPERATIONAL_ERROR",
    });
  });
});
