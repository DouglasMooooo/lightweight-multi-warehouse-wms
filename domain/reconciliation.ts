export type ReconciliationStatus =
  | "MATCH"
  | "MISSING_IN_WMS"
  | "MISSING_IN_LEDGER"
  | "QTY_DIFFERENCE"
  | "CONDITION_DIFFERENCE"
  | "LOCATION_DIFFERENCE";

export interface ReconciliationRow {
  sku: string;
  condition: string;
  location: string;
  container?: string;
  quantity: number;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  ledger?: ReconciliationRow;
  wms?: ReconciliationRow;
}

const grain = (row: ReconciliationRow) =>
  JSON.stringify([row.sku, row.condition, row.location, row.container ?? ""]);

export function reconcileInventory(
  ledgerRows: ReconciliationRow[],
  wmsRows: ReconciliationRow[],
): ReconciliationResult[] {
  const ledger = ledgerRows.map((row) => ({ ...row }));
  const wms = wmsRows.map((row) => ({ ...row }));
  const used = new Set<number>();
  const results: ReconciliationResult[] = [];

  for (const source of ledger) {
    let index = wms.findIndex((target, i) => !used.has(i) && grain(target) === grain(source));
    if (index >= 0) {
      used.add(index);
      results.push({
        status: wms[index].quantity === source.quantity ? "MATCH" : "QTY_DIFFERENCE",
        ledger: source,
        wms: wms[index],
      });
      continue;
    }
    index = wms.findIndex(
      (target, i) =>
        !used.has(i) &&
        target.sku === source.sku &&
        target.location === source.location &&
        (target.container ?? "") === (source.container ?? "") &&
        target.quantity === source.quantity,
    );
    if (index >= 0) {
      used.add(index);
      results.push({ status: "CONDITION_DIFFERENCE", ledger: source, wms: wms[index] });
      continue;
    }
    index = wms.findIndex(
      (target, i) =>
        !used.has(i) &&
        target.sku === source.sku &&
        target.condition === source.condition &&
        (target.container ?? "") === (source.container ?? "") &&
        target.quantity === source.quantity,
    );
    if (index >= 0) {
      used.add(index);
      results.push({ status: "LOCATION_DIFFERENCE", ledger: source, wms: wms[index] });
      continue;
    }
    results.push({ status: "MISSING_IN_WMS", ledger: source });
  }
  for (const [index, row] of wms.entries()) {
    if (!used.has(index)) results.push({ status: "MISSING_IN_LEDGER", wms: row });
  }
  return results;
}
