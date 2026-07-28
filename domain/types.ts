export type WarehouseCode = "SYD" | "MEL" | "BNE";
export type ItemType = "Product" | "Material";
export type StockCondition = "New" | "Repair_Good" | "Repair" | "Scrap" | "Material";
export type SerialStatus = "In_Stock" | "Prepared" | "Outbound" | "In_Transit" | "Repair" | "Scrapped";
export type TransactionType =
  | "Opening"
  | "Inbound"
  | "Outbound"
  | "Prepared"
  | "Move"
  | "Adjustment_In"
  | "Adjustment_Out"
  | "Return_to_Repair"
  | "Transfer_Out"
  | "Transfer_In"
  | "Repair_Completed"
  | "RepairGood_Adjustment_In";
export type OrderStatus =
  | "Draft"
  | "Ready"
  | "Imported"
  | "Pending_Allocation"
  | "Allocated"
  | "Prepared"
  | "Partially_Prepared"
  | "Ready_for_Pickup"
  | "Outbound"
  | "ERP_Synced"
  | "Cancelled"
  | "Exception";

export interface Warehouse {
  id: string;
  code: WarehouseCode;
  name: string;
  timezone: string;
  active: boolean;
}

export interface Location {
  id: string;
  warehouseCode: WarehouseCode;
  code: string;
  zone: string;
  serviceZone: boolean;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  model: string;
  itemType: ItemType;
  category: string;
  serialTrackingRequired: boolean;
  reportMachine?: boolean;
  reportGroup?: string;
  active: boolean;
}

export interface InventoryBalance {
  id: string;
  warehouseCode: WarehouseCode;
  locationCode: string;
  containerCode?: string;
  sku?: string;
  model: string;
  itemType: ItemType;
  condition: StockCondition;
  physicalQty: number;
  frozenQty: number;
  inTransitQty: number;
  availableQty: number;
}

export interface SerialNumber {
  id: string;
  serialNumber: string;
  sku: string;
  model: string;
  warehouseCode?: WarehouseCode;
  locationCode?: string;
  condition: StockCondition;
  status: SerialStatus;
  relatedShNo?: string;
  relatedTransferNo?: string;
}

export interface OutboundLine {
  id: string;
  sku: string;
  model: string;
  requiredQty: number;
  requiredCondition: StockCondition;
  erpWarehouse?: string;
  allocatedQty: number;
  preparedQty: number;
  dispatchedQty: number;
  allocationLocation?: string;
  allocations: Array<{
    id: string;
    locationCode: string;
    containerCode?: string;
    quantity: number;
    serialNumber?: string;
    allocatedAt?: string;
    preparedAt?: string;
    dispatchedAt?: string;
  }>;
  scannedSerials: string[];
}

export interface OutboundOrder {
  id: string;
  shNo: string;
  pickupCode?: string;
  erpWarehouse: string;
  warehouseCode: WarehouseCode;
  status: OrderStatus;
  createdAt: string;
  importedAt?: string;
  allocatedAt?: string;
  preparedAt?: string;
  readyForPickupAt?: string;
  outboundAt?: string;
  customerLabel?: string;
  lines: OutboundLine[];
  erpSyncStatus: "Pending" | "Synced" | "Failed" | "Retrying" | "Manual_Review";
}

export interface TransferOrder {
  id: string;
  transferNo: string;
  sourceWarehouse: WarehouseCode;
  destinationWarehouse: WarehouseCode;
  status: "Draft" | "Prepared" | "In_Transit" | "Partially_Received" | "Received" | "Exception";
  sku: string;
  model: string;
  qty: number;
  serials: string[];
  sourceLocation: string;
  destinationLocation?: string;
  createdAt?: string;
  preparedAt?: string;
  dispatchedAt?: string;
  receivedAt?: string;
}

export interface StockTransaction {
  id: string;
  at: string;
  recordedAt?: string;
  effectiveAt?: string;
  type: TransactionType;
  warehouseCode: WarehouseCode;
  sku?: string;
  model?: string;
  serialNumber?: string;
  qty: number;
  condition: StockCondition;
  sourceCondition?: StockCondition;
  targetCondition?: StockCondition;
  repairOutcome?: "Repair_Good" | "Scrap" | "Returned_Unrepaired";
  fromLocation?: string;
  toLocation?: string;
  businessReference?: string;
  remark: string;
}

export interface RepairJob {
  id: string;
  serialNumber?: string;
  sku: string;
  model: string;
  warehouseCode: WarehouseCode;
  currentLocation: string;
  originalShNo?: string;
  status:
    | "Received"
    | "Pending_Repair"
    | "In_Repair"
    | "Repair_Completed"
    | "Repair_Good"
    | "Scrap_Pending"
    | "Scrapped";
  outcome?: "Repair_Good" | "Scrap" | "Returned_Unrepaired";
  source: "Native_Return" | "Legacy_Manual";
  receivedAt: string;
  repairStartedAt?: string;
  repairCompletedAt?: string;
  returnedToStockAt?: string;
  remark: string;
}

export interface PickupLabelLine {
  sku: string;
  model: string;
  erpWarehouse: string;
  qty: number;
}

export interface PickupBatch {
  id: string;
  code: string;
  labelType: "Batch_Label" | "Unit_SN_Label";
  status?: "Draft" | "Ready" | "Picked_Up" | "Cancelled";
  shNos: string[];
  lines: PickupLabelLine[];
  readyAt?: string;
  pickedUpAt?: string;
  carrier?: string;
  customer?: string;
  collector?: string;
  remark?: string;
}

export interface DashboardTasks {
  needsAllocation: number;
  allocated: number;
  prepared: number;
  readyForPickup: number;
  outboundToday: number;
  faultyReturns: number;
  repairQueue: number;
  repairCompletedAwaitingPutaway: number;
  transfersInTransit: number;
  reconciliationIssues: number;
  erpSyncFailures: number;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  operation: string;
  entityType: string;
  entityId: string;
  businessReference?: string;
  remark: string;
}

export interface WmsException {
  id: string;
  type: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  entityReference: string;
  message: string;
  status: "Open" | "Investigating" | "Resolved";
  createdAt: string;
}

export interface WmsState {
  warehouses: Warehouse[];
  locations: Location[];
  products: Product[];
  inventory: InventoryBalance[];
  serials: SerialNumber[];
  outboundOrders: OutboundOrder[];
  transfers: TransferOrder[];
  repairJobs?: RepairJob[];
  pickupBatches?: PickupBatch[];
  dashboardTasks?: DashboardTasks;
  transactions: StockTransaction[];
  audit: AuditEntry[];
  exceptions: WmsException[];
  pickupSequence: Record<WarehouseCode, number>;
  faultyReceivedCount: number;
}

export type WmsCommand =
  | { type: "importOutbound"; shNo: string }
  | { type: "allocateOutbound"; orderId: string; lineId: string; locationCode: string; qty: number; containerCode?: string }
  | { type: "prepareOutbound"; orderId: string; lineId: string; allocationIds?: string[] }
  | { type: "scanOutboundSerial"; orderId: string; lineId: string; serialNumber: string }
  | { type: "dispatchOutbound"; orderId: string }
  | { type: "registerSerial"; serialNumber: string; sku: string; warehouseCode: WarehouseCode; locationCode: string; condition: StockCondition }
  | { type: "adjustStock"; direction: "In" | "Out"; warehouseCode: WarehouseCode; locationCode: string; sku?: string; itemType: ItemType; condition: StockCondition; qty: number; reason: string; remark: string; serialNumber?: string }
  | { type: "receiveFaulty"; serialNumber: string }
  | { type: "startRepair"; repairJobId: string; remark: string }
  | { type: "completeRepair"; repairJobId: string; targetLocationCode: string; outcome: "Repair_Good" | "Scrap" | "Returned_Unrepaired"; remark: string }
  | { type: "legacyRepairGoodIn"; warehouseCode: WarehouseCode; locationCode: string; sku: string; qty: number; reason: string; remark: string; serialNumber?: string }
  | { type: "moveStock"; warehouseCode: WarehouseCode; sku: string; condition: StockCondition; fromLocation: string; toLocation: string; qty: number; remark: string; serialNumbers?: string[] }
  | { type: "dispatchTransfer"; transferId: string }
  | { type: "receiveTransfer"; transferId: string; destinationLocation: string }
  | { type: "resetDemo" };
