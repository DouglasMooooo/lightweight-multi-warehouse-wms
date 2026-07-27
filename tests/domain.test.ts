import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-data";
import {
  adjustStock,
  dispatchOutbound,
  dispatchTransfer,
  generatePickupCode,
  moveStock,
  prepareOutbound,
  receiveFaulty,
  receiveTransfer,
  registerSerial,
  scanOutboundSerial,
} from "@/domain/operations";

const fresh = () => structuredClone(demoState);

describe("Prepared / Frozen inventory", () => {
  it("freezes available stock without reducing physical stock", () => {
    const before = fresh();
    const balanceBefore = before.inventory.find(
      (row) => row.sku === "97-229-00012-00" && row.locationCode === "FLEX-01",
    )!;
    const after = prepareOutbound(before, "out-2", "line-2", "FLEX-01", 1);
    const balanceAfter = after.inventory.find((row) => row.id === balanceBefore.id)!;

    expect(balanceAfter.physicalQty).toBe(balanceBefore.physicalQty);
    expect(balanceAfter.frozenQty).toBe(balanceBefore.frozenQty + 1);
    expect(balanceAfter.availableQty).toBe(balanceBefore.availableQty - 1);
    expect(after.outboundOrders.find((row) => row.id === "out-2")?.pickupCode).toBe("SYD-00266");
  });

  it("cannot allocate more than available", () => {
    expect(() => prepareOutbound(fresh(), "out-2", "line-2", "FLEX-01", 999)).toThrow(
      "Insufficient available stock.",
    );
  });
});

describe("Outbound", () => {
  it("reduces physical and frozen inventory and marks SN Outbound", () => {
    let state = fresh();
    state = scanOutboundSerial(state, "out-1", "line-1", "EQ48S260700001");
    state = scanOutboundSerial(state, "out-1", "line-1", "EQ48S260700002");
    state = dispatchOutbound(state, "out-1");
    const balance = state.inventory.find((row) => row.id === "bal-1")!;

    expect(balance.physicalQty).toBe(30);
    expect(balance.frozenQty).toBe(0);
    expect(state.outboundOrders.find((row) => row.id === "out-1")?.status).toBe("Outbound");
    expect(state.serials.find((row) => row.serialNumber === "EQ48S260700001")?.status).toBe("Outbound");
  });
});

describe("Move and Adjustment", () => {
  it("Move preserves warehouse total", () => {
    const before = fresh();
    const totalBefore = before.inventory
      .filter((row) => row.warehouseCode === "SYD" && row.sku === "10-105-00346-00")
      .reduce((sum, row) => sum + row.physicalQty, 0);
    const after = moveStock(before, {
      warehouseCode: "SYD",
      sku: "10-105-00346-00",
      condition: "Material",
      fromLocation: "R1-4-2-L",
      toLocation: "FLEX-01",
      qty: 25,
      remark: "Test move",
    });
    const totalAfter = after.inventory
      .filter((row) => row.warehouseCode === "SYD" && row.sku === "10-105-00346-00")
      .reduce((sum, row) => sum + row.physicalQty, 0);
    expect(totalAfter).toBe(totalBefore);
    expect(after.transactions[0].type).toBe("Move");
  });

  it("Adjustment In increases inventory", () => {
    const before = fresh();
    const after = adjustStock(before, {
      direction: "In",
      warehouseCode: "SYD",
      locationCode: "R1-4-3-L",
      sku: "20-012-10219-08",
      itemType: "Material",
      condition: "Material",
      qty: 5,
      reason: "Count correction",
      remark: "Test",
    });
    expect(after.inventory.find((row) => row.id === "bal-4")?.physicalQty).toBe(80);
  });

  it("Adjustment Out decreases inventory", () => {
    const after = adjustStock(fresh(), {
      direction: "Out",
      warehouseCode: "SYD",
      locationCode: "R1-4-3-L",
      sku: "20-012-10219-08",
      itemType: "Material",
      condition: "Material",
      qty: 5,
      reason: "Count correction",
      remark: "Test",
    });
    expect(after.inventory.find((row) => row.id === "bal-4")?.physicalQty).toBe(70);
  });
});

describe("Serial traceability", () => {
  it("rejects duplicate active serial numbers", () => {
    expect(() =>
      registerSerial(fresh(), {
        serialNumber: "EQ48S260700001",
        sku: "97-223-00107-00",
        warehouseCode: "SYD",
        locationCode: "FLEX-01",
      }),
    ).toThrow("Serial number already exists.");
  });

  it("faulty return changes SN to Repair", () => {
    const after = receiveFaulty(fresh(), {
      serialNumber: "60E5M4805C3F242",
      relatedShNo: "SH-2607-00165610",
      sku: "97-223-00107-00",
      model: "EQ4800-S",
    });
    const serial = after.serials.find((row) => row.serialNumber === "60E5M4805C3F242");
    expect(serial?.status).toBe("Repair");
    expect(serial?.locationCode).toBe("REPAIR-01");
  });
});

describe("Transfer", () => {
  it("Transfer Out and In update SN and warehouse state", () => {
    let state = dispatchTransfer(fresh(), "tr-1");
    expect(state.serials.find((row) => row.serialNumber === "EQ48S260700003")?.status).toBe("In_Transit");
    state = receiveTransfer(state, "tr-1", "M1-1-1-L");
    const serial = state.serials.find((row) => row.serialNumber === "EQ48S260700003");
    expect(serial?.status).toBe("In_Stock");
    expect(serial?.warehouseCode).toBe("MEL");
    expect(serial?.locationCode).toBe("M1-1-1-L");
  });
});

describe("Pickup codes", () => {
  it("generates unique warehouse-scoped sequential codes", () => {
    const state = fresh();
    expect(generatePickupCode(state, "SYD")).toBe("SYD-00266");
    expect(generatePickupCode(state, "SYD")).toBe("SYD-00267");
    expect(generatePickupCode(state, "MEL")).toBe("MEL-00001");
  });
});
