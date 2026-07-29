import { describe, expect, it } from "vitest";
import {
  canSatisfyNormalOutbound,
  classifyFaultyReceipt,
  validateNewInboundBatch,
} from "@/domain/bulk-operations";
import bulkEn from "@/i18n/messages/bulk-en.json";
import bulkZhCN from "@/i18n/messages/bulk-zh-CN.json";
import { translate } from "@/i18n/config";

const serials = (count: number) =>
  Array.from({ length: count }, (_, index) => `SN-${String(index + 1).padStart(3, "0")}`);

describe("Sprint 4 bulk New inbound", () => {
  it("accepts exactly 30 new serial identities for a 30-unit inbound", () => {
    const rows = validateNewInboundBatch({
      serialNumbers: serials(30),
      expectedQty: 30,
      existingSerialNumbers: new Set(),
    });
    expect(rows).toHaveLength(30);
    expect(rows.every((row) => row.valid)).toBe(true);
  });

  it("reports one invalid row without hiding other row results", () => {
    const rows = validateNewInboundBatch({
      serialNumbers: ["SN-001", "SN-002", "SN-002"],
      expectedQty: 3,
      existingSerialNumbers: new Set(["SN-001"]),
    });
    expect(rows.map((row) => row.code)).toEqual([
      "SN_ALREADY_EXISTS",
      "VALID",
      "DUPLICATE_IN_BATCH",
    ]);
  });
});

describe("Sprint 4 faulty batch classification", () => {
  it.each([
    [{ existsInWms: true, erpFound: true, resolvedSku: "SKU-A" }, "VALID"],
    [{ existsInWms: false, erpFound: true, resolvedSku: "SKU-A" }, "UNKNOWN_SN_CAN_REGISTER"],
    [{ existsInWms: false, erpFound: false }, "ERP_NOT_FOUND"],
    [{ existsInWms: true, erpFound: true, resolvedSku: "SKU-A", existingStatus: "Repair" }, "ALREADY_IN_REPAIR"],
    [{ existsInWms: true, erpFound: true, resolvedSku: "SKU-A", existingStatus: "In_Stock" }, "MANUAL_REVIEW"],
    [{ existsInWms: true, erpFound: true, resolvedSku: "SKU-A", activeRepairReturn: true }, "DUPLICATE_RETURN"],
    [{ existsInWms: true, erpFound: true, resolvedSku: "SKU-B", existingSku: "SKU-A" }, "SKU_MISMATCH"],
  ])("classifies each submitted row independently", (change, expected) => {
    expect(classifyFaultyReceipt(Object.assign({
      duplicateInBatch: false,
      activeRepairReturn: false,
      existsInWms: false,
      erpFound: false,
    }, change)).code).toBe(expected);
  });
});

describe("Sprint 4 outbound condition policy", () => {
  it("allows New and Repair_Good only when they exactly match the line requirement", () => {
    expect(canSatisfyNormalOutbound("New", "New")).toBe(true);
    expect(canSatisfyNormalOutbound("Repair_Good", "Repair_Good")).toBe(true);
    expect(canSatisfyNormalOutbound("New", "Repair_Good")).toBe(false);
    expect(canSatisfyNormalOutbound("New", "Repair")).toBe(false);
    expect(canSatisfyNormalOutbound("Repair_Good", "Scrap")).toBe(false);
  });
});

describe("Sprint 4 Bulk SN i18n", () => {
  it("has the same Bulk SN keys in English and Simplified Chinese", () => {
    expect(Object.keys(bulkZhCN).sort()).toEqual(Object.keys(bulkEn).sort());
    expect(translate("en", "bulk.mode.newInbound")).toBe("New Stock Inbound");
    expect(translate("zh-CN", "bulk.mode.newInbound")).toBe("新机批量入库");
  });

  it("keeps domain codes unchanged while translating presentation labels", () => {
    const code = "Repair_Good";
    expect(code).toBe("Repair_Good");
    expect(translate("zh-CN", "bulk.mode.repairGood")).toBe("维修良品批量登记");
  });
});
