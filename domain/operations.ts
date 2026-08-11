import { DomainError } from "./errors";
import {
  assertSerialRegistrationCapacity,
  isPhysicallyPresentSerialStatus,
  registeredSerialStatusForCondition,
} from "./serial-policy";
import type {
  InventoryBalance,
  StockCondition,
  WarehouseCode,
  WmsState,
} from "./types";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const copy = (state: WmsState): WmsState => structuredClone(state);

function refresh(balance: InventoryBalance) {
  balance.availableQty = balance.physicalQty - balance.frozenQty;
  if (balance.frozenQty < 0) throw new DomainError("Frozen inventory cannot be negative.");
}

function inventoryLine(
  state: WmsState,
  warehouseCode: WarehouseCode,
  locationCode: string,
  sku: string | undefined,
  condition: StockCondition,
) {
  return state.inventory.find(
    (row) =>
      row.warehouseCode === warehouseCode &&
      row.locationCode === locationCode &&
      row.sku === sku &&
      row.condition === condition,
  );
}

function requireLocation(state: WmsState, warehouseCode: WarehouseCode, locationCode: string) {
  const location = state.locations.find(
    (row) => row.warehouseCode === warehouseCode && row.code === locationCode && row.active,
  );
  if (!location) throw new DomainError("Invalid location for the selected warehouse.");
  return location;
}

function addAudit(
  state: WmsState,
  operation: string,
  entityType: string,
  entityId: string,
  businessReference: string | undefined,
  remark: string,
) {
  state.audit.unshift({
    id: id("audit"),
    at: now(),
    actor: "Demo Supervisor",
    operation,
    entityType,
    entityId,
    businessReference,
    remark,
  });
}

export function generatePickupCode(state: WmsState, warehouseCode: WarehouseCode) {
  const next = (state.pickupSequence[warehouseCode] ?? 0) + 1;
  state.pickupSequence[warehouseCode] = next;
  return `${warehouseCode}-${String(next).padStart(5, "0")}`;
}

export function prepareOutbound(
  source: WmsState,
  orderId: string,
  lineId: string,
  locationCode: string,
  qty: number,
) {
  const state = copy(source);
  const order = state.outboundOrders.find((row) => row.id === orderId);
  const line = order?.lines.find((row) => row.id === lineId);
  if (!order || !line) throw new DomainError("Outbound order line not found.");
  if (!Number.isInteger(qty) || qty <= 0) throw new DomainError("Prepared quantity must be positive.");
  requireLocation(state, order.warehouseCode, locationCode);
  const balance = inventoryLine(
    state,
    order.warehouseCode,
    locationCode,
    line.sku,
    line.requiredCondition,
  );
  if (!balance || balance.availableQty < qty) throw new DomainError("Insufficient available stock.");
  if (line.preparedQty + qty > line.requiredQty)
    throw new DomainError("Prepared quantity exceeds the requested quantity.");

  balance.frozenQty += qty;
  refresh(balance);
  line.allocatedQty += qty;
  line.preparedQty += qty;
  line.allocationLocation = locationCode;
  order.pickupCode ||= generatePickupCode(state, order.warehouseCode);
  order.status =
    order.lines.every((item) => item.preparedQty === item.requiredQty)
      ? "Ready_for_Pickup"
      : "Partially_Prepared";

  state.transactions.unshift({
    id: id("txn"),
    at: now(),
    type: "Prepared",
    warehouseCode: order.warehouseCode,
    sku: line.sku,
    model: line.model,
    qty,
    condition: line.requiredCondition,
    fromLocation: locationCode,
    businessReference: order.shNo,
    remark: "Prepared reservation; physical quantity unchanged.",
  });
  addAudit(state, "Prepared outbound SH", "OutboundOrder", order.id, order.shNo, `Reserved ${qty} at ${locationCode}.`);
  return state;
}

export function scanOutboundSerial(
  source: WmsState,
  orderId: string,
  lineId: string,
  serialNumber: string,
) {
  const state = copy(source);
  const order = state.outboundOrders.find((row) => row.id === orderId);
  const line = order?.lines.find((row) => row.id === lineId);
  if (!order || !line) throw new DomainError("Outbound order line not found.");
  const product = state.products.find((row) => row.sku === line.sku);
  if (!product?.serialTrackingRequired) throw new DomainError("This product does not require serial scanning.");
  if (line.scannedSerials.includes(serialNumber)) throw new DomainError("Serial number already scanned.");
  if (line.scannedSerials.length >= line.preparedQty) throw new DomainError("All prepared units already have serial numbers.");
  const serial = state.serials.find((row) => row.serialNumber === serialNumber);
  if (!serial || serial.sku !== line.sku) throw new DomainError("Serial number does not match the requested SKU.");
  if (serial.status !== "In_Stock") throw new DomainError("Serial number is allocated to another order.");
  if (serial.locationCode !== line.allocationLocation) throw new DomainError("Serial number is not in the allocated location.");
  serial.status = "Prepared";
  serial.relatedShNo = order.shNo;
  line.scannedSerials.push(serialNumber);
  addAudit(state, "Scanned outbound SN", "SerialNumber", serial.id, order.shNo, serialNumber);
  return state;
}

export function dispatchOutbound(source: WmsState, orderId: string) {
  const state = copy(source);
  const order = state.outboundOrders.find((row) => row.id === orderId);
  if (!order) throw new DomainError("Outbound order not found.");
  for (const line of order.lines) {
    if (!line.allocationLocation || line.preparedQty !== line.requiredQty)
      throw new DomainError("All requested stock must be prepared before dispatch.");
    const product = state.products.find((row) => row.sku === line.sku);
    if (product?.serialTrackingRequired && line.scannedSerials.length !== line.requiredQty)
      throw new DomainError("Product outbound must have all required serial numbers.");
    const balance = inventoryLine(
      state,
      order.warehouseCode,
      line.allocationLocation,
      line.sku,
      line.requiredCondition,
    );
    if (!balance || balance.physicalQty < line.requiredQty || balance.frozenQty < line.requiredQty)
      throw new DomainError("Prepared inventory is no longer available.");
    balance.physicalQty -= line.requiredQty;
    balance.frozenQty -= line.requiredQty;
    refresh(balance);
    line.dispatchedQty = line.requiredQty;
    for (const serialNumber of line.scannedSerials) {
      const serial = state.serials.find((row) => row.serialNumber === serialNumber);
      if (!serial || serial.status !== "Prepared") throw new DomainError("Serial allocation is invalid.");
      serial.status = "Outbound";
      serial.locationCode = undefined;
      serial.relatedShNo = order.shNo;
    }
    state.transactions.unshift({
      id: id("txn"),
      at: now(),
      type: "Outbound",
      warehouseCode: order.warehouseCode,
      sku: line.sku,
      model: line.model,
      qty: line.requiredQty,
      condition: line.requiredCondition,
      fromLocation: line.allocationLocation,
      businessReference: order.shNo,
      remark: "Confirmed physical dispatch; ERP write-back queued.",
    });
  }
  order.status = "Outbound";
  order.erpSyncStatus = "Pending";
  addAudit(state, "Confirmed outbound", "OutboundOrder", order.id, order.shNo, "Physical dispatch recorded.");
  return state;
}

export function moveStock(
  source: WmsState,
  input: {
    warehouseCode: WarehouseCode;
    sku: string;
    condition: StockCondition;
    fromLocation: string;
    toLocation: string;
    qty: number;
    remark: string;
  },
) {
  const state = copy(source);
  if (input.fromLocation === input.toLocation) throw new DomainError("Source and destination must be different.");
  if (!Number.isFinite(input.qty) || input.qty <= 0) throw new DomainError("Move quantity must be positive.");
  requireLocation(state, input.warehouseCode, input.fromLocation);
  requireLocation(state, input.warehouseCode, input.toLocation);
  const sourceLine = inventoryLine(state, input.warehouseCode, input.fromLocation, input.sku, input.condition);
  if (!sourceLine || sourceLine.availableQty < input.qty)
    throw new DomainError("Source location does not have enough inventory.");
  let destination = inventoryLine(state, input.warehouseCode, input.toLocation, input.sku, input.condition);
  if (!destination) {
    const product = state.products.find((row) => row.sku === input.sku);
    if (!product) throw new DomainError("Unknown SKU.");
    destination = {
      id: id("bal"),
      warehouseCode: input.warehouseCode,
      locationCode: input.toLocation,
      sku: input.sku,
      model: product.model,
      itemType: product.itemType,
      condition: input.condition,
      physicalQty: 0,
      frozenQty: 0,
      inTransitQty: 0,
      availableQty: 0,
    };
    state.inventory.push(destination);
  }
  sourceLine.physicalQty -= input.qty;
  destination.physicalQty += input.qty;
  refresh(sourceLine);
  refresh(destination);
  const txnId = id("move");
  state.transactions.unshift({
    id: txnId,
    at: now(),
    type: "Move",
    warehouseCode: input.warehouseCode,
    sku: input.sku,
    model: sourceLine.model,
    qty: input.qty,
    condition: input.condition,
    fromLocation: input.fromLocation,
    toLocation: input.toLocation,
    remark: input.remark,
  });
  addAudit(state, "Moved inventory", "StockTransaction", txnId, undefined, input.remark);
  return state;
}

export function adjustStock(
  source: WmsState,
  input: {
    direction: "In" | "Out";
    warehouseCode: WarehouseCode;
    locationCode: string;
    sku?: string;
    itemType: "Product" | "Material";
    condition: StockCondition;
    qty: number;
    reason: string;
    remark: string;
  },
) {
  const state = copy(source);
  if (input.itemType === "Product" && !input.sku) throw new DomainError("SKU is required for Product inventory.");
  if (!input.sku && input.itemType === "Material" && input.reason !== "Unmonitored material")
    throw new DomainError("No-SKU material requires the reason “Unmonitored material”.");
  if (!Number.isFinite(input.qty) || input.qty <= 0) throw new DomainError("Adjustment quantity must be positive.");
  requireLocation(state, input.warehouseCode, input.locationCode);
  const product = state.products.find((row) => row.sku === input.sku);
  let balance = inventoryLine(state, input.warehouseCode, input.locationCode, input.sku, input.condition);
  if (!balance) {
    balance = {
      id: id("bal"),
      warehouseCode: input.warehouseCode,
      locationCode: input.locationCode,
      sku: input.sku,
      model: product?.model ?? "Unmonitored material",
      itemType: input.itemType,
      condition: input.condition,
      physicalQty: 0,
      frozenQty: 0,
      inTransitQty: 0,
      availableQty: 0,
    };
    state.inventory.push(balance);
  }
  if (input.direction === "Out" && balance.availableQty < input.qty)
    throw new DomainError("Adjustment Out exceeds available inventory.");
  balance.physicalQty += input.direction === "In" ? input.qty : -input.qty;
  refresh(balance);
  const txnId = id("adjustment");
  state.transactions.unshift({
    id: txnId,
    at: now(),
    type: input.direction === "In" ? "Adjustment_In" : "Adjustment_Out",
    warehouseCode: input.warehouseCode,
    sku: input.sku,
    model: balance.model,
    qty: input.qty,
    condition: input.condition,
    ...(input.direction === "In"
      ? { toLocation: input.locationCode }
      : { fromLocation: input.locationCode }),
    remark: `${input.reason}: ${input.remark}`,
  });
  addAudit(state, `Adjustment ${input.direction}`, "StockTransaction", txnId, undefined, input.reason);
  return state;
}

export function receiveFaulty(
  source: WmsState,
  erpRecord: { serialNumber: string; relatedShNo: string; sku: string; model: string },
) {
  const state = copy(source);
  const existing = state.serials.find((row) => row.serialNumber === erpRecord.serialNumber);
  if (existing?.status === "Repair")
    throw new DomainError("This serial number has already been received into repair inventory.");
  if (existing && existing.status !== "Outbound")
    throw new DomainError("Serial number already exists in active inventory.");
  const locationCode = "REPAIR-01";
  requireLocation(state, "SYD", locationCode);
  let balance = inventoryLine(state, "SYD", locationCode, erpRecord.sku, "Repair");
  if (!balance) {
    balance = {
      id: id("bal"),
      warehouseCode: "SYD",
      locationCode,
      sku: erpRecord.sku,
      model: erpRecord.model,
      itemType: "Product",
      condition: "Repair",
      physicalQty: 0,
      frozenQty: 0,
      inTransitQty: 0,
      availableQty: 0,
    };
    state.inventory.push(balance);
  }
  balance.physicalQty += 1;
  refresh(balance);
  if (existing) {
    existing.status = "Repair";
    existing.condition = "Repair";
    existing.warehouseCode = "SYD";
    existing.locationCode = locationCode;
    existing.relatedShNo = erpRecord.relatedShNo;
  } else {
    state.serials.push({
      id: id("sn"),
      serialNumber: erpRecord.serialNumber,
      sku: erpRecord.sku,
      model: erpRecord.model,
      warehouseCode: "SYD",
      locationCode,
      condition: "Repair",
      status: "Repair",
      relatedShNo: erpRecord.relatedShNo,
    });
  }
  const txnId = id("return");
  state.transactions.unshift({
    id: txnId,
    at: now(),
    type: "Return_to_Repair",
    warehouseCode: "SYD",
    sku: erpRecord.sku,
    model: erpRecord.model,
    serialNumber: erpRecord.serialNumber,
    qty: 1,
    condition: "Repair",
    toLocation: locationCode,
    businessReference: erpRecord.relatedShNo,
    remark: "Faulty unit received from Mock ERP lookup.",
  });
  state.faultyReceivedCount += 1;
  addAudit(state, "Received faulty SN", "RepairReturn", txnId, erpRecord.relatedShNo, erpRecord.serialNumber);
  return state;
}

export function dispatchTransfer(source: WmsState, transferId: string) {
  const state = copy(source);
  const transfer = state.transfers.find((row) => row.id === transferId);
  if (!transfer) throw new DomainError("Transfer order not found.");
  if (transfer.sourceWarehouse === transfer.destinationWarehouse)
    throw new DomainError("Cross-warehouse Transfer requires different warehouses.");
  const balance = state.inventory.find(
    (row) =>
      row.warehouseCode === transfer.sourceWarehouse &&
      row.locationCode === transfer.sourceLocation &&
      row.sku === transfer.sku &&
      row.condition === "New",
  );
  if (!balance || balance.availableQty < transfer.qty) throw new DomainError("Insufficient stock for Transfer Out.");
  if (transfer.serials.length !== transfer.qty) throw new DomainError("All transfer serial numbers are required.");
  balance.physicalQty -= transfer.qty;
  balance.inTransitQty += transfer.qty;
  refresh(balance);
  for (const sn of transfer.serials) {
    const serial = state.serials.find((row) => row.serialNumber === sn);
    if (!serial || serial.status !== "In_Stock") throw new DomainError("Transfer serial is not available.");
    serial.status = "In_Transit";
    serial.locationCode = undefined;
    serial.relatedTransferNo = transfer.transferNo;
  }
  transfer.status = "In_Transit";
  state.transactions.unshift({
    id: id("txn"),
    at: now(),
    type: "Transfer_Out",
    warehouseCode: transfer.sourceWarehouse,
    sku: transfer.sku,
    model: transfer.model,
    qty: transfer.qty,
    condition: "New",
    fromLocation: transfer.sourceLocation,
    businessReference: transfer.transferNo,
    remark: `In transit to ${transfer.destinationWarehouse}.`,
  });
  addAudit(state, "Dispatched transfer", "TransferOrder", transfer.id, transfer.transferNo, "Serials now In_Transit.");
  return state;
}

export function receiveTransfer(source: WmsState, transferId: string, destinationLocation: string) {
  const state = copy(source);
  const transfer = state.transfers.find((row) => row.id === transferId);
  if (!transfer || transfer.status !== "In_Transit") throw new DomainError("Transfer is not ready to receive.");
  requireLocation(state, transfer.destinationWarehouse, destinationLocation);
  const sourceBalance = state.inventory.find(
    (row) =>
      row.warehouseCode === transfer.sourceWarehouse &&
      row.locationCode === transfer.sourceLocation &&
      row.sku === transfer.sku &&
      row.condition === "New",
  );
  if (!sourceBalance || sourceBalance.inTransitQty < transfer.qty)
    throw new DomainError("In-transit balance is inconsistent.");
  sourceBalance.inTransitQty -= transfer.qty;
  let destination = inventoryLine(
    state,
    transfer.destinationWarehouse,
    destinationLocation,
    transfer.sku,
    "New",
  );
  if (!destination) {
    destination = {
      id: id("bal"),
      warehouseCode: transfer.destinationWarehouse,
      locationCode: destinationLocation,
      sku: transfer.sku,
      model: transfer.model,
      itemType: "Product",
      condition: "New",
      physicalQty: 0,
      frozenQty: 0,
      inTransitQty: 0,
      availableQty: 0,
    };
    state.inventory.push(destination);
  }
  destination.physicalQty += transfer.qty;
  refresh(destination);
  for (const sn of transfer.serials) {
    const serial = state.serials.find((row) => row.serialNumber === sn);
    if (!serial || serial.status !== "In_Transit") throw new DomainError("Transfer serial status is inconsistent.");
    serial.status = "In_Stock";
    serial.warehouseCode = transfer.destinationWarehouse;
    serial.locationCode = destinationLocation;
  }
  transfer.destinationLocation = destinationLocation;
  transfer.status = "Received";
  state.transactions.unshift({
    id: id("txn"),
    at: now(),
    type: "Transfer_In",
    warehouseCode: transfer.destinationWarehouse,
    sku: transfer.sku,
    model: transfer.model,
    qty: transfer.qty,
    condition: "New",
    toLocation: destinationLocation,
    businessReference: transfer.transferNo,
    remark: `Received from ${transfer.sourceWarehouse}.`,
  });
  addAudit(state, "Received transfer", "TransferOrder", transfer.id, transfer.transferNo, destinationLocation);
  return state;
}

export function registerSerial(
  source: WmsState,
  input: {
    serialNumber: string;
    sku: string;
    warehouseCode: WarehouseCode;
    locationCode: string;
    condition?: StockCondition;
  },
) {
  const state = copy(source);
  const normalized = input.serialNumber.trim().toUpperCase();
  if (state.serials.some((row) => row.serialNumber.trim().toUpperCase() === normalized))
    throw new DomainError("Serial number already exists.", "DUPLICATE_SERIAL_NUMBER");
  const product = state.products.find((row) => row.sku === input.sku);
  if (!product) throw new DomainError("Unknown SKU.");
  requireLocation(state, input.warehouseCode, input.locationCode);
  const condition = input.condition ?? "New";
  const physicalQty = state.inventory
    .filter(
      (row) =>
        row.sku === input.sku &&
        row.warehouseCode === input.warehouseCode &&
        row.locationCode === input.locationCode &&
        row.condition === condition,
    )
    .reduce((sum, row) => sum + row.physicalQty, 0);
  const activePhysicalSerialCount = state.serials.filter(
    (row) =>
      row.sku === input.sku &&
      row.warehouseCode === input.warehouseCode &&
      row.locationCode === input.locationCode &&
      row.condition === condition &&
      isPhysicallyPresentSerialStatus(row.status),
  ).length;
  assertSerialRegistrationCapacity({
    serialTrackingRequired: product.serialTrackingRequired,
    physicalQty,
    activePhysicalSerialCount,
  });
  const registeredStatus = registeredSerialStatusForCondition(condition);
  state.serials.push({
    id: id("sn"),
    serialNumber: normalized,
    sku: input.sku,
    model: product.model,
    warehouseCode: input.warehouseCode,
    locationCode: input.locationCode,
    condition,
    status: registeredStatus,
  });
  return state;
}
