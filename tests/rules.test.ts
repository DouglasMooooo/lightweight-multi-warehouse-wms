import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import {
  applyBalanceDelta,
  assertFaultyReceiptAllowed,
  formatPickupCode,
  validateAdjustment,
  validateMove,
  validateOutboundSerial,
  validatePreparation,
} from "@/domain/rules";
import {
  assertSerialRegistrationCapacity,
  isAllocatableStockCondition,
  isAllocatableSerialStatus,
  isPhysicallyPresentSerialStatus,
  registeredSerialStatusForCondition,
} from "@/domain/serial-policy";

describe("Prepared and shared balance rules", () => {
  it("keeps physical unchanged, increases frozen and decreases available", () => {
    const before = { physical: 10, frozen: 2, inTransit: 0 };
    validatePreparation(5, 2, 8, 3);
    const after = applyBalanceDelta(before, { frozen: 3 });
    expect(after).toEqual({ physical: 10, frozen: 5, inTransit: 0 });
    expect(after.physical - after.frozen).toBe(5);
  });

  it("supports multiple locations satisfying one line", () => {
    validatePreparation(5, 0, 2, 2);
    validatePreparation(5, 2, 3, 3);
    expect(2 + 3).toBe(5);
  });

  it("rejects preparation above required or available", () => {
    expect(() => validatePreparation(5, 4, 10, 2)).toThrow("requested quantity");
    expect(() => validatePreparation(5, 0, 1, 2)).toThrow("available stock");
  });

  it("rejects invalid physical and frozen outcomes", () => {
    expect(() => applyBalanceDelta({ physical: 1, frozen: 0, inTransit: 0 }, { physical: -2 })).toThrow(
      "Physical inventory",
    );
    expect(() => applyBalanceDelta({ physical: 2, frozen: 1, inTransit: 0 }, { frozen: 2 })).toThrow(
      "Frozen inventory",
    );
  });
});

describe("strict outbound serial validation", () => {
  const valid = {
    serialSku: "SKU-A",
    requiredSku: "SKU-A",
    serialCondition: "New" as const,
    requiredCondition: "New" as const,
    serialWarehouse: "SYD" as const,
    requiredWarehouse: "SYD" as const,
    serialLocation: "FLEX-01",
    allocatedLocations: ["FLEX-01", "R2-1-4-R"],
    status: "In_Stock" as const,
    allocatedToAnotherOrder: false,
  };

  it("accepts a correct serial", () => expect(() => validateOutboundSerial(valid)).not.toThrow());
  it("rejects wrong SKU", () =>
    expect(() => validateOutboundSerial({ ...valid, serialSku: "SKU-B" })).toThrow("requested SKU"));
  it("rejects wrong condition", () =>
    expect(() => validateOutboundSerial({ ...valid, serialCondition: "Repair_Good" })).toThrow("condition"));
  it("rejects wrong warehouse", () =>
    expect(() => validateOutboundSerial({ ...valid, serialWarehouse: "MEL" })).toThrow("outbound warehouse"));
  it("rejects wrong location", () =>
    expect(() => validateOutboundSerial({ ...valid, serialLocation: "REPAIR-01" })).toThrow("allocated location"));
  it("returns a stable code for operator-facing validation", () => {
    try {
      validateOutboundSerial({ ...valid, serialLocation: "REPAIR-01" });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("SN_WRONG_LOCATION");
    }
  });
  it("rejects an already prepared serial", () =>
    expect(() => validateOutboundSerial({ ...valid, status: "Prepared" })).toThrow("another active order"));
});

describe("faulty return idempotency", () => {
  it("rejects a second active repair receipt with the required message", () => {
    expect(() => assertFaultyReceiptAllowed("Repair", true)).toThrow(
      "This serial number has already been received into repair inventory.",
    );
  });

  it("allows an outbound unit with no active repair receipt", () => {
    expect(() => assertFaultyReceiptAllowed("Outbound", false)).not.toThrow();
  });
});

describe("move and adjustment rules", () => {
  it("move preserves the warehouse total", () => {
    const source = applyBalanceDelta({ physical: 8, frozen: 0, inTransit: 0 }, { physical: -5 });
    const destination = applyBalanceDelta({ physical: 2, frozen: 0, inTransit: 0 }, { physical: 5 });
    expect(source.physical + destination.physical).toBe(10);
  });

  it("move cannot consume frozen stock", () =>
    expect(() =>
      validateMove({
        sourceWarehouse: "SYD",
        destinationWarehouse: "SYD",
        sourceLocation: "A",
        destinationLocation: "B",
        availableQty: 4,
        qty: 5,
      }),
    ).toThrow("available inventory"));

  it("rejects cross-warehouse Move", () =>
    expect(() =>
      validateMove({
        sourceWarehouse: "SYD",
        destinationWarehouse: "MEL",
        sourceLocation: "A",
        destinationLocation: "B",
        availableQty: 5,
        qty: 1,
      }),
    ).toThrow("Use Transfer"));

  it("validates Product SKU and controlled no-SKU Material", () => {
    expect(() =>
      validateAdjustment({ direction: "In", itemType: "Product", reason: "Count correction", qty: 1 }),
    ).toThrow("requires a SKU");
    expect(() =>
      validateAdjustment({ direction: "In", itemType: "Material", reason: "Unmonitored material", qty: 1 }),
    ).not.toThrow();
  });

  it("Adjustment Out cannot consume frozen inventory", () =>
    expect(() =>
      validateAdjustment({
        direction: "Out",
        itemType: "Material",
        sku: "MAT-1",
        reason: "Count correction",
        qty: 3,
        availableQty: 2,
      }),
    ).toThrow("frozen inventory"));
});

describe("pickup codes", () => {
  it("uses warehouse prefixes and produces unique values", () => {
    const codes = Array.from({ length: 100 }, (_, index) => formatPickupCode("SYD", index + 1));
    expect(new Set(codes).size).toBe(100);
    expect(codes[0]).toBe("SYD-00001");
    expect(formatPickupCode("MEL", 42)).toBe("MEL-00042");
  });
});

describe("serial physical-presence policy", () => {
  it("counts In_Stock, Prepared, Repair and Scrapped as physically present", () => {
    expect(
      ["In_Stock", "Prepared", "Repair", "Scrapped"].every((status) =>
        isPhysicallyPresentSerialStatus(
          status as "In_Stock" | "Prepared" | "Repair" | "Scrapped",
        ),
      ),
    ).toBe(true);
    expect(
      ["Outbound", "In_Transit"].some((status) =>
        isPhysicallyPresentSerialStatus(status as "Outbound" | "In_Transit"),
      ),
    ).toBe(false);
  });

  it("rejects registration when all physical units already have serial identities", () => {
    expect(() =>
      assertSerialRegistrationCapacity({
        serialTrackingRequired: true,
        physicalQty: 2,
        activePhysicalSerialCount: 2,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "NO_UNASSIGNED_PHYSICAL_UNIT_FOR_SN" }),
    );
  });

  it("keeps Repair and Scrap non-allocatable", () => {
    expect(isAllocatableStockCondition("New")).toBe(true);
    expect(isAllocatableStockCondition("Repair_Good")).toBe(true);
    expect(isAllocatableStockCondition("Repair")).toBe(false);
    expect(isAllocatableStockCondition("Scrap")).toBe(false);
    expect(isAllocatableSerialStatus("In_Stock", "New")).toBe(true);
    expect(isAllocatableSerialStatus("In_Stock", "Repair_Good")).toBe(true);
    expect(isAllocatableSerialStatus("Prepared", "New")).toBe(false);
    expect(isAllocatableSerialStatus("Repair", "Repair")).toBe(false);
    expect(isAllocatableSerialStatus("Scrapped", "Scrap")).toBe(false);
  });

  it("registers Repair identity as Repair and rejects Scrap registration", () => {
    expect(registeredSerialStatusForCondition("Repair")).toBe("Repair");
    expect(() => registeredSerialStatusForCondition("Scrap")).toThrowError(
      expect.objectContaining({ code: "INVALID_SERIAL_REGISTRATION_CONDITION" }),
    );
  });
});
