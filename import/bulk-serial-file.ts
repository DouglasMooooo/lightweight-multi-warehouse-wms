import ExcelJS from "exceljs";
import { normalizeSerialBatch } from "@/domain/bulk-serial";
import { DomainError } from "@/domain/errors";

const aliases = new Set(["SN", "SERIAL", "SERIALNUMBER", "SERIALNO", "序列号", "机器唯一码"]);
const normalizeHeader = (value: unknown) => String(value ?? "").replace(/[\s_./-]+/g, "").toUpperCase();

export async function serialsFromUpload(file: File) {
  const name = file.name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > 5 * 1024 * 1024)
    throw new DomainError("Serial upload exceeds 5 MB.", "FILE_TOO_LARGE");
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const rows = bytes.toString("utf8").split(/\r?\n/);
    const first = rows[0]?.split(/,|\t/).map(normalizeHeader) ?? [];
    const snIndex = first.findIndex((value) => aliases.has(value));
    return normalizeSerialBatch(
      (snIndex >= 0 ? rows.slice(1) : rows).map((row) => row.split(/,|\t/)[snIndex >= 0 ? snIndex : 0] ?? ""),
    );
  }
  if (!name.endsWith(".xlsx"))
    throw new DomainError("Only CSV, TXT and XLSX serial uploads are accepted.", "INVALID_FILE_TYPE");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never, {
    ignoreNodes: ["dataValidations", "extLst", "hyperlinks", "pageMargins", "pageSetup", "printOptions"],
  });
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  let headerRow = 0;
  let snColumn = 0;
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
      if (!snColumn && aliases.has(normalizeHeader(cell.text))) {
        headerRow = rowNumber;
        snColumn = columnNumber;
      }
    });
    if (snColumn) break;
  }
  if (!snColumn)
    throw new DomainError("Upload is missing a semantic SN column.", "MISSING_SN_HEADER");
  const values: string[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1)
    values.push(sheet.getRow(rowNumber).getCell(snColumn).text);
  return normalizeSerialBatch(values);
}
