import type { ItemType, SerialStatus, StockCondition } from "@/domain/types";

export type ShadowImportMode = "DRY_RUN" | "SHADOW_SEED";
export type ImportSeverity = "Critical" | "High" | "Medium" | "Low";

export type ImportIssueCode =
  | "MISSING_REQUIRED_HEADER"
  | "MISSING_REQUIRED_SHEET"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "INVALID_QUANTITY"
  | "INVALID_ITEM_TYPE"
  | "INVALID_STOCK_CONDITION"
  | "UNKNOWN_SKU"
  | "UNKNOWN_LOCATION"
  | "MODEL_MISMATCH"
  | "ITEM_TYPE_MISMATCH"
  | "REPORT_METADATA_MISMATCH"
  | "PREPARED_WITHOUT_LOCATION"
  | "OUTBOUND_WITHOUT_OUTBOUND_DATE"
  | "RETURN_WITHOUT_SN"
  | "BLANK_PRODUCT_SKU"
  | "DISPLAY_ONLY_PLACEHOLDER"
  | "ACTIVE_WORKFLOW_REVIEW_REQUIRED";

export interface ImportIssue {
  code: ImportIssueCode | string;
  severity: ImportSeverity;
  sheet: string;
  rowNumber?: number;
  message: string;
  sku?: string;
  serialNumber?: string;
  location?: string;
  classification: "LEGACY_TRACEABILITY_GAP" | "CURRENT_OPERATIONAL_ERROR" | "DATA_QUALITY";
}

export type WorkbookCellValue = string | number | boolean | Date | null;

export interface RawWorkbookSheet {
  name: string;
  rows: WorkbookCellValue[][];
}

export interface RawWorkbook {
  sourceFileName: string;
  sourceChecksum: string;
  sheets: RawWorkbookSheet[];
}

export interface SemanticMappedRow {
  sheet: string;
  rowNumber: number;
  values: Record<string, WorkbookCellValue>;
}

export interface WorkbookLedgerRow {
  rowNumber: number;
  date?: Date;
  outboundAt?: Date;
  action: string;
  shadowStatus?: "Pending_Allocation" | "Prepared" | "Outbound" | "Reference";
  shNo?: string;
  pickupCode?: string;
  container?: string;
  sku?: string;
  model?: string;
  itemType: ItemType;
  serialNumber?: string;
  quantity: number;
  fromLocation?: string;
  toLocation?: string;
  erpWarehouse?: string;
  condition: StockCondition;
  reason?: string;
  remark?: string;
}

export interface WorkbookProductRow {
  rowNumber: number;
  sku: string;
  model: string;
  itemType: ItemType;
  category?: string;
  active: boolean;
  reportMachine: boolean;
  reportGroup?: string;
}

export interface WorkbookLocationRow {
  rowNumber: number;
  code: string;
  warehouse: string;
  zone?: string;
  rack?: string;
  row?: string;
  bay?: string;
  side?: string;
  serviceZone: boolean;
}

export interface ShadowBalanceRow {
  warehouse: string;
  location: string;
  container?: string;
  sku?: string;
  itemType: ItemType;
  condition: StockCondition;
  physicalQty: number;
  frozenQty: number;
  legacySerialGap?: boolean;
  source: "WORKBOOK_VIEW" | "WORKBOOK_LEDGER" | "WMS";
}

export interface ShadowSerialRow {
  serialNumber: string;
  sku: string;
  warehouse: string;
  location: string;
  condition: StockCondition;
  status: SerialStatus;
  legacyIncomplete?: boolean;
}

export interface WmsShadowReference {
  products: Array<{
    sku: string;
    model: string;
    itemType: ItemType;
    reportMachine: boolean;
    reportGroup?: string;
  }>;
  locations: Array<{
    code: string;
    warehouse: string;
    zone?: string;
    serviceZone: boolean;
  }>;
  balances: ShadowBalanceRow[];
  serials: ShadowSerialRow[];
}

export interface ShadowOutboundOrder {
  shNo: string;
  pickupCode?: string;
  status: "Pending_Allocation" | "Prepared" | "Outbound" | "Review_Required";
  outboundAt?: Date;
  lines: Array<{
    sku?: string;
    model?: string;
    quantity: number;
    erpWarehouse?: string;
    sourceLocation?: string;
    serialNumbers: string[];
  }>;
}

export interface ShadowPickupBatch {
  pickupCode: string;
  shNos: string[];
  labelGroups: Array<{
    sku?: string;
    model?: string;
    erpWarehouse?: string;
    quantity: number;
  }>;
}

export interface ShadowRepairItem {
  serialNumber: string;
  sku?: string;
  condition: StockCondition;
  status: "Repair" | "Scrapped" | "Legacy_Repair_Good";
  location?: string;
  createRepairJob: boolean;
  classification: "CURRENT_OPERATIONAL_ERROR" | "LEGACY_TRACEABILITY_GAP";
}

export interface ReconciliationReportRow {
  timestamp: string;
  warehouse?: string;
  discrepancyType: string;
  severity: ImportSeverity;
  source: "WORKBOOK_VIEW" | "WORKBOOK_LEDGER" | "WMS" | "MASTER_DATA" | "WORKFLOW";
  sku?: string;
  model?: string;
  workbookQty?: number;
  wmsQty?: number;
  workbookLocation?: string;
  wmsLocation?: string;
  workbookCondition?: string;
  wmsCondition?: string;
  serialNumber?: string;
  classification: "MATCH" | "LEGACY_TRACEABILITY_GAP" | "CURRENT_OPERATIONAL_ERROR" | "DATA_QUALITY";
  comment: string;
}

export interface ShadowImportResult {
  mode: ShadowImportMode;
  batchKey: string;
  sourceFileName: string;
  sourceChecksum: string;
  cutoverAt: string;
  workbookRows: number;
  acceptedRows: number;
  warningRows: number;
  rejectedRows: number;
  ledgerRows: WorkbookLedgerRow[];
  productRows: WorkbookProductRow[];
  locationRows: WorkbookLocationRow[];
  workbookViewBalances: ShadowBalanceRow[];
  ledgerProjectedBalances: ShadowBalanceRow[];
  workbookSerials: ShadowSerialRow[];
  activeOutboundOrders: ShadowOutboundOrder[];
  pickupBatches: ShadowPickupBatch[];
  repairItems: ShadowRepairItem[];
  issues: ImportIssue[];
  reconciliation: ReconciliationReportRow[];
  summary: {
    matches: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}
