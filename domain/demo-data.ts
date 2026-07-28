import type { WmsState } from "./types";

const locations = [
  ["SYD", "FLEX-01", "FLEX", true],
  ["SYD", "REPAIR-01", "REPAIR", true],
  ["SYD", "DISPATCH-01", "DISPATCH", true],
  ["SYD", "RETURN-01", "RETURN", true],
  ["SYD", "R1-4-2-L", "R1", false],
  ["SYD", "R1-4-2-R", "R1", false],
  ["SYD", "R1-3-2-L", "R1", false],
  ["SYD", "R1-3-2-R", "R1", false],
  ["SYD", "R2-1-4-R", "R2", false],
  ["SYD", "R2-3-5-L", "R2", false],
  ["SYD", "R1-4-3-L", "R1", false],
  ["MEL", "RECEIVING-01", "RECEIVING", true],
  ["MEL", "M1-1-1-L", "M1", false],
  ["BNE", "RECEIVING-01", "RECEIVING", true],
] as const;

export const demoState: WmsState = {
  warehouses: [
    { id: "wh-syd", code: "SYD", name: "Sydney Service Warehouse", timezone: "Australia/Sydney", active: true },
    { id: "wh-mel", code: "MEL", name: "Melbourne Warehouse", timezone: "Australia/Melbourne", active: true },
    { id: "wh-bne", code: "BNE", name: "Brisbane Warehouse", timezone: "Australia/Brisbane", active: true },
  ],
  locations: locations.map(([warehouseCode, code, zone, serviceZone], index) => ({
    id: `loc-${index + 1}`,
    warehouseCode,
    code,
    zone,
    serviceZone,
    active: true,
  })),
  products: [
    { id: "p1", sku: "97-223-00107-00", model: "EQ4800-S", itemType: "Product", category: "Battery", serialTrackingRequired: true, active: true },
    { id: "p2", sku: "97-223-00108-00", model: "EQ4800-M", itemType: "Product", category: "Battery", serialTrackingRequired: true, active: true },
    { id: "p3", sku: "97-229-00020-00", model: "CQ6-M", itemType: "Product", category: "Battery", serialTrackingRequired: true, active: true },
    { id: "p4", sku: "97-229-00018-00", model: "CQ6-S", itemType: "Product", category: "Battery", serialTrackingRequired: true, active: true },
    { id: "p5", sku: "97-229-00012-00", model: "CQ6-M", itemType: "Product", category: "Battery", serialTrackingRequired: true, active: true },
    { id: "m1", sku: "10-105-00346-00", model: "Battery service cable", itemType: "Material", category: "Cable/Connector", serialTrackingRequired: false, active: true },
    { id: "m2", sku: "20-012-10219-08", model: "PCBA H1-G2 3–6kW power board", itemType: "Material", category: "PCBA", serialTrackingRequired: false, active: true },
    { id: "m3", sku: "97-406-00017-00", model: "KH cable cover", itemType: "Material", category: "Inverter", serialTrackingRequired: false, active: true },
  ],
  inventory: [
    { id: "bal-1", warehouseCode: "SYD", locationCode: "FLEX-01", sku: "97-223-00107-00", model: "EQ4800-S", itemType: "Product", condition: "New", physicalQty: 32, frozenQty: 2, inTransitQty: 0, availableQty: 30 },
    { id: "bal-2", warehouseCode: "SYD", locationCode: "FLEX-01", sku: "97-229-00012-00", model: "CQ6-M", itemType: "Product", condition: "Repair_Good", physicalQty: 6, frozenQty: 0, inTransitQty: 0, availableQty: 6 },
    { id: "bal-3", warehouseCode: "SYD", locationCode: "R1-4-2-L", sku: "10-105-00346-00", model: "Battery service cable", itemType: "Material", condition: "Material", physicalQty: 200, frozenQty: 0, inTransitQty: 0, availableQty: 200 },
    { id: "bal-4", warehouseCode: "SYD", locationCode: "R1-4-3-L", sku: "20-012-10219-08", model: "PCBA H1-G2 3–6kW power board", itemType: "Material", condition: "Material", physicalQty: 75, frozenQty: 0, inTransitQty: 0, availableQty: 75 },
    { id: "bal-5", warehouseCode: "SYD", locationCode: "REPAIR-01", sku: "97-223-00108-00", model: "EQ4800-M", itemType: "Product", condition: "Repair", physicalQty: 3, frozenQty: 0, inTransitQty: 0, availableQty: 3 },
    { id: "bal-6", warehouseCode: "SYD", locationCode: "R2-1-4-R", containerCode: "Mix003", sku: "97-406-00017-00", model: "KH cable cover", itemType: "Material", condition: "Material", physicalQty: 72, frozenQty: 0, inTransitQty: 0, availableQty: 72 },
  ],
  serials: [
    { id: "sn-1", serialNumber: "EQ48S260700001", sku: "97-223-00107-00", model: "EQ4800-S", warehouseCode: "SYD", locationCode: "FLEX-01", condition: "New", status: "In_Stock" },
    { id: "sn-2", serialNumber: "EQ48S260700002", sku: "97-223-00107-00", model: "EQ4800-S", warehouseCode: "SYD", locationCode: "FLEX-01", condition: "New", status: "In_Stock" },
    { id: "sn-3", serialNumber: "EQ48S260700003", sku: "97-223-00107-00", model: "EQ4800-S", warehouseCode: "SYD", locationCode: "FLEX-01", condition: "New", status: "In_Stock" },
    { id: "sn-4", serialNumber: "60E5M4805C3F242", sku: "97-223-00107-00", model: "EQ4800-S", condition: "New", status: "Outbound", relatedShNo: "SH-2607-00165610" },
    { id: "sn-5", serialNumber: "CQ6M260700091", sku: "97-229-00012-00", model: "CQ6-M", warehouseCode: "SYD", locationCode: "FLEX-01", condition: "Repair_Good", status: "In_Stock" },
  ],
  outboundOrders: [
    {
      id: "out-1",
      shNo: "SH-2607-00175008",
      pickupCode: "SYD-00265",
      erpWarehouse: "悉尼物料仓",
      warehouseCode: "SYD",
      status: "Ready_for_Pickup",
      createdAt: "2026-07-27T08:40:00+10:00",
      customerLabel: "Service replacement",
      erpSyncStatus: "Pending",
      lines: [
        { id: "line-1", sku: "97-223-00107-00", model: "EQ4800-S", requiredQty: 2, requiredCondition: "New", allocatedQty: 2, preparedQty: 2, dispatchedQty: 0, allocationLocation: "FLEX-01", allocations: [], scannedSerials: [] },
      ],
    },
    {
      id: "out-2",
      shNo: "SH-2607-00172594",
      erpWarehouse: "悉尼良品仓",
      warehouseCode: "SYD",
      status: "Ready",
      createdAt: "2026-07-27T09:25:00+10:00",
      customerLabel: "Repair-good replacement",
      erpSyncStatus: "Pending",
      lines: [
        { id: "line-2", sku: "97-229-00012-00", model: "CQ6-M", requiredQty: 1, requiredCondition: "Repair_Good", allocatedQty: 0, preparedQty: 0, dispatchedQty: 0, allocations: [], scannedSerials: [] },
      ],
    },
  ],
  transfers: [
    { id: "tr-1", transferNo: "TR-SYD-MEL-00018", sourceWarehouse: "SYD", destinationWarehouse: "MEL", status: "Draft", sku: "97-223-00107-00", model: "EQ4800-S", qty: 1, serials: ["EQ48S260700003"], sourceLocation: "FLEX-01" },
  ],
  transactions: [
    { id: "txn-prepared", at: "2026-07-27T10:02:00+10:00", type: "Prepared", warehouseCode: "SYD", sku: "97-223-00107-00", model: "EQ4800-S", qty: 2, condition: "New", fromLocation: "FLEX-01", businessReference: "SH-2607-00175008", remark: "Prepared reservation; physical quantity unchanged." },
    { id: "txn-move", at: "2026-07-27T09:15:00+10:00", type: "Move", warehouseCode: "SYD", sku: "10-105-00346-00", model: "Battery service cable", qty: 200, condition: "Material", fromLocation: "FLEX-01", toLocation: "R1-4-2-L", remark: "FLEX-01 move to rack." },
    { id: "txn-return", at: "2026-07-27T08:55:00+10:00", type: "Return_to_Repair", warehouseCode: "SYD", sku: "97-223-00108-00", model: "EQ4800-M", serialNumber: "EQ48M260700044", qty: 1, condition: "Repair", toLocation: "REPAIR-01", businessReference: "SH-2607-00164021", remark: "Faulty unit received." },
  ],
  audit: [
    { id: "audit-1", at: "2026-07-27T10:02:00+10:00", actor: "Demo Supervisor", operation: "Prepared outbound SH", entityType: "OutboundOrder", entityId: "out-1", businessReference: "SH-2607-00175008", remark: "Reserved 2 at FLEX-01." },
    { id: "audit-2", at: "2026-07-27T09:15:00+10:00", actor: "Warehouse Operator", operation: "Moved inventory", entityType: "StockTransaction", entityId: "txn-move", remark: "200 units moved atomically." },
    { id: "audit-3", at: "2026-07-27T08:55:00+10:00", actor: "Warehouse Operator", operation: "Received faulty SN", entityType: "RepairReturn", entityId: "txn-return", businessReference: "SH-2607-00164021", remark: "Received into REPAIR-01." },
  ],
  exceptions: [
    { id: "ex-1", type: "ERP sync failed", severity: "High", entityReference: "SH-2607-00169220", message: "Warehouse operation recorded; ERP write-back requires retry.", status: "Open", createdAt: "2026-07-27T10:14:00+10:00" },
    { id: "ex-2", type: "Stocktake variance", severity: "Medium", entityReference: "ST-SYD-0007", message: "R2-3-5-L count differs from expected by 2.", status: "Investigating", createdAt: "2026-07-27T09:42:00+10:00" },
  ],
  pickupSequence: { SYD: 265, MEL: 0, BNE: 0 },
  faultyReceivedCount: 4,
};
