import type { StockCondition } from "./types";

export interface GroupableTransferScan {
  validationStatus: string;
  productId?: string;
  sku?: string;
  model?: string;
  condition?: StockCondition;
  serialId?: string;
}

export function groupValidTransferScans(results: GroupableTransferScan[]) {
  const grouped = new Map<string, {
    productId: string;
    sku: string;
    model: string;
    condition: StockCondition;
    quantity: number;
    serialIds: string[];
  }>();
  for (const result of results) {
    if (
      result.validationStatus !== "VALID" ||
      !result.productId ||
      !result.sku ||
      !result.model ||
      !result.condition ||
      !result.serialId
    ) continue;
    const key = `${result.productId}:${result.condition}`;
    const current = grouped.get(key);
    if (current) {
      current.quantity += 1;
      current.serialIds.push(result.serialId);
    } else {
      grouped.set(key, {
        productId: result.productId,
        sku: result.sku,
        model: result.model,
        condition: result.condition,
        quantity: 1,
        serialIds: [result.serialId],
      });
    }
  }
  return [...grouped.values()];
}
