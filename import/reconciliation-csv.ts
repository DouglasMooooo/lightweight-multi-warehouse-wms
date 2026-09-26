import type { ReconciliationReportRow } from "./workbook-types";

const columns: Array<keyof ReconciliationReportRow> = [
  "timestamp",
  "warehouse",
  "discrepancyType",
  "severity",
  "source",
  "sku",
  "model",
  "workbookQty",
  "wmsQty",
  "workbookLocation",
  "wmsLocation",
  "workbookCondition",
  "wmsCondition",
  "serialNumber",
  "classification",
  "comment",
];

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reconciliationToCsv(rows: ReconciliationReportRow[]) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(",")),
  ].join("\r\n");
}
