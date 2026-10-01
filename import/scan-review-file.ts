import ExcelJS from "exceljs";
import { DomainError } from "@/domain/errors";
import type { ScanReviewFilePreview, ScanReviewFileRow } from "@/domain/scan-review";

type SemanticField = "sn" | "sku" | "shNo";

const aliases: Record<SemanticField, Set<string>> = {
  sn: new Set([
    "SN", "SERIAL", "SERIALNO", "SERIALNUMBER", "SERIALNUM",
    "序列号", "机器唯一码", "机器序列号",
  ]),
  sku: new Set(["SKU", "PRODUCTSKU", "ITEMCODE", "PRODUCTCODE", "物料编码", "产品编码"]),
  shNo: new Set(["SH", "SHNO", "SHNUMBER", "SH单号", "出库单号"]),
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "").replace(/[\s_./#()-]+/g, "").toUpperCase();

function semanticField(value: unknown): SemanticField | undefined {
  const normalized = normalizeHeader(value);
  return (Object.keys(aliases) as SemanticField[]).find((field) =>
    aliases[field].has(normalized),
  );
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\t")) {
      row.push(value);
      value = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.length) || rows.length === 0) rows.push(row);
  return rows;
}

function previewFromRows(fileName: string, rows: string[][]): ScanReviewFilePreview {
  let headerIndex = -1;
  let columns: Partial<Record<SemanticField, number>> = {};
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const candidate: Partial<Record<SemanticField, number>> = {};
    rows[index].forEach((value, column) => {
      const field = semanticField(value);
      if (field && candidate[field] === undefined) candidate[field] = column;
    });
    if (candidate.sn !== undefined) {
      headerIndex = index;
      columns = candidate;
      break;
    }
  }
  if (headerIndex < 0 || columns.sn === undefined)
    throw new DomainError("No semantic SN column was found.", "MISSING_SN_HEADER");

  const parsed: ScanReviewFileRow[] = [];
  const blankRows: number[] = [];
  const duplicates = new Map<string, number[]>();
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    const rawValue = String(row[columns.sn!] ?? "").trim();
    if (!rawValue) {
      blankRows.push(rowNumber);
      return;
    }
    const normalized = rawValue.toUpperCase();
    duplicates.set(normalized, [...(duplicates.get(normalized) ?? []), rowNumber]);
    parsed.push({
      rowNumber,
      rawValue,
      supportingSku: columns.sku === undefined
        ? undefined
        : String(row[columns.sku] ?? "").trim().toUpperCase() || undefined,
      supportingShNo: columns.shNo === undefined
        ? undefined
        : String(row[columns.shNo] ?? "").trim().toUpperCase() || undefined,
    });
  });
  const duplicateRows = [...duplicates.values()].filter((rowNumbers) => rowNumbers.length > 1);
  return {
    fileName,
    rowsDetected: rows.length - headerIndex - 1,
    validSnValues: parsed.length,
    blankRows: blankRows.length,
    rows: parsed,
    errors: [
      ...(blankRows.length ? [{
        code: "BLANK_SN_ROWS",
        message: `Rows ${blankRows.join(", ")} contain an empty SN.`,
        rowNumbers: blankRows,
      }] : []),
      ...duplicateRows.map((rowNumbers) => ({
        code: "DUPLICATE_SN_ROWS",
        message: `Duplicate SN detected at rows ${rowNumbers.join(" and ")}.`,
        rowNumbers,
      })),
    ],
  };
}

export async function previewScanReviewFile(file: File) {
  const name = file.name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > 5 * 1024 * 1024)
    throw new DomainError("SN upload exceeds 5 MB.", "FILE_TOO_LARGE");
  if (name.endsWith(".csv") || name.endsWith(".txt"))
    return previewFromRows(file.name, parseCsvRows(bytes.toString("utf8").replace(/^\uFEFF/, "")));
  if (!name.endsWith(".xlsx"))
    throw new DomainError("Only CSV, TXT and XLSX SN uploads are accepted.", "INVALID_FILE_TYPE");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never, {
    ignoreNodes: ["dataValidations", "extLst", "hyperlinks", "pageMargins", "pageSetup", "printOptions"],
  });
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new DomainError("The workbook has no worksheet.", "EMPTY_WORKBOOK");
  const rows: string[][] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1)
      row.push(sheet.getRow(rowNumber).getCell(column).text);
    rows.push(row);
  }
  return previewFromRows(file.name, rows);
}
