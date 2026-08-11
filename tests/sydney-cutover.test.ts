import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildSydneyCutoverPlan, type SydneyCutoverSource } from "@/import/sydney-cutover";
import { SydneyCutoverService } from "@/services/server/sydney-cutover-service";

const ledgerCsv = [
  "Date,Outbound_Date,Action,SH_No,Pickup_Code,Container_Code,SKU,Model,Item_Type,SN,Qty,From_Location_Code,To_Location_Code,ERP_Warehouse,Stock_Condition,Remark",
].join("\n");

function source(input: {
  stockQty?: number;
  frozenQty?: number;
  serialStatus?: "" | "Prepared" | "Outbound";
  duplicateSerial?: boolean;
} = {}): SydneyCutoverSource {
  const stockQty = input.stockQty ?? 1;
  const frozenQty = input.frozenQty ?? 0;
  const snapshotRows = [
    "SN,库位,属性,台账状态",
    `SKU-A/00000000/SN-A,FLEX-01,新机,${input.serialStatus ?? ""}`,
  ];
  if (input.duplicateSerial) snapshotRows.push("SKU-A/00000000/SN-A,FLEX-01,新机,");
  return {
    ledgerCsv,
    productCsv: [
      "SKU,Model,Item_Type,Category,Active,Report_Machine_Flag,Report_Group",
      "SKU-A,Model A,Product,Inverter,Yes,Yes,Machine",
    ].join("\n"),
    locationCsv: [
      "Location_Code,Warehouse,Zone,Is_Service_Zone",
      "FLEX-01,SYD,FLEX,No",
    ].join("\n"),
    currentStockCsv: stockQty > 0
      ? [
          "Current_Qty,Frozen_Qty,Location_Code,Item_Type,Stock_Condition,SKU,Stock_Status",
          `${stockQty},${frozenQty},FLEX-01,Product,New,SKU-A,In Stock`,
        ].join("\n")
      : "Current_Qty,Frozen_Qty,Location_Code,Item_Type,Stock_Condition,SKU,Stock_Status",
    goodSerialCsv: "SN,库位,属性,台账状态",
    newSerialCsv: snapshotRows.join("\n"),
  };
}

function plan(input: Parameters<typeof source>[0] = {}) {
  return buildSydneyCutoverPlan({
    source: source(input),
    cutoverAt: new Date("2026-08-11T00:00:00+10:00"),
  });
}

describe("Sydney production cutover", () => {
  it("maps blank 新机 serial status to In_Stock and reconciles physical quantity", () => {
    const result = plan();
    expect(result.serials).toEqual([
      expect.objectContaining({ serialNumber: "SN-A", condition: "New", status: "In_Stock" }),
    ]);
    expect(result.summary).toMatchObject({ physicalQty: 1, frozenQty: 0, criticalExceptions: 0 });
  });

  it("keeps Prepared serials physically present and requires matching frozen quantity", () => {
    const result = plan({ serialStatus: "Prepared", frozenQty: 1 });
    expect(result.serials[0]).toMatchObject({ status: "Prepared" });
    expect(result.summary).toMatchObject({ physicalQty: 1, frozenQty: 1, prepared: 1, criticalExceptions: 0 });
  });

  it("keeps Outbound serial history out of current physical inventory", () => {
    const result = plan({ serialStatus: "Outbound", stockQty: 0 });
    expect(result.serials[0]).toMatchObject({ status: "Outbound" });
    expect(result.summary).toMatchObject({ physicalQty: 0, frozenQty: 0, outboundHistorical: 1, criticalExceptions: 0 });
  });

  it("rejects duplicate machine serial numbers", () => {
    const result = plan({ stockQty: 2, duplicateSerial: true });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DUPLICATE_SN", severity: "Critical" }),
    ]));
  });

  it("treats a previously applied business reference as an idempotent no-op", async () => {
    const marker = { id: "opening-1", operationId: "SYD-CUTOVER-20260811:OPENING:abc" };
    const transaction = {
      $queryRawUnsafe: vi.fn(),
      stockTransaction: { findFirst: vi.fn().mockResolvedValue(marker) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as PrismaClient;
    const service = new SydneyCutoverService(prisma);

    await expect(service.apply(plan())).resolves.toEqual({ applied: false, duplicate: true, marker });
    await expect(service.apply(plan())).resolves.toEqual({ applied: false, duplicate: true, marker });
    expect(transaction.stockTransaction.findFirst).toHaveBeenCalledTimes(2);
  });
});
