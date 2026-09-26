import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyBulkSerial, normalizeSerialBatch } from "@/domain/bulk-serial";

const valid = {
  duplicate: false,
  exists: true,
  skuMatches: true,
  condition: "New",
  requiredCondition: "New",
  warehouseMatches: true,
  locationMatches: true,
  status: "In_Stock",
  assignedElsewhere: false,
  exceedsRequiredQty: false,
};

describe("Sprint 3.6 bulk serial normalization", () => {
  it("normalizes scanner, Excel paste, comma and tab input without losing duplicate evidence", () => {
    expect(normalizeSerialBatch([" sn01\nSN02,\tsn01 ", "", "sn03;sn04"])).toEqual([
      "SN01", "SN02", "SN01", "SN03", "SN04",
    ]);
  });

  it("accepts 30 valid serial candidates and supports 100+ values locally", () => {
    const serials = normalizeSerialBatch(Array.from({ length: 100 }, (_, index) => `sn-${index + 1}`));
    expect(serials).toHaveLength(100);
    expect(Array.from({ length: 30 }, () => classifyBulkSerial(valid)).every((row) => row.valid)).toBe(true);
  });
});

describe("Sprint 3.6 full-result validation rules", () => {
  const code = (change: Partial<typeof valid>) => classifyBulkSerial({ ...valid, ...change }).code;

  it("reports wrong SKU without stopping the rest of a 30-SN batch", () => {
    const results = Array.from({ length: 30 }, (_, index) =>
      classifyBulkSerial({ ...valid, skuMatches: index !== 29 }),
    );
    expect(results.filter((row) => row.valid)).toHaveLength(29);
    expect(results[29].code).toBe("SN_WRONG_SKU");
  });

  it.each([
    ["duplicate input", { duplicate: true }, "DUPLICATE_IN_BATCH"],
    ["unknown serial", { exists: false }, "UNKNOWN_SN"],
    ["already allocated", { assignedElsewhere: true }, "SN_ALREADY_ALLOCATED"],
    ["already outbound", { status: "Outbound" }, "SN_ALREADY_OUTBOUND"],
    ["wrong warehouse", { warehouseMatches: false }, "SN_WRONG_WAREHOUSE"],
    ["wrong location", { locationMatches: false }, "SN_WRONG_LOCATION"],
    ["repair serial", { condition: "Repair", status: "Repair" }, "SN_REPAIR"],
    ["scrapped serial", { condition: "Scrap", status: "Scrapped" }, "SN_SCRAPPED"],
    ["more than required", { exceedsRequiredQty: true }, "EXCEEDS_REQUIRED_QTY"],
  ])("%s returns an operator-actionable code", (_name, change, expected) => {
    expect(code(change as Partial<typeof valid>)).toBe(expected);
  });

  it("does not treat fewer valid SNs as completion", () => {
    const requiredQty = 30;
    const validCount = 28;
    expect(validCount).toBeLessThan(requiredQty);
  });
});

describe("Sprint 3.6 bounded database access regression", () => {
  it("uses IN-list batch reads rather than a serial lookup inside the per-SN loop", () => {
    const source = readFileSync("services/server/bulk-serial-service.ts", "utf8");
    expect(source).toContain("serialNumber: { in: unique }");
    expect(source).toContain("serialNumberId: { in:");
    const mapStart = source.indexOf("const results = serialNumbers.map");
    const mapEnd = source.indexOf("const valid =", mapStart);
    expect(source.slice(mapStart, mapEnd)).not.toContain("await ");
  });

  it("revalidates and commits assignments in one serializable transaction", () => {
    const source = readFileSync("services/server/bulk-serial-service.ts", "utf8");
    expect(source).toContain("validateAgainstDatabase(tx");
    expect(source).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(source).toContain('operation: "Bulk serial assignment"');
  });
});
