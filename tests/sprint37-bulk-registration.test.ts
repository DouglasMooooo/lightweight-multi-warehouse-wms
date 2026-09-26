import { describe, expect, it } from "vitest";
import { evaluateRegistrationBatch } from "@/domain/bulk-serial-registration";

const serials = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => `SN-${String(index + offset + 1).padStart(3, "0")}`);

describe("Sprint 3.7 bulk inventory SN registration capacity", () => {
  it("accepts 30 new SN for 30 unregistered physical units", () => {
    const result = evaluateRegistrationBatch({
      serialNumbers: serials(30),
      existingSerialNumbers: new Set(),
      availableCapacity: 30,
    });
    expect(result.filter((row) => row.valid)).toHaveLength(30);
  });

  it("rejects the 31st SN when physical quantity is 30", () => {
    const result = evaluateRegistrationBatch({
      serialNumbers: serials(31),
      existingSerialNumbers: new Set(),
      availableCapacity: 30,
    });
    expect(result.filter((row) => row.valid)).toHaveLength(30);
    expect(result.at(-1)?.code).toBe("REGISTRATION_CAPACITY_EXCEEDED");
  });

  it("accepts 2 and rejects 3 when 28 of 30 physical units already have SN", () => {
    const accepted = evaluateRegistrationBatch({
      serialNumbers: serials(2, 28),
      existingSerialNumbers: new Set(serials(28)),
      availableCapacity: 2,
    });
    const rejected = evaluateRegistrationBatch({
      serialNumbers: serials(3, 28),
      existingSerialNumbers: new Set(serials(28)),
      availableCapacity: 2,
    });
    expect(accepted.every((row) => row.valid)).toBe(true);
    expect(rejected.filter((row) => !row.valid)).toHaveLength(1);
  });

  it("reports duplicate input and an already registered SN independently", () => {
    const result = evaluateRegistrationBatch({
      serialNumbers: ["SN-001", "SN-001", "SN-002"],
      existingSerialNumbers: new Set(["SN-002"]),
      availableCapacity: 10,
    });
    expect(result.map((row) => row.code)).toEqual([
      "VALID",
      "DUPLICATE_IN_BATCH",
      "SN_ALREADY_EXISTS",
    ]);
  });
});
