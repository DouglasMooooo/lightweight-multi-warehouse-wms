import type { PickupLabelLine } from "./types";

export interface PickupOrderInput {
  shNo: string;
  pickupCode: string;
  lines: Array<{ sku: string; model: string; erpWarehouse: string; qty: number }>;
}

export interface BatchLabel {
  pickupCode: string;
  shNos: string[];
  lines: PickupLabelLine[];
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
    pickupCode,
    shNos: [...new Set(orders.map((order) => order.shNo))].sort(),
    lines: [...grouped.values()].sort((a, b) =>
      `${a.sku}|${a.model}|${a.erpWarehouse}`.localeCompare(`${b.sku}|${b.model}|${b.erpWarehouse}`),
    ),
  };
}
