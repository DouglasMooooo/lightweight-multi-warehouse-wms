import type { PickupLabelLine } from "./types";

export interface PickupOrderInput {
  shNo: string;
  pickupCode: string;
  lines: Array<{ sku: string; model: string; erpWarehouse: string; qty: number }>;
}

export interface PickupLabelOrder {
  shNo: string;
  pickupCode?: string;
  lines: Array<{ sku: string; model: string; erpWarehouse: string; qty: number }>;
}

export interface PickupBatchLabel {
  labelType: "BATCH_LABEL";
  pageCount: 1;
  groupKey: string;
  pickupCode?: string;
  shNos: string[];
  lines: PickupLabelLine[];
  totalQty: number;
}

export interface UnitSNLabel {
  labelType: "UNIT_SN_LABEL";
  pageCount: 1;
  groupKey: string;
  pickupCode?: string;
  shNos: string[];
  serialNumber: string;
  lines: PickupLabelLine[];
  totalQty: 1;
}

export interface BatchLabel {
  labelType: "BATCH_LABEL";
  pageCount: 1;
  pickupCode: string;
  shNos: string[];
  lines: PickupLabelLine[];
}

function aggregateLines(orders: PickupLabelOrder[]) {
  const grouped = new Map<string, PickupLabelLine>();
  for (const order of orders) {
    for (const line of order.lines) {
      const key = JSON.stringify([line.sku, line.model, line.erpWarehouse]);
      const current = grouped.get(key);
      if (current) current.qty += line.qty;
      else grouped.set(key, { ...line });
    }
  }
  return [...grouped.values()].sort((a, b) =>
    `${a.sku}|${a.model}|${a.erpWarehouse}`.localeCompare(`${b.sku}|${b.model}|${b.erpWarehouse}`),
  );
}

export function buildPickupBatchLabels(orders: PickupLabelOrder[]): PickupBatchLabel[] {
  if (!orders.length) throw new Error("Pickup label has no orders.");
  const groups = new Map<string, PickupLabelOrder[]>();
  for (const order of orders) {
    const key = order.pickupCode ? `PICKUP:${order.pickupCode}` : `SH:${order.shNo}`;
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }
  return [...groups.entries()].map(([groupKey, groupedOrders]) => {
    const lines = aggregateLines(groupedOrders);
    return {
      labelType: "BATCH_LABEL",
      pageCount: 1,
      groupKey,
      pickupCode: groupedOrders[0].pickupCode,
      shNos: [...new Set(groupedOrders.map((order) => order.shNo))].sort(),
      lines,
      totalQty: lines.reduce((sum, line) => sum + line.qty, 0),
    };
  });
}

export function buildUnitSNLabels(input: Array<{
  shNo: string;
  pickupCode?: string;
  serialNumber: string;
  sku: string;
  model: string;
  erpWarehouse: string;
}>): UnitSNLabel[] {
  return input.map((row) => ({
    labelType: "UNIT_SN_LABEL",
    pageCount: 1,
    groupKey: `SN:${row.serialNumber}`,
    pickupCode: row.pickupCode,
    shNos: [row.shNo],
    serialNumber: row.serialNumber,
    lines: [{ sku: row.sku, model: row.model, erpWarehouse: row.erpWarehouse, qty: 1 }],
    totalQty: 1,
  }));
}

export function aggregatePickupLabel(orders: PickupOrderInput[]): BatchLabel {
  if (!orders.length) throw new Error("Pickup batch has no orders.");
  const pickupCode = orders[0].pickupCode;
  if (orders.some((order) => order.pickupCode !== pickupCode))
    throw new Error("All label orders must belong to the same pickup batch.");
  const grouped = new Map<string, PickupLabelLine>();
  for (const order of orders) {
    for (const line of order.lines) {
      const key = JSON.stringify([line.sku, line.model, line.erpWarehouse]);
      const current = grouped.get(key);
      if (current) current.qty += line.qty;
      else grouped.set(key, { ...line });
    }
  }
  return {
    labelType: "BATCH_LABEL",
    pageCount: 1,
    pickupCode,
    shNos: [...new Set(orders.map((order) => order.shNo))].sort(),
    lines: [...grouped.values()].sort((a, b) =>
      `${a.sku}|${a.model}|${a.erpWarehouse}`.localeCompare(`${b.sku}|${b.model}|${b.erpWarehouse}`),
    ),
  };
}
