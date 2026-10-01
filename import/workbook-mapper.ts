import { DomainError } from "@/domain/errors";
import { normalizeHeader } from "./workbook-normalizer";
import type { RawWorkbookSheet, SemanticMappedRow, WorkbookCellValue } from "./workbook-types";

export type SemanticAliases = Record<string, readonly string[]>;

export const LEDGER_HEADER_ALIASES: SemanticAliases = {
  date: ["Date", "\u65e5\u671f", "\u4e1a\u52a1\u65e5\u671f"],
  outboundDate: ["Outbound_Date", "Outbound Date", "\u5b9e\u9645\u51fa\u5e93\u65e5", "\u5b9e\u9645\u51fa\u5e93\u65e5\u671f"],
  action: ["Action", "\u52a8\u4f5c", "\u64cd\u4f5c"],
  shNo: ["SH_No", "SH No", "SH", "\u5de5\u5355\u53f7"],
  pickupCode: ["Pickup_Code", "Pickup Code", "\u63d0\u8d27\u7801", "\u53d6\u8d27\u7801"],
  container: ["Container", "Container_Code", "\u7bb1\u53f7", "\u5bb9\u5668"],
  sku: ["SKU", "SKU / \u6599\u53f7", "\u6599\u53f7"],
  model: ["Model", "\u673a\u578b", "\u578b\u53f7"],
  itemType: ["Item_Type", "Item Type", "\u7269\u54c1\u7c7b\u578b", "\u7269\u6599\u7c7b\u578b", "\u4ea7\u54c1\u7c7b\u578b"],
  serialNumber: ["SN", "Serial Number", "\u5e8f\u5217\u53f7", "\u673a\u5668\u552f\u4e00\u7801"],
  quantity: ["Qty", "Quantity", "\u6570\u91cf"],
  fromLocation: ["From_Location", "From_Location_Code", "From Location", "\u6765\u6e90\u5e93\u4f4d", "\u51fa\u5e93\u5e93\u4f4d"],
  toLocation: ["To_Location", "To_Location_Code", "To Location", "\u76ee\u6807\u5e93\u4f4d", "\u5165\u5e93\u5e93\u4f4d"],
  erpWarehouse: ["ERP_Warehouse", "ERP Warehouse", "ERP\u4ed3\u5e93", "ERP\u4ed3\u5e93\u9009\u62e9"],
  condition: ["Stock_Condition", "Stock Condition", "\u5e93\u5b58\u5c5e\u6027", "\u5e93\u5b58\u6761\u4ef6"],
  reason: ["Reason", "\u539f\u56e0"],
  remark: ["Remark", "Remarks", "\u5907\u6ce8"],
};

export const PRODUCT_HEADER_ALIASES: SemanticAliases = {
  sku: ["SKU", "SKU / \u6599\u53f7", "\u6599\u53f7"],
  model: ["Model", "\u673a\u578b", "\u578b\u53f7"],
  itemType: ["Item_Type", "Item Type", "\u7269\u6599\u7c7b\u578b", "\u7269\u54c1\u7c7b\u578b"],
  category: ["Category", "\u7c7b\u522b", "\u5206\u7c7b"],
  active: ["Active", "\u542f\u7528", "\u662f\u5426\u542f\u7528"],
  reportMachine: ["Report_Machine_Flag", "Report Machine Flag", "ReportMachine", "\u62a5\u8868\u6574\u673a\u6807\u8bb0"],
  reportGroup: ["Report_Group", "Report Group", "ReportGroup", "\u62a5\u8868\u7c7b\u522b", "\u62a5\u8868\u5206\u7ec4"],
};

export const LOCATION_HEADER_ALIASES: SemanticAliases = {
  code: ["Location", "Location_Code", "Location Code", "\u5e93\u4f4d", "\u5e93\u4f4d\u7f16\u7801"],
  warehouse: ["Warehouse", "Physical Warehouse", "\u7269\u7406\u4ed3\u5e93"],
  zone: ["Zone", "Zone_Label", "\u533a\u57df"],
  rack: ["Rack", "\u8d27\u67b6"],
  row: ["Row", "\u6392"],
  bay: ["Bay", "\u5c42", "\u4f4d"],
  side: ["Side", "\u4fa7"],
  serviceZone: ["Is_Service_Zone", "Service Zone", "ServiceZone", "\u670d\u52a1\u533a", "\u7ef4\u4fee\u533a"],
};

export const CURRENT_STOCK_HEADER_ALIASES: SemanticAliases = {
  warehouse: ["Warehouse", "Physical Warehouse", "\u7269\u7406\u4ed3\u5e93"],
  location: ["Location", "Location_Code", "Location Code", "\u5e93\u4f4d", "\u5e93\u4f4d\u7f16\u7801"],
  container: ["Container", "Container_Code", "\u7bb1\u53f7", "\u5bb9\u5668"],
  sku: ["SKU", "SKU / \u6599\u53f7", "\u6599\u53f7"],
  model: ["Model", "\u673a\u578b", "\u578b\u53f7"],
  itemType: ["Item_Type", "Item Type", "\u7269\u6599\u7c7b\u578b", "\u7269\u54c1\u7c7b\u578b"],
  serialNumber: ["SN", "SN_for_Stock", "Serial Number", "\u5e8f\u5217\u53f7", "\u5e93\u5b58SN"],
  stockStatus: ["Stock_Status", "Stock Status", "\u5e93\u5b58\u72b6\u6001"],
  condition: ["Stock_Condition", "Stock Condition", "\u5e93\u5b58\u5c5e\u6027", "\u5e93\u5b58\u6761\u4ef6"],
  quantity: ["Current_Qty", "Current Qty", "Physical Qty", "\u5f53\u524d\u5e93\u5b58", "\u5f53\u524d\u6570\u91cf"],
  frozenQuantity: ["Frozen_Qty", "Frozen Qty", "\u51bb\u7ed3\u6570\u91cf"],
};

function bestField(header: string, aliases: SemanticAliases) {
  const candidates: Array<{ field: string; score: number }> = [];
  for (const [field, values] of Object.entries(aliases)) {
    for (const value of values) {
      const alias = normalizeHeader(value);
      if (!alias) continue;
      if (header === alias) candidates.push({ field, score: 10_000 + alias.length });
      else if (alias.length >= 3 && header.includes(alias)) candidates.push({ field, score: 1_000 + alias.length });
      else if (header.length >= 3 && alias.includes(header)) candidates.push({ field, score: 100 + header.length });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.field.localeCompare(b.field));
  return candidates[0]?.field;
}

export function mapSemanticRows(
  sheet: RawWorkbookSheet,
  aliases: SemanticAliases,
  requiredFields: readonly string[],
  options: { headerSearchRows?: number } = {},
): SemanticMappedRow[] {
  const searchLimit = Math.min(options.headerSearchRows ?? 25, sheet.rows.length);
  let headerIndex = -1;
  let columns = new Map<string, number>();
  for (let rowIndex = 0; rowIndex < searchLimit; rowIndex += 1) {
    const candidate = new Map<string, number>();
    sheet.rows[rowIndex].forEach((value, columnIndex) => {
      const field = bestField(normalizeHeader(value), aliases);
      if (field && !candidate.has(field)) candidate.set(field, columnIndex);
    });
    if (requiredFields.every((field) => candidate.has(field))) {
      headerIndex = rowIndex;
      columns = candidate;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new DomainError(
      `Sheet ${sheet.name} is missing required semantic headers: ${requiredFields.join(", ")}`,
      "MISSING_REQUIRED_HEADER",
    );
  }
  const mapped: SemanticMappedRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const source = sheet.rows[rowIndex];
    const values: Record<string, WorkbookCellValue> = {};
    for (const [field, columnIndex] of columns) values[field] = source[columnIndex] ?? null;
    if (Object.values(values).every((value) => value === null || String(value).trim() === "")) continue;
    mapped.push({ sheet: sheet.name, rowNumber: rowIndex + 1, values });
  }
  return mapped;
}

export function findSheet(sheets: RawWorkbookSheet[], semanticNames: readonly string[], required = true) {
  const normalizedNames = semanticNames.map(normalizeHeader);
  const found = sheets.find((sheet) => {
    const name = normalizeHeader(sheet.name);
    return normalizedNames.some((candidate) => name.includes(candidate) || candidate.includes(name));
  });
  if (!found && required)
    throw new DomainError(`Missing required workbook sheet: ${semanticNames.join(" / ")}`, "MISSING_REQUIRED_SHEET");
  return found;
}
