import { parseQRScan } from "./scan";

export type ReviewWorkflow = "ERP_OUTBOUND" | "TRANSFER_OUT";

export interface ScanReviewInputRow {
  rowId: string;
  rawValue: string;
  supportingSku?: string;
  supportingShNo?: string;
  targetLineId?: string;
  included?: boolean;
  operatorRemark?: string;
}

export interface ScanReviewFileRow {
  rowNumber: number;
  rawValue: string;
  supportingSku?: string;
  supportingShNo?: string;
}

export interface ScanReviewFilePreview {
  fileName: string;
  rowsDetected: number;
  validSnValues: number;
  blankRows: number;
  rows: ScanReviewFileRow[];
  errors: Array<{ code: string; message: string; rowNumbers?: number[] }>;
}

export function splitReviewPaste(value: string) {
  return value
    .split(/[\r\n,\t]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function mergeReviewRows(
  current: ScanReviewInputRow[],
  additions: Array<Omit<ScanReviewInputRow, "rowId"> & { rowId?: string }>,
  createId: () => string,
) {
  const seen = new Set(
    current.map((row) => parseQRScan(row.rawValue).serialNumber),
  );
  const added: ScanReviewInputRow[] = [];
  const duplicates: string[] = [];
  for (const row of additions) {
    const serialNumber = parseQRScan(row.rawValue).serialNumber;
    if (seen.has(serialNumber)) {
      duplicates.push(serialNumber);
      continue;
    }
    seen.add(serialNumber);
    added.push({
      ...row,
      rowId: row.rowId ?? createId(),
      included: row.included ?? true,
    });
  }
  return { rows: [...current, ...added], added, duplicates };
}

export function automaticOrderLineMatch(
  input: { sku?: string; condition?: string; targetLineId?: string },
  lines: Array<{ id: string; sku: string; requiredCondition: string }>,
) {
  if (input.targetLineId) {
    const selected = lines.find((line) => line.id === input.targetLineId);
    if (!selected) return { code: "TARGET_LINE_INVALID" as const };
    if (selected.sku !== input.sku || selected.requiredCondition !== input.condition)
      return { code: "TARGET_LINE_MISMATCH" as const, line: selected };
    return { code: "MATCHED" as const, line: selected };
  }
  const matches = lines.filter(
    (line) => line.sku === input.sku && line.requiredCondition === input.condition,
  );
  if (matches.length === 1) return { code: "MATCHED" as const, line: matches[0] };
  if (matches.length > 1) return { code: "TARGET_LINE_REQUIRED" as const };
  const skuMatch = lines.some((line) => line.sku === input.sku);
  return { code: skuMatch ? "CONDITION_MISMATCH" as const : "NO_MATCHING_ORDER_LINE" as const };
}
