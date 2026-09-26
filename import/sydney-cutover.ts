import { createHash } from "node:crypto";
import { analyzeWorkbook } from "@/import/workbook-analyzer";
import {
  normalizeCondition,
  normalizeLocation,
  normalizeSerial,
  normalizeSku,
  normalizeText,
} from "@/import/workbook-normalizer";
import type {
  RawWorkbook,
  ShadowBalanceRow,
  ShadowOutboundOrder,
  ShadowSerialRow,
  WorkbookLocationRow,
  WorkbookProductRow,
} from "@/import/workbook-types";

export const SYDNEY_CUTOVER_REFERENCE = "SYD-CUTOVER-20260811";

export type SydneyCutoverIssueSeverity = "Critical" | "Warning";

export interface SydneyCutoverIssue {
  code: string;
  severity: SydneyCutoverIssueSeverity;
  source: string;
  rowNumber?: number;
  message: string;
}

export interface SydneyCutoverSource {
  ledgerCsv: string;
  currentStockCsv: string;
  productCsv: string;
  locationCsv: string;
  goodSerialCsv: string;
  newSerialCsv: string;
}

export interface SydneyCutoverPlan {
  businessReference: string;
  sourceChecksum: string;
  cutoverAt: Date;
  products: WorkbookProductRow[];
  locations: WorkbookLocationRow[];
  balances: ShadowBalanceRow[];
  serials: ShadowSerialRow[];
  preparedOrders: ShadowOutboundOrder[];
  issues: SydneyCutoverIssue[];
  summary: {
    products: number;
    locations: number;
    containers: number;
    openingBalances: number;
    serials: number;
    inStock: number;
    prepared: number;
    outboundHistorical: number;
    physicalQty: number;
    frozenQty: number;
    preparedOrders: number;
    exceptions: number;
    criticalExceptions: number;
  };
}

export function parseCsv(csv: string): Array<Array<string | null>> {
  const rows: Array<Array<string | null>> = [];
  let row: Array<string | null> = [];
  let value = "";
  let quoted = false;
  const pushValue = () => {
    row.push(value === "" ? null : value);
    value = "";
  };
  const pushRow = () => {
    pushValue();
    if (row.some((cell) => cell !== null && cell !== "")) rows.push(row);
    row = [];
  };
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) pushValue();
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      pushRow();
    } else value += character;
  }
  if (value || row.length) pushRow();
  return rows;
}

function grain(row: Pick<ShadowBalanceRow, "warehouse" | "location" | "container" | "sku" | "condition">) {
  return JSON.stringify([row.warehouse, row.location, row.container ?? "", row.sku ?? "", row.condition]);
}

// The authoritative SN snapshot has no container column. Reconcile SN coverage
// at warehouse/location/SKU/condition level so containerized stock is not
// incorrectly reported as having zero serial evidence.
function serialGrain(row: Pick<ShadowBalanceRow, "warehouse" | "location" | "sku" | "condition">) {
  return JSON.stringify([row.warehouse, row.location, row.sku ?? "", row.condition]);
}

function aggregateBalances(rows: ShadowBalanceRow[]) {
  const balances = new Map<string, ShadowBalanceRow>();
  for (const row of rows) {
    const key = grain(row);
    const current = balances.get(key);
    if (current) {
      current.physicalQty += row.physicalQty;
      current.frozenQty += row.frozenQty;
    } else balances.set(key, { ...row });
  }
  return [...balances.values()].filter((row) => row.physicalQty !== 0 || row.frozenQty !== 0);
}

function mapSerialStatus(value: unknown) {
  const status = normalizeText(value as string | null)?.toLowerCase();
  if (!status || ["normal", "in_stock", "in stock", "在库"].includes(status)) return "In_Stock" as const;
  if (status === "prepared" || status === "已备货") return "Prepared" as const;
  if (status === "outbound" || status === "已出库") return "Outbound" as const;
  return undefined;
}

function parseSerialSheet(
  rows: Array<Array<string | null>>,
  source: "良品" | "新机",
  issues: SydneyCutoverIssue[],
) {
  const header = rows[0] ?? [];
  const normalizedHeaders = header.map((value) => normalizeText(value)?.toLowerCase() ?? "");
  const snIndex = normalizedHeaders.findIndex((value) => value === "sn");
  const locationIndex = normalizedHeaders.findIndex((value) => value.includes("库位"));
  const conditionIndex = normalizedHeaders.findIndex((value) => value.includes("属性"));
  const statusIndex = normalizedHeaders.findIndex((value) => value.includes("状态"));
  if ([snIndex, locationIndex, conditionIndex, statusIndex].some((index) => index < 0)) {
    issues.push({
      code: "MISSING_SN_SNAPSHOT_HEADER",
      severity: "Critical",
      source,
      message: "SN snapshot requires SN, 库位, 属性 and 台账状态 headers.",
    });
    return [];
  }
  const serials: ShadowSerialRow[] = [];
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const rawSerial = normalizeText(row[snIndex]);
    const rawLocation = normalizeText(row[locationIndex]);
    if (!rawSerial) return;
    if (
      rawSerial === "找不到" ||
      rawLocation?.includes("WMS存在但查无此机") ||
      rawLocation?.includes("\n")
    ) {
      issues.push({
        code: "SOURCE_RECONCILIATION_EXCEPTION",
        severity: "Warning",
        source,
        rowNumber,
        message: `Source row is an explicit unresolved reconciliation note and was not imported: ${rawSerial}.`,
      });
      return;
    }
    const parts = rawSerial.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 3) {
      issues.push({
        code: "INVALID_COMPOUND_SN",
        severity: "Critical",
        source,
        rowNumber,
        message: `Expected SKU/middle/machine-SN but received ${rawSerial}.`,
      });
      return;
    }
    const sku = normalizeSku(parts[0]);
    const serialNumber = normalizeSerial(parts.at(-1));
    const location = normalizeLocation(rawLocation);
    let condition;
    try {
      condition = normalizeCondition(row[conditionIndex]);
    } catch {
      issues.push({
        code: "INVALID_SN_CONDITION",
        severity: "Critical",
        source,
        rowNumber,
        message: `SN ${serialNumber ?? rawSerial} has an invalid or blank condition.`,
      });
      return;
    }
    const status = mapSerialStatus(row[statusIndex]);
    if (!sku || !serialNumber || !location || !status) {
      issues.push({
        code: "INVALID_SN_SNAPSHOT_ROW",
        severity: "Critical",
        source,
        rowNumber,
        message: `SN snapshot row is incomplete or has an unsupported status: ${rawSerial}.`,
      });
      return;
    }
    serials.push({ serialNumber, sku, warehouse: "SYD", location, condition, status });
  });
  return serials;
}

function stableChecksum(source: SydneyCutoverSource) {
  return createHash("sha256")
    .update([
      source.ledgerCsv,
      source.currentStockCsv,
      source.productCsv,
      source.locationCsv,
      source.goodSerialCsv,
      source.newSerialCsv,
    ].join("\n--SYD-CUTOVER-SOURCE--\n"))
    .digest("hex")
    .toUpperCase();
}

export function buildSydneyCutoverPlan(input: {
  source: SydneyCutoverSource;
  cutoverAt: Date;
  businessReference?: string;
}): SydneyCutoverPlan {
  const businessReference = input.businessReference ?? SYDNEY_CUTOVER_REFERENCE;
  const issues: SydneyCutoverIssue[] = [];
  const workbook: RawWorkbook = {
    sourceFileName: "Sydney authoritative Google Sheets cutover",
    sourceChecksum: stableChecksum(input.source),
    sheets: [
      { name: "主表 Stock_Transaction_Log", rows: parseCsv(input.source.ledgerCsv) },
      { name: "Current_Stock_Detail 当前库存明细查询", rows: parseCsv(input.source.currentStockCsv) },
      { name: "Product_Stock_Master产品维护", rows: parseCsv(input.source.productCsv) },
      { name: "Location_Master库位维护", rows: parseCsv(input.source.locationCsv) },
    ],
  };
  const analysis = analyzeWorkbook(workbook, {
    mode: "DRY_RUN",
    cutoverAt: input.cutoverAt,
    defaultWarehouse: "SYD",
    wms: { products: [], locations: [], balances: [], serials: [] },
  });
  const products = analysis.productRows;
  const locations = analysis.locationRows;
  const balances = aggregateBalances(analysis.workbookViewBalances);
  const serials = [
    ...parseSerialSheet(parseCsv(input.source.goodSerialCsv), "良品", issues),
    ...parseSerialSheet(parseCsv(input.source.newSerialCsv), "新机", issues),
  ];
  const productsBySku = new Map(products.map((product) => [product.sku, product]));
  const locationCodes = new Set(locations.map((location) => location.code));
  const seenSerials = new Set<string>();
  for (const serial of serials) {
    if (seenSerials.has(serial.serialNumber))
      issues.push({
        code: "DUPLICATE_SN",
        severity: "Critical",
        source: "SN snapshot",
        message: `Duplicate machine SN ${serial.serialNumber}.`,
      });
    seenSerials.add(serial.serialNumber);
    const product = productsBySku.get(serial.sku);
    if (!product)
      issues.push({
        code: "UNKNOWN_SN_SKU",
        severity: "Critical",
        source: "SN snapshot",
        message: `SN ${serial.serialNumber} references unknown SKU ${serial.sku}.`,
      });
    else if (product.itemType !== "Product")
      issues.push({
        code: "SN_SKU_NOT_SERIAL_TRACKED_PRODUCT",
        severity: "Critical",
        source: "SN snapshot",
        message: `SN ${serial.serialNumber} references non-Product SKU ${serial.sku}.`,
      });
    if (!locationCodes.has(serial.location))
      issues.push({
        code: "UNKNOWN_SN_LOCATION",
        severity: "Critical",
        source: "SN snapshot",
        message: `SN ${serial.serialNumber} references unknown location ${serial.location}.`,
      });
  }
  for (const balance of balances) {
    if (balance.physicalQty < 0 || balance.frozenQty < 0 || balance.frozenQty > balance.physicalQty)
      issues.push({
        code: "INVALID_OPENING_QUANTITY",
        severity: "Critical",
        source: "Current Stock",
        message: `Invalid Physical/Frozen quantity at ${balance.location} / ${balance.sku ?? "(no SKU)"}.`,
      });
    if (!locationCodes.has(balance.location))
      issues.push({
        code: "UNKNOWN_OPENING_LOCATION",
        severity: "Critical",
        source: "Current Stock",
        message: `Opening balance references unknown location ${balance.location}.`,
      });
    const product = balance.sku ? productsBySku.get(balance.sku) : undefined;
    if (balance.sku && !product)
      issues.push({
        code: "UNKNOWN_OPENING_SKU",
        severity: "Critical",
        source: "Current Stock",
        message: `Opening balance references unknown SKU ${balance.sku}.`,
      });
    else if (product && product.itemType !== balance.itemType)
      issues.push({
        code: "OPENING_ITEM_TYPE_MISMATCH",
        severity: "Critical",
        source: "Current Stock",
        message: `Opening balance item type conflicts with Product Master for ${balance.sku}.`,
      });
  }

  const physicalSerialCounts = new Map<string, number>();
  const preparedSerialCounts = new Map<string, number>();
  for (const serial of serials) {
    if (serial.status === "Outbound") continue;
    const key = serialGrain(serial);
    physicalSerialCounts.set(key, (physicalSerialCounts.get(key) ?? 0) + 1);
    if (serial.status === "Prepared")
      preparedSerialCounts.set(key, (preparedSerialCounts.get(key) ?? 0) + 1);
  }
  const serialTrackedBalances = new Map<string, ShadowBalanceRow>();
  for (const balance of balances.filter((row) => row.itemType === "Product" && ["New", "Repair_Good"].includes(row.condition))) {
    const key = serialGrain(balance);
    const current = serialTrackedBalances.get(key);
    if (current) {
      current.physicalQty += balance.physicalQty;
      current.frozenQty += balance.frozenQty;
    } else serialTrackedBalances.set(key, { ...balance, container: undefined });
  }
  for (const balance of serialTrackedBalances.values()) {
    const key = serialGrain(balance);
    const physicalSerials = physicalSerialCounts.get(key) ?? 0;
    const preparedSerials = preparedSerialCounts.get(key) ?? 0;
    if (physicalSerials !== balance.physicalQty)
      issues.push({
        code: "PHYSICAL_SN_COUNT_MISMATCH",
        severity: "Critical",
        source: "Cutover reconciliation",
        message: `${balance.location} / ${balance.sku} / ${balance.condition}: Physical ${balance.physicalQty}, physically-present SN ${physicalSerials}.`,
      });
    if (preparedSerials !== balance.frozenQty)
      issues.push({
        code: "PREPARED_FROZEN_MISMATCH",
        severity: "Critical",
        source: "Cutover reconciliation",
        message: `${balance.location} / ${balance.sku} / ${balance.condition}: Frozen ${balance.frozenQty}, Prepared SN ${preparedSerials}.`,
      });
  }

  const serialByNumber = new Map(serials.map((serial) => [serial.serialNumber, serial]));
  const preparedOrders: ShadowOutboundOrder[] = [];
  for (const order of analysis.activeOutboundOrders.filter((candidate) => candidate.status === "Prepared")) {
    const blocking: string[] = [];
    for (const line of order.lines) {
      const product = line.sku ? productsBySku.get(line.sku) : undefined;
      if (!product) blocking.push(`unknown SKU ${line.sku ?? "(blank)"}`);
      if (!line.sourceAllocations.length) blocking.push(`missing source location for ${line.sku ?? "(blank)"}`);
      if (product?.itemType === "Product") {
        if (line.serialNumbers.length !== line.quantity)
          blocking.push(`SN quantity mismatch for ${line.sku}`);
        for (const allocation of line.sourceAllocations) {
          for (const serialNumber of allocation.serialNumbers) {
            const serial = serialByNumber.get(serialNumber);
            if (!serial || serial.status !== "Prepared")
              blocking.push(`SN ${serialNumber} is not Prepared in the authoritative snapshot`);
            else {
              if (serial.sku !== line.sku) blocking.push(`SN ${serialNumber} does not match SKU ${line.sku}`);
              if (serial.condition !== line.condition)
                blocking.push(`SN ${serialNumber} does not match condition ${line.condition}`);
              if (serial.location !== allocation.location)
                blocking.push(`SN ${serialNumber} does not match location ${allocation.location}`);
            }
          }
        }
      }
    }
    if (blocking.length) {
      issues.push({
        code: "UNRESOLVED_PREPARED_ORDER_LINK",
        severity: "Warning",
        source: "Prepared outbound",
        message: `SH ${order.shNo} was not rebuilt: ${[...new Set(blocking)].join("; ")}. Inventory/SN state remains authoritative.`,
      });
    } else preparedOrders.push(order);
  }

  for (const issue of analysis.issues.filter((candidate) => candidate.code !== "DISPLAY_ONLY_PLACEHOLDER"))
    issues.push({
      code: `LEDGER_${issue.code}`,
      severity: "Warning",
      source: issue.sheet,
      rowNumber: issue.rowNumber,
      message: issue.message,
    });

  const summary = {
    products: products.length,
    locations: locations.length,
    containers: new Set(balances.flatMap((balance) => balance.container ? [balance.container] : [])).size,
    openingBalances: balances.length,
    serials: serials.length,
    inStock: serials.filter((serial) => serial.status === "In_Stock").length,
    prepared: serials.filter((serial) => serial.status === "Prepared").length,
    outboundHistorical: serials.filter((serial) => serial.status === "Outbound").length,
    physicalQty: balances.reduce((sum, balance) => sum + balance.physicalQty, 0),
    frozenQty: balances.reduce((sum, balance) => sum + balance.frozenQty, 0),
    preparedOrders: preparedOrders.length,
    exceptions: issues.length,
    criticalExceptions: issues.filter((issue) => issue.severity === "Critical").length,
  };
  return {
    businessReference,
    sourceChecksum: workbook.sourceChecksum,
    cutoverAt: input.cutoverAt,
    products,
    locations,
    balances,
    serials,
    preparedOrders,
    issues,
    summary,
  };
}
