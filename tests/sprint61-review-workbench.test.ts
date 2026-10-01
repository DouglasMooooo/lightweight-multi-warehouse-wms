import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  automaticOrderLineMatch,
  mergeReviewRows,
  splitReviewPaste,
} from "@/domain/scan-review";
import { previewScanReviewFile } from "@/import/scan-review-file";

describe("Sprint 6.1 review batch domain", () => {
  it("merges scanner, paste, and file values while rejecting cross-source duplicates", () => {
    const current = [{ rowId: "scan-1", rawValue: "SN-001", included: true }];
    let id = 1;
    const merged = mergeReviewRows(
      current,
      splitReviewPaste("SN-002\nSN-001\tSN-003").map((rawValue) => ({ rawValue })),
      () => `added-${id++}`,
    );

    expect(merged.rows.map((row) => row.rawValue)).toEqual(["SN-001", "SN-002", "SN-003"]);
    expect(merged.duplicates).toEqual(["SN-001"]);
    expect(merged.rows.every((row) => row.included)).toBe(true);
  });

  it("requires an explicit target when SKU and condition match multiple order lines", () => {
    const lines = [
      { id: "line-a", sku: "SKU-1", requiredCondition: "New" },
      { id: "line-b", sku: "SKU-1", requiredCondition: "New" },
    ];

    expect(automaticOrderLineMatch({ sku: "SKU-1", condition: "New" }, lines).code)
      .toBe("TARGET_LINE_REQUIRED");
    expect(automaticOrderLineMatch({
      sku: "SKU-1",
      condition: "New",
      targetLineId: "line-b",
    }, lines)).toMatchObject({ code: "MATCHED", line: { id: "line-b" } });
    expect(automaticOrderLineMatch({
      sku: "SKU-1",
      condition: "Repair_Good",
      targetLineId: "line-b",
    }, lines).code).toBe("TARGET_LINE_MISMATCH");
  });

  it("handles a 500-row temporary batch without losing order", () => {
    const additions = Array.from({ length: 500 }, (_, index) => ({
      rawValue: `SN-${String(index).padStart(4, "0")}`,
    }));
    const merged = mergeReviewRows([], additions, () => crypto.randomUUID());
    expect(merged.rows).toHaveLength(500);
    expect(merged.rows[499].rawValue).toBe("SN-0499");
  });

  it("supports removing an invalid row and adding a replacement without restarting", () => {
    const draft = [
      { rowId: "valid", rawValue: "SN-GOOD", included: true },
      { rowId: "invalid", rawValue: "SN-BAD", included: true },
    ];
    const afterRemoval = draft.filter((row) => row.rowId !== "invalid");
    const replacement = mergeReviewRows(
      afterRemoval,
      [{ rawValue: "SN-REPLACEMENT" }],
      () => "replacement",
    );
    expect(replacement.rows.map((row) => row.rawValue)).toEqual([
      "SN-GOOD",
      "SN-REPLACEMENT",
    ]);
  });
});

describe("Sprint 6.1 semantic file preview", () => {
  it("accepts a single-column SN CSV", async () => {
    const preview = await previewScanReviewFile(
      new File(["SN\nSN-1\nSN-2"], "single.csv"),
    );
    expect(preview.rows.map((row) => row.rawValue)).toEqual(["SN-1", "SN-2"]);
  });

  it("accepts a single-column Serial Number XLSX", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SN");
    sheet.addRow(["Serial Number"]);
    sheet.addRow(["SN-XLSX-1"]);
    const bytes = await workbook.xlsx.writeBuffer();
    const preview = await previewScanReviewFile(
      new File([bytes as ArrayBuffer], "single.xlsx"),
    );
    expect(preview.rows[0].rawValue).toBe("SN-XLSX-1");
  });

  it("finds Chinese semantic headers without fixed Excel coordinates", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Export");
    sheet.addRow(["ERP 导出", "", "", ""]);
    sheet.addRow(["备注", "出库单号", "机器序列号", "产品编码"]);
    sheet.addRow(["first", "SH-100", "SN-100", "sku-a"]);
    sheet.addRow(["missing SN", "SH-100", "", "sku-a"]);
    sheet.addRow(["duplicate", "SH-100", "SN-100", "sku-a"]);
    const bytes = await workbook.xlsx.writeBuffer();
    const file = new File([bytes as ArrayBuffer], "review.xlsx");

    const preview = await previewScanReviewFile(file);

    expect(preview.rowsDetected).toBe(3);
    expect(preview.validSnValues).toBe(2);
    expect(preview.blankRows).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 3,
      rawValue: "SN-100",
      supportingSku: "SKU-A",
      supportingShNo: "SH-100",
    });
    expect(preview.errors.map((error) => error.code)).toEqual([
      "BLANK_SN_ROWS",
      "DUPLICATE_SN_ROWS",
    ]);
  });

  it("parses quoted CSV by semantic header and reports duplicates before import", async () => {
    const csv = [
      "Description,Serial Number,SH No,Item Code",
      "\"machine, boxed\",SN-1,SH-1,SKU-1",
      "second,SN-2,SH-1,SKU-2",
    ].join("\n");
    const preview = await previewScanReviewFile(new File([csv], "review.csv"));

    expect(preview.rows.map((row) => row.rawValue)).toEqual(["SN-1", "SN-2"]);
    expect(preview.rows[1].supportingSku).toBe("SKU-2");
    expect(preview.errors).toEqual([]);
  });

  it("uses SKU as supporting evidence and does not mutate caller inventory state", async () => {
    const balance = { physicalQty: 8, frozenQty: 1, inTransitQty: 0 };
    const before = structuredClone(balance);
    const preview = await previewScanReviewFile(
      new File(["SKU,SN\nsku-1,SN-1"], "sku-sn.csv"),
    );
    expect(preview.rows[0]).toMatchObject({ rawValue: "SN-1", supportingSku: "SKU-1" });
    expect(balance).toEqual(before);
  });

  it("rejects a file without a semantic SN header", async () => {
    await expect(previewScanReviewFile(
      new File(["SKU,Model\nSKU-1,Model 1"], "missing.csv"),
    )).rejects.toMatchObject({ code: "MISSING_SN_HEADER" });
  });
});
