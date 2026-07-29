import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { DomainError } from "@/domain/errors";
import type { RawWorkbook, WorkbookCellValue } from "./workbook-types";

export const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;

function safeCellValue(value: ExcelJS.CellValue): WorkbookCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if ("result" in value) return safeCellValue(value.result as ExcelJS.CellValue);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return value.text;
  // Formula errors and unsupported workbook objects are never interpreted as text.
  return null;
}

export async function readWorkbookBuffer(
  buffer: Buffer,
  sourceFileName: string,
): Promise<RawWorkbook> {
  if (!sourceFileName.toLowerCase().endsWith(".xlsx"))
    throw new DomainError("Only .xlsx workbook files are accepted.", "INVALID_FILE_TYPE");
  if (buffer.byteLength > MAX_WORKBOOK_BYTES)
    throw new DomainError(
      `Workbook exceeds the ${MAX_WORKBOOK_BYTES} byte limit.`,
      "FILE_TOO_LARGE",
    );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never, {
    ignoreNodes: [
      "dataValidations",
      "extLst",
      "hyperlinks",
      "pageMargins",
      "pageSetup",
      "printOptions",
      "sheetPr",
    ],
  });
  const sheets = workbook.worksheets.map((sheet) => {
    const rows: WorkbookCellValue[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      while (rows.length < rowNumber) rows.push([]);
      const values: WorkbookCellValue[] = [];
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        while (values.length < columnNumber) values.push(null);
        values[columnNumber - 1] = safeCellValue(cell.value);
      });
      rows[rowNumber - 1] = values;
    });
    return { name: sheet.name, rows };
  });
  return {
    sourceFileName,
    sourceChecksum: createHash("sha256").update(buffer).digest("hex").toUpperCase(),
    sheets,
  };
}
