import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DomainError } from "@/domain/errors";
import type { RawWorkbook, WorkbookCellValue } from "./workbook-types";

export const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;

async function normalizeOpenXmlNamespaces(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const path of ["[Content_Types].xml", "xl/_rels/workbook.xml.rels"]) {
    const file = zip.file(path);
    if (!file) continue;
    const original = await file.async("string");
    if (!original.includes("ns0:")) continue;
    const normalized = original
      .replaceAll("<ns0:", "<")
      .replaceAll("</ns0:", "</")
      .replace("xmlns:ns0=", "xmlns=");
    zip.file(path, normalized);
    changed = true;
  }
  return changed ? Buffer.from(await zip.generateAsync({ type: "uint8array" })) : buffer;
}

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
  const readableBuffer = await normalizeOpenXmlNamespaces(buffer);
  await workbook.xlsx.load(readableBuffer as never, {
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
