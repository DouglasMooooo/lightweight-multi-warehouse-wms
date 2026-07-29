import { reconcileInventory, reconcileSerialCounts, reconcileSerials } from "@/domain/reconciliation";
import type { SerialStatus, StockCondition } from "@/domain/types";
import {
  CURRENT_STOCK_HEADER_ALIASES,
  LEDGER_HEADER_ALIASES,
  LOCATION_HEADER_ALIASES,
  PRODUCT_HEADER_ALIASES,
  findSheet,
  mapSemanticRows,
} from "./workbook-mapper";
import {
  normalizeBoolean,
  normalizeCondition,
  normalizeDate,
  normalizeItemType,
  normalizeLocation,
  normalizeQuantity,
  normalizeSerial,
  normalizeSku,
  normalizeText,
} from "./workbook-normalizer";
import type {
  ImportIssue,
  ImportSeverity,
  RawWorkbook,
  ReconciliationReportRow,
  SemanticMappedRow,
  ShadowBalanceRow,
  ShadowImportMode,
  ShadowImportResult,
  ShadowOutboundOrder,
  ShadowPickupBatch,
  ShadowRepairItem,
  ShadowSerialRow,
  WmsShadowReference,
  WorkbookLedgerRow,
  WorkbookLocationRow,
  WorkbookProductRow,
} from "./workbook-types";

const LEDGER_SHEETS = ["Stock_Transaction_Log", "主表"];
const CURRENT_STOCK_SHEETS = ["Current_Stock_Detail", "当前库存明细查询"];
const PRODUCT_SHEETS = ["Product_Stock_Master", "产品维护"];
const LOCATION_SHEETS = ["Location_Master", "库位维护"];

function issue(
  issues: ImportIssue[],
  input: Omit<ImportIssue, "classification"> & {
    classification?: ImportIssue["classification"];
  },
) {
  issues.push({
    ...input,
    classification: input.classification ?? "DATA_QUALITY",
  });
}

function isDisplayOnlyPlaceholder(row: SemanticMappedRow) {
  const sku = normalizeSku(row.values.sku);
  const quantity = Number(row.values.quantity);
  const remark = normalizeText(row.values.remark)?.toLowerCase() ?? "";
  return (
    quantity === 99 &&
    (sku === "坏机" || sku === "FAULTY-UNIT" || sku === "DISPLAY-ONLY") &&
    (remark.includes("display") ||
      remark.includes("occupancy") ||
      remark.includes("仅显示") ||
      remark.includes("占用"))
  );
}

function parseLedgerRows(
  rows: SemanticMappedRow[],
  issues: ImportIssue[],
  knownLocations: Set<string>,
): WorkbookLedgerRow[] {
  const mapped: WorkbookLedgerRow[] = [];
  for (const row of rows) {
    if (isDisplayOnlyPlaceholder(row)) {
      issue(issues, {
        code: "DISPLAY_ONLY_PLACEHOLDER",
        severity: "Low",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: "Display-only occupancy placeholder excluded from stock truth.",
        sku: normalizeSku(row.values.sku),
      });
      continue;
    }
    const action = normalizeText(row.values.action);
    if (!action) continue;
    let itemType;
    let condition;
    let quantity;
    try {
      itemType = normalizeItemType(row.values.itemType);
      condition = normalizeCondition(row.values.condition);
      quantity = normalizeQuantity(row.values.quantity);
    } catch (error) {
      issue(issues, {
        code:
          error instanceof Error && error.message.includes("condition")
            ? "INVALID_STOCK_CONDITION"
            : error instanceof Error && error.message.includes("item type")
              ? "INVALID_ITEM_TYPE"
              : "INVALID_QUANTITY",
        severity: "High",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const sku = normalizeSku(row.values.sku);
    const reason = normalizeText(row.values.reason);
    const remark = normalizeText(row.values.remark);
    if (!sku && itemType === "Product") {
      issue(issues, {
        code: "BLANK_PRODUCT_SKU",
        severity: "High",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: "Blank-SKU Product row rejected.",
      });
      continue;
    }
    if (!sku && !(itemType === "Material" && (reason === "Unmonitored material" || remark?.includes("Unmonitored material")))) {
      issue(issues, {
        code: "UNKNOWN_SKU",
        severity: "High",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: "Blank SKU is allowed only for controlled unmonitored Material.",
      });
      continue;
    }
    const fromLocation = normalizeLocation(row.values.fromLocation);
    const toLocation = normalizeLocation(row.values.toLocation);
    if (fromLocation && knownLocations.size > 0 && !knownLocations.has(fromLocation))
      issue(issues, {
        code: "UNKNOWN_LOCATION",
        severity: "Medium",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: `Unknown source location ${fromLocation}.`,
        sku,
        location: fromLocation,
      });
    if (toLocation && knownLocations.size > 0 && !knownLocations.has(toLocation))
      issue(issues, {
        code: "UNKNOWN_LOCATION",
        severity: "Medium",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: `Unknown target location ${toLocation}.`,
        sku,
        location: toLocation,
      });
    const outboundAt = normalizeDate(row.values.outboundDate);
    let shadowStatus: WorkbookLedgerRow["shadowStatus"] = "Reference";
    if (action === "Prepared") {
      if (!fromLocation) {
        shadowStatus = "Pending_Allocation";
        issue(issues, {
          code: "PREPARED_WITHOUT_LOCATION",
          severity: "Medium",
          sheet: row.sheet,
          rowNumber: row.rowNumber,
          message: "Workbook Prepared row downgraded to Pending Allocation because no physical source exists.",
          sku,
        });
      } else {
        shadowStatus = "Prepared";
      }
    }
    if (action === "Outbound") {
      shadowStatus = outboundAt ? "Outbound" : "Reference";
      if (!outboundAt)
        issue(issues, {
          code: "OUTBOUND_WITHOUT_OUTBOUND_DATE",
          severity: "Medium",
          sheet: row.sheet,
          rowNumber: row.rowNumber,
          message: "Outbound action lacks actual Outbound_Date; dispatch time was not invented.",
          sku,
        });
    }
    const serialNumber = normalizeSerial(row.values.serialNumber);
    if (action === "Return_to_Repair" && !serialNumber)
      issue(issues, {
        code: "RETURN_WITHOUT_SN",
        severity: "High",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: "Faulty return lacks a serial number.",
        sku,
      });
    mapped.push({
      rowNumber: row.rowNumber,
      date: normalizeDate(row.values.date),
      outboundAt,
      action,
      shadowStatus,
      shNo: normalizeText(row.values.shNo),
      pickupCode: normalizeText(row.values.pickupCode),
      container: normalizeText(row.values.container),
      sku,
      model: normalizeText(row.values.model),
      itemType,
      serialNumber,
      quantity,
      fromLocation,
      toLocation,
      erpWarehouse: normalizeText(row.values.erpWarehouse),
      condition,
      reason,
      remark,
    });
  }
  return mapped;
}

function balanceGrain(row: {
  warehouse: string;
  location: string;
  container?: string;
  sku?: string;
  condition: string;
}) {
  return JSON.stringify([
    row.warehouse,
    row.location,
    row.container ?? "",
    row.sku ?? "",
    row.condition,
  ]);
}

function projectLedgerBalances(
  ledger: WorkbookLedgerRow[],
  warehouse: string,
): ShadowBalanceRow[] {
  const balances = new Map<string, ShadowBalanceRow>();
  const change = (
    row: WorkbookLedgerRow,
    location: string | undefined,
    physicalDelta: number,
    frozenDelta = 0,
  ) => {
    if (!location) return;
    const candidate: ShadowBalanceRow = {
      warehouse,
      location,
      container: row.container,
      sku: row.sku,
      itemType: row.itemType,
      condition: row.condition,
      physicalQty: 0,
      frozenQty: 0,
      source: "WORKBOOK_LEDGER",
    };
    const key = balanceGrain(candidate);
    const current = balances.get(key) ?? candidate;
    current.physicalQty += physicalDelta;
    current.frozenQty += frozenDelta;
    balances.set(key, current);
  };
  for (const row of ledger) {
    switch (row.action) {
      case "Opening":
      case "Inbound":
      case "Adjustment_In":
      case "Return_to_Repair":
      case "Transfer_In":
        change(row, row.toLocation, row.quantity);
        break;
      case "Outbound":
      case "Adjustment_Out":
      case "Transfer_Out":
        change(row, row.fromLocation, -row.quantity);
        break;
      case "Move":
        change(row, row.fromLocation, -row.quantity);
        change(row, row.toLocation, row.quantity);
        break;
      case "Prepared":
        if (row.shadowStatus === "Prepared") change(row, row.fromLocation, 0, row.quantity);
        break;
    }
  }
  return [...balances.values()].filter(
    (row) => row.physicalQty !== 0 || row.frozenQty !== 0,
  );
}

function projectLedgerSerials(ledger: WorkbookLedgerRow[], warehouse: string) {
  const serials = new Map<string, ShadowSerialRow>();
  for (const row of ledger) {
    if (!row.serialNumber || !row.sku) continue;
    const existing = serials.get(row.serialNumber);
    const inboundLocation = row.toLocation;
    if (["Opening", "Inbound", "Adjustment_In", "Return_to_Repair", "Transfer_In"].includes(row.action)) {
      if (!inboundLocation) continue;
      serials.set(row.serialNumber, {
        serialNumber: row.serialNumber,
        sku: row.sku,
        warehouse,
        location: inboundLocation,
        condition: row.condition,
        status:
          row.condition === "Repair"
            ? "Repair"
            : row.condition === "Scrap"
              ? "Scrapped"
              : "In_Stock",
      });
    } else if (row.action === "Move" && row.toLocation && existing) {
      serials.set(row.serialNumber, { ...existing, location: row.toLocation });
    } else if (row.action === "Prepared" && row.fromLocation) {
      serials.set(row.serialNumber, {
        serialNumber: row.serialNumber,
        sku: row.sku,
        warehouse,
        location: row.fromLocation,
        condition: row.condition,
        status: "Prepared",
      });
    } else if (["Outbound", "Transfer_Out", "Adjustment_Out"].includes(row.action)) {
      serials.delete(row.serialNumber);
    }
  }
  return [...serials.values()];
}

function parseProducts(rows: SemanticMappedRow[], issues: ImportIssue[]) {
  return rows.flatMap<WorkbookProductRow>((row) => {
    const sku = normalizeSku(row.values.sku);
    const model = normalizeText(row.values.model);
    if (!sku || !model) return [];
    try {
      return [{
        rowNumber: row.rowNumber,
        sku,
        model,
        itemType: normalizeItemType(row.values.itemType),
        category: normalizeText(row.values.category),
        active: normalizeBoolean(row.values.active, true),
        reportMachine: normalizeBoolean(row.values.reportMachine),
        reportGroup: normalizeText(row.values.reportGroup),
      }];
    } catch (error) {
      issue(issues, {
        code: "ITEM_TYPE_MISMATCH",
        severity: "High",
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        message: error instanceof Error ? error.message : String(error),
        sku,
      });
      return [];
    }
  });
}

function parseLocations(rows: SemanticMappedRow[], defaultWarehouse: string) {
  return rows.flatMap<WorkbookLocationRow>((row) => {
    const code = normalizeLocation(row.values.code);
    if (!code) return [];
    return [{
      rowNumber: row.rowNumber,
      code,
      warehouse: normalizeText(row.values.warehouse) ?? defaultWarehouse,
      zone: normalizeText(row.values.zone),
      rack: normalizeText(row.values.rack),
      row: normalizeText(row.values.row),
      bay: normalizeText(row.values.bay),
      side: normalizeText(row.values.side),
      serviceZone: normalizeBoolean(row.values.serviceZone),
    }];
  });
}

function parseCurrentStock(
  rows: SemanticMappedRow[],
  defaultWarehouse: string,
  issues: ImportIssue[],
) {
  const balances: ShadowBalanceRow[] = [];
  const serials: ShadowSerialRow[] = [];
  for (const row of rows) {
    const stockStatus = normalizeText(row.values.stockStatus)?.toLowerCase() ?? "";
    if (
      stockStatus &&
      !stockStatus.startsWith("in stock") &&
      !stockStatus.includes("\u5728\u5e93")
    )
      continue;
    const location = normalizeLocation(row.values.location);
    if (!location) continue;
    let quantity: number;
    let condition: StockCondition;
    let itemType;
    try {
      quantity = normalizeQuantity(row.values.quantity);
      condition = normalizeCondition(row.values.condition);
      itemType = normalizeItemType(row.values.itemType);
    } catch {
      continue;
    }
    if (quantity <= 0) continue;
    const sku = normalizeSku(row.values.sku);
    if (!sku && itemType === "Product") continue;
    const candidate: ShadowBalanceRow = {
      warehouse: normalizeText(row.values.warehouse) ?? defaultWarehouse,
      location,
      container: normalizeText(row.values.container),
      sku,
      itemType,
      condition,
      physicalQty: quantity,
      frozenQty: (() => {
        try {
          return normalizeQuantity(row.values.frozenQuantity ?? 0);
        } catch {
          return 0;
        }
      })(),
      source: "WORKBOOK_VIEW",
    };
    balances.push(candidate);
    const serialNumber = normalizeSerial(row.values.serialNumber);
    if (serialNumber && sku) {
      const status: SerialStatus =
        condition === "Repair" ? "Repair" : condition === "Scrap" ? "Scrapped" : "In_Stock";
      serials.push({
        serialNumber,
        sku,
        warehouse: candidate.warehouse,
        location,
        condition,
        status,
      });
    }
  }
  if (balances.length === 0)
    issue(issues, {
      code: "ACTIVE_WORKFLOW_REVIEW_REQUIRED",
      severity: "Medium",
      sheet: rows[0]?.sheet ?? "Current Stock",
      message: "Workbook Current Stock view contains no usable positive cached rows.",
    });
  return { balances, serials };
}

function severityForInventory(status: string, classification = "CURRENT_OPERATIONAL_ERROR"): ImportSeverity {
  if (status === "MATCH") return "Low";
  if (classification === "LEGACY_TRACEABILITY_GAP") return "Low";
  if (status === "QTY_DIFFERENCE" || status === "SERIAL_COUNT_EXCESS") return "High";
  return "Medium";
}

function mapActiveWork(ledger: WorkbookLedgerRow[]) {
  const orderMap = new Map<string, ShadowOutboundOrder>();
  for (const row of ledger) {
    if (!row.shNo || !["Prepared", "Outbound"].includes(row.action)) continue;
    const status: ShadowOutboundOrder["status"] =
      row.action === "Outbound"
        ? row.outboundAt
          ? "Outbound"
          : "Review_Required"
        : row.shadowStatus === "Pending_Allocation"
          ? "Pending_Allocation"
          : "Prepared";
    const order = orderMap.get(row.shNo) ?? {
      shNo: row.shNo,
      pickupCode: row.pickupCode,
      status,
      outboundAt: row.outboundAt,
      lines: [],
    };
    if (status === "Review_Required" || order.status === "Review_Required")
      order.status = "Review_Required";
    else if (status === "Outbound") order.status = "Outbound";
    else if (status === "Pending_Allocation" && order.status !== "Outbound")
      order.status = "Pending_Allocation";
    order.pickupCode ??= row.pickupCode;
    order.outboundAt ??= row.outboundAt;
    const line = order.lines.find(
      (candidate) =>
        candidate.sku === row.sku &&
        candidate.model === row.model &&
        candidate.erpWarehouse === row.erpWarehouse &&
        candidate.sourceLocation === row.fromLocation,
    );
    if (line) {
      line.quantity += row.quantity;
      if (row.serialNumber && !line.serialNumbers.includes(row.serialNumber))
        line.serialNumbers.push(row.serialNumber);
    } else
      order.lines.push({
        sku: row.sku,
        model: row.model,
        quantity: row.quantity,
        erpWarehouse: row.erpWarehouse,
        sourceLocation: row.fromLocation,
        serialNumbers: row.serialNumber ? [row.serialNumber] : [],
      });
    orderMap.set(row.shNo, order);
  }
  const activeOutboundOrders = [...orderMap.values()];

  const pickupMap = new Map<string, ShadowPickupBatch>();
  for (const order of activeOutboundOrders) {
    if (!order.pickupCode) continue;
    const batch = pickupMap.get(order.pickupCode) ?? {
      pickupCode: order.pickupCode,
      shNos: [],
      labelGroups: [],
    };
    if (!batch.shNos.includes(order.shNo)) batch.shNos.push(order.shNo);
    for (const line of order.lines) {
      const existing = batch.labelGroups.find(
        (group) =>
          group.sku === line.sku &&
          group.model === line.model &&
          group.erpWarehouse === line.erpWarehouse,
      );
      if (existing) existing.quantity += line.quantity;
      else
        batch.labelGroups.push({
          sku: line.sku,
          model: line.model,
          erpWarehouse: line.erpWarehouse,
          quantity: line.quantity,
        });
    }
    pickupMap.set(order.pickupCode, batch);
  }

  const repairItems: ShadowRepairItem[] = [];
  for (const row of ledger) {
    if (!row.serialNumber) continue;
    if (row.condition === "Repair" && row.action === "Return_to_Repair")
      repairItems.push({
        serialNumber: row.serialNumber,
        sku: row.sku,
        condition: row.condition,
        status: "Repair",
        location: row.toLocation,
        createRepairJob: true,
        classification: "CURRENT_OPERATIONAL_ERROR",
      });
    else if (row.condition === "Scrap")
      repairItems.push({
        serialNumber: row.serialNumber,
        sku: row.sku,
        condition: row.condition,
        status: "Scrapped",
        location: row.toLocation ?? row.fromLocation,
        createRepairJob: false,
        classification: "CURRENT_OPERATIONAL_ERROR",
      });
    else if (row.condition === "Repair_Good" && row.action === "Adjustment_In")
      repairItems.push({
        serialNumber: row.serialNumber,
        sku: row.sku,
        condition: row.condition,
        status: "Legacy_Repair_Good",
        location: row.toLocation,
        createRepairJob: false,
        classification: "LEGACY_TRACEABILITY_GAP",
      });
  }
  return {
    activeOutboundOrders,
    pickupBatches: [...pickupMap.values()],
    repairItems,
  };
}

function addMasterReconciliation(
  products: WorkbookProductRow[],
  locations: WorkbookLocationRow[],
  wms: WmsShadowReference,
  now: string,
  report: ReconciliationReportRow[],
) {
  const wmsProducts = new Map(wms.products.map((row) => [row.sku, row]));
  for (const product of products) {
    const target = wmsProducts.get(product.sku);
    const mismatch = !target
      ? "UNKNOWN_SKU"
      : target.model !== product.model
        ? "MODEL_MISMATCH"
        : target.itemType !== product.itemType
          ? "ITEM_TYPE_MISMATCH"
          : target.reportMachine !== product.reportMachine ||
              (target.reportGroup ?? "") !== (product.reportGroup ?? "")
            ? "REPORT_METADATA_MISMATCH"
            : undefined;
    if (mismatch)
      report.push({
        timestamp: now,
        discrepancyType: mismatch,
        severity: mismatch === "UNKNOWN_SKU" && product.itemType === "Product" ? "High" : "Medium",
        source: "MASTER_DATA",
        sku: product.sku,
        model: product.model,
        classification: "CURRENT_OPERATIONAL_ERROR",
        comment: `Workbook product master differs from WMS: ${mismatch}.`,
      });
  }
  const wmsLocations = new Set(
    wms.locations.map((row) => `${row.warehouse}/${row.code}`),
  );
  for (const location of locations) {
    if (!wmsLocations.has(`${location.warehouse}/${location.code}`))
      report.push({
        timestamp: now,
        warehouse: location.warehouse,
        discrepancyType: "UNKNOWN_LOCATION",
        severity: "Medium",
        source: "MASTER_DATA",
        workbookLocation: location.code,
        classification: "CURRENT_OPERATIONAL_ERROR",
        comment: "Workbook location is not present in WMS Location master.",
      });
  }
}

function addInventoryReconciliation(
  workbook: ShadowBalanceRow[],
  wms: ShadowBalanceRow[],
  source: "WORKBOOK_VIEW" | "WORKBOOK_LEDGER",
  now: string,
  report: ReconciliationReportRow[],
) {
  const results = reconcileInventory(
    workbook.map((row) => ({
      warehouse: row.warehouse,
      sku: row.sku ?? "",
      condition: row.condition,
      location: row.location,
      container: row.container,
      quantity: row.physicalQty,
    })),
    wms.map((row) => ({
      warehouse: row.warehouse,
      sku: row.sku ?? "",
      condition: row.condition,
      location: row.location,
      container: row.container,
      quantity: row.physicalQty,
    })),
  );
  for (const result of results) {
    const ledger = result.ledger;
    const target = result.wms;
    report.push({
      timestamp: now,
      warehouse: ledger?.warehouse ?? target?.warehouse,
      discrepancyType: result.status,
      severity: severityForInventory(result.status),
      source,
      sku: ledger?.sku || target?.sku,
      workbookQty: ledger?.quantity,
      wmsQty: target?.quantity,
      workbookLocation: ledger?.location,
      wmsLocation: target?.location,
      workbookCondition: ledger?.condition,
      wmsCondition: target?.condition,
      classification: result.status === "MATCH" ? "MATCH" : "CURRENT_OPERATIONAL_ERROR",
      comment: `${source} compared with WMS at semantic balance grain.`,
    });
  }
}

export function analyzeWorkbook(
  workbook: RawWorkbook,
  input: {
    mode: ShadowImportMode;
    cutoverAt: Date;
    defaultWarehouse?: string;
    wms: WmsShadowReference;
  },
): ShadowImportResult {
  const defaultWarehouse = input.defaultWarehouse ?? "SYD";
  const issues: ImportIssue[] = [];
  const productSheet = findSheet(workbook.sheets, PRODUCT_SHEETS);
  const locationSheet = findSheet(workbook.sheets, LOCATION_SHEETS);
  const ledgerSheet = findSheet(workbook.sheets, LEDGER_SHEETS);
  const currentSheet = findSheet(workbook.sheets, CURRENT_STOCK_SHEETS, false);
  const productRows = parseProducts(
    mapSemanticRows(productSheet!, PRODUCT_HEADER_ALIASES, ["sku", "model", "itemType"]),
    issues,
  );
  const locationRows = parseLocations(
    mapSemanticRows(locationSheet!, LOCATION_HEADER_ALIASES, ["code"]),
    defaultWarehouse,
  );
  const knownLocations = new Set(locationRows.map((row) => row.code));
  const rawLedgerRows = mapSemanticRows(
    ledgerSheet!,
    LEDGER_HEADER_ALIASES,
    ["action", "quantity", "itemType", "condition"],
  );
  const ledgerRows = parseLedgerRows(rawLedgerRows, issues, knownLocations);
  const activeWork = mapActiveWork(ledgerRows);
  const ledgerProjectedBalances = projectLedgerBalances(ledgerRows, defaultWarehouse);
  const ledgerProjectedSerials = projectLedgerSerials(ledgerRows, defaultWarehouse);
  const current = currentSheet
    ? parseCurrentStock(
        mapSemanticRows(
          currentSheet,
          CURRENT_STOCK_HEADER_ALIASES,
          ["location", "itemType", "condition", "quantity"],
        ),
        defaultWarehouse,
        issues,
      )
    : { balances: [], serials: [] };
  const now = new Date().toISOString();
  const reconciliation: ReconciliationReportRow[] = [];
  addMasterReconciliation(productRows, locationRows, input.wms, now, reconciliation);
  addInventoryReconciliation(current.balances, input.wms.balances, "WORKBOOK_VIEW", now, reconciliation);
  addInventoryReconciliation(ledgerProjectedBalances, input.wms.balances, "WORKBOOK_LEDGER", now, reconciliation);
  const workbookSerials = current.serials.length > 0 ? current.serials : ledgerProjectedSerials;
  for (const result of reconcileSerials(workbookSerials, input.wms.serials)) {
    reconciliation.push({
      timestamp: now,
      warehouse: result.ledger.warehouse,
      discrepancyType: result.status,
      severity: severityForInventory(result.status, result.classification),
      source: "WORKBOOK_VIEW",
      sku: result.ledger.sku,
      workbookLocation: result.ledger.location,
      wmsLocation: result.wms?.location,
      workbookCondition: result.ledger.condition,
      wmsCondition: result.wms?.condition,
      serialNumber: result.ledger.serialNumber,
      classification: result.classification,
      comment: "Workbook SN compared with WMS serial registry.",
    });
  }
  const serialCountResults = reconcileSerialCounts(
    current.balances
      .filter((row) => row.sku && row.itemType === "Product")
      .map((row) => ({
        balanceId: balanceGrain(row),
        productId: row.sku!,
        sku: row.sku!,
        warehouse: row.warehouse,
        location: row.location,
        condition: row.condition,
        physicalQty: row.physicalQty,
        legacySerialGap: row.legacySerialGap,
      })),
    workbookSerials.map((row) => ({
      productId: row.sku,
      warehouse: row.warehouse,
      location: row.location,
      condition: row.condition,
      status: row.status,
    })),
  );
  for (const result of serialCountResults) {
    reconciliation.push({
      timestamp: now,
      warehouse: result.balance.warehouse,
      discrepancyType: result.status,
      severity: severityForInventory(result.status, result.classification),
      source: "WORKBOOK_VIEW",
      sku: result.balance.sku,
      workbookQty: result.physicalQty,
      wmsQty: result.activeSerialQty,
      workbookLocation: result.balance.location,
      workbookCondition: result.balance.condition,
      classification: result.classification,
      comment: "Workbook Physical Qty compared with physically-present workbook SN count.",
    });
  }
  for (const problem of issues.filter((row) => row.code !== "DISPLAY_ONLY_PLACEHOLDER")) {
    reconciliation.push({
      timestamp: now,
      discrepancyType: problem.code,
      severity: problem.severity,
      source: "WORKFLOW",
      sku: problem.sku,
      workbookLocation: problem.location,
      serialNumber: problem.serialNumber,
      classification: problem.classification,
      comment: problem.message,
    });
  }
  const summary = {
    matches: reconciliation.filter((row) => row.classification === "MATCH").length,
    critical: reconciliation.filter((row) => row.severity === "Critical").length,
    high: reconciliation.filter((row) => row.severity === "High").length,
    medium: reconciliation.filter((row) => row.severity === "Medium").length,
    low: reconciliation.filter((row) => row.severity === "Low" && row.classification !== "MATCH").length,
  };
  const rejectedRows = issues.filter((row) => ["Critical", "High"].includes(row.severity)).length;
  const warningRows = issues.filter((row) => ["Medium", "Low"].includes(row.severity)).length;
  return {
    mode: input.mode,
    batchKey: `${workbook.sourceChecksum}:${input.mode}:${input.cutoverAt.toISOString()}`,
    sourceFileName: workbook.sourceFileName,
    sourceChecksum: workbook.sourceChecksum,
    cutoverAt: input.cutoverAt.toISOString(),
    workbookRows: rawLedgerRows.length,
    acceptedRows: ledgerRows.length,
    warningRows,
    rejectedRows,
    ledgerRows,
    productRows,
    locationRows,
    workbookViewBalances: current.balances,
    ledgerProjectedBalances,
    workbookSerials,
    ...activeWork,
    issues,
    reconciliation,
    summary,
  };
}
