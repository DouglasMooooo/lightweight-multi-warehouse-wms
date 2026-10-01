import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { reconcileSerialCounts } from "@/domain/reconciliation";
import { isAllocatableSerialStatus } from "@/domain/serial-policy";
import { analyzeWorkbook } from "@/import/workbook-analyzer";
import { readWorkbookBuffer } from "@/import/workbook-reader";
import type { RawWorkbook, WmsShadowReference } from "@/import/workbook-types";

const emptyWms: WmsShadowReference = { products: [], locations: [], balances: [], serials: [] };

function raw(ledgerRows: unknown[][], currentRows: unknown[][] = []): RawWorkbook {
  return {
    sourceFileName: "snapshot.xlsx",
    sourceChecksum: "ABC123",
    sheets: [
      {
        name: "产品维护 Product_Stock_Master",
        rows: [
          ["SKU / 料号", "Model / 机型", "Item_Type / 物品类型", "Report_Machine_Flag / 报表整机标记"],
          ["SKU-A", "Model A", "Product", "Yes"],
          ["MAT-A", "Material A", "Material", "No"],
        ],
      },
      {
        name: "Location_Master 库位维护",
        rows: [
          ["Location_Code / 库位编码", "Zone_Label", "Is_Service_Zone"],
          ["FLEX-01", "Flex", "No"],
          ["REPAIR-01", "Repair", "Yes"],
        ],
      },
      {
        name: "主表 Stock_Transaction_Log",
        rows: [
          [
            "Remark / 备注",
            "Qty / 数量",
            "Action / 动作",
            "Stock_Condition / 库存属性",
            "Item_Type / 物品类型",
            "SKU / 料号",
            "Model / 机型",
            "From_Location_Code / 来源库位",
            "To_Location_Code / 目标库位",
            "Outbound_Date / 实际出库日",
            "SH_No / ERP SH单号",
            "Pickup_Code / 取货码",
            "ERP仓库选择",
            "SN / 机器唯一码",
            "Reason / 原因",
          ],
          ...ledgerRows,
        ],
      },
      {
        name: "Current_Stock_Detail 当前库存明细查询",
        rows: [
          ["Current_Qty", "Location_Code", "Item_Type", "Stock_Condition", "SKU", "SN_for_Stock", "Stock_Status"],
          ...currentRows,
        ],
      },
    ] as RawWorkbook["sheets"],
  };
}

function analyze(workbook: RawWorkbook, wms = emptyWms) {
  return analyzeWorkbook(workbook, {
    mode: "DRY_RUN",
    cutoverAt: new Date("2026-07-29T00:00:00+10:00"),
    wms,
  });
}

describe("Sprint 3 workbook semantic import", () => {
  it("maps bilingual headers independently of column order and keeps Outbound_Date semantic", () => {
    const result = analyze(raw([
      ["", 1, "Outbound", "New / 新品", "Product", "SKU-A", "Model A", "FLEX-01", "", "2026-07-28", "SH-1", "P-1", "ERP-A", "SN-1", ""],
    ]));
    expect(result.ledgerRows[0]).toMatchObject({
      action: "Outbound",
      outboundAt: new Date("2026-07-28"),
      sku: "SKU-A",
      fromLocation: "FLEX-01",
    });
  });

  it("rejects a missing required semantic header", () => {
    const workbook = raw([]);
    workbook.sheets[2].rows[0] = ["Action", "Qty", "Item_Type"];
    expect(() => analyze(workbook)).toThrow("missing required semantic headers");
  });

  it("downgrades locationless Prepared, excludes display placeholders and validates blank SKU rules", () => {
    const result = analyze(raw([
      ["", 1, "Prepared", "New", "Product", "SKU-A", "Model A", "", "", "", "SH-1", "P-1", "ERP-A", "", ""],
      ["仅显示现场占用", 99, "Opening", "Repair", "Product", "坏机", "Display", "", "FLEX-01", "", "", "", "", "", ""],
      ["", 1, "Opening", "New", "Product", "", "Bad", "", "FLEX-01", "", "", "", "", "", ""],
      ["", 5, "Opening", "Material", "Material", "", "Unmonitored", "", "FLEX-01", "", "", "", "", "", "Unmonitored material"],
    ]));
    expect(result.ledgerRows.map((row) => row.shadowStatus)).toContain("Pending_Allocation");
    expect(result.issues.map((row) => row.code)).toEqual(
      expect.arrayContaining(["PREPARED_WITHOUT_LOCATION", "DISPLAY_ONLY_PLACEHOLDER", "BLANK_PRODUCT_SKU"]),
    );
    expect(result.ledgerRows.some((row) => !row.sku && row.itemType === "Material")).toBe(true);
  });

  it("keeps Product Qty N as one order line and one PickupBatch across mixed ERP warehouses", () => {
    const result = analyze(raw([
      ["", 3, "Prepared", "New", "Product", "SKU-A", "Model A", "FLEX-01", "", "", "SH-1", "P-1", "ERP-A", "", ""],
      ["", 2, "Prepared", "New", "Product", "SKU-A", "Model A", "FLEX-01", "", "", "SH-2", "P-1", "ERP-B", "", ""],
    ]));
    expect(result.activeOutboundOrders[0].lines).toHaveLength(1);
    expect(result.activeOutboundOrders[0].lines[0].quantity).toBe(3);
    expect(result.pickupBatches).toHaveLength(1);
    expect(result.pickupBatches[0].shNos).toEqual(["SH-1", "SH-2"]);
    expect(result.pickupBatches[0].labelGroups).toHaveLength(2);
  });

  it("preserves active repair SN and never fabricates a RepairJob for legacy Repair_Good", () => {
    const result = analyze(raw([
      ["", 1, "Return_to_Repair", "Repair", "Product", "SKU-A", "Model A", "", "REPAIR-01", "", "", "", "", "SN-REPAIR", ""],
      ["", 1, "Adjustment_In", "Repair_Good", "Product", "SKU-A", "Model A", "", "FLEX-01", "", "", "", "", "SN-LEGACY", ""],
    ]));
    expect(result.repairItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ serialNumber: "SN-REPAIR", status: "Repair", createRepairJob: true }),
      expect.objectContaining({ serialNumber: "SN-LEGACY", status: "Legacy_Repair_Good", createRepairJob: false }),
    ]));
  });

  it("is deterministic for the same checksum/mode/cutover and identifies unknown master data", () => {
    const workbook = raw([]);
    const first = analyze(workbook);
    const second = analyze(workbook);
    expect(second.batchKey).toBe(first.batchKey);
    expect(first.reconciliation.map((row) => row.discrepancyType)).toEqual(
      expect.arrayContaining(["UNKNOWN_SKU", "UNKNOWN_LOCATION"]),
    );
  });

  it("reads a shuffled xlsx without changing the source bytes", async () => {
    const book = new ExcelJS.Workbook();
    for (const sheet of raw([]).sheets) {
      const target = book.addWorksheet(sheet.name);
      for (const row of sheet.rows) target.addRow(row);
    }
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const parsed = await readWorkbookBuffer(bytes, "safe.xlsx");
    analyze(parsed);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(checksum);
  });
});

describe("Scrap physical presence and allocatability", () => {
  const balance = (physicalQty: number) => [{
    balanceId: "scrap",
    productId: "p1",
    sku: "SKU-A",
    warehouse: "SYD",
    location: "REPAIR-01",
    condition: "Scrap",
    physicalQty,
  }];
  const serials = (count: number) => Array.from({ length: count }, () => ({
    productId: "p1",
    warehouse: "SYD",
    location: "REPAIR-01",
    condition: "Scrap",
    status: "Scrapped" as const,
  }));

  it("matches Scrap Physical 1 to one Scrapped SN", () => {
    expect(reconcileSerialCounts(balance(1), serials(1))[0].status).toBe("SERIAL_COUNT_MATCH");
  });
  it("reports Scrap Physical 2 / SN 1 as shortage", () => {
    expect(reconcileSerialCounts(balance(2), serials(1))[0].status).toBe("SERIAL_COUNT_SHORTAGE");
  });
  it("reports Scrap Physical 1 / SN 2 as excess", () => {
    expect(reconcileSerialCounts(balance(1), serials(2))[0].status).toBe("SERIAL_COUNT_EXCESS");
  });
  it("keeps Scrapped inventory non-allocatable", () => {
    expect(isAllocatableSerialStatus("Scrapped", "Scrap")).toBe(false);
  });
});
