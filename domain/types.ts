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
  | "Transfer_In";
export type OrderStatus =
  | "Draft"
  | "Ready"
  | "Prepared"
  | "Partially_Prepared"
  | "Ready_for_Pickup"
  | "Outbound"
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
  allocatedQty: number;
  preparedQty: number;
  dispatchedQty: number;
  allocationLocation?: string;
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
}

export interface StockTransaction {
  id: string;
  at: string;
  type: TransactionType;
  warehouseCode: WarehouseCode;
  sku?: string;
  model?: string;
  serialNumber?: string;
  qty: number;
  condition: StockCondition;
  fromLocation?: string;
  toLocation?: string;
  businessReference?: string;
  remark: string;
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
  transactions: StockTransaction[];
  audit: AuditEntry[];
  exceptions: WmsException[];
  pickupSequence: Record<WarehouseCode, number>;
  faultyReceivedCount: number;
}
