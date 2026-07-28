import { isPhysicallyPresentSerialStatus } from "./serial-policy";
import type { SerialStatus } from "./types";

export type ReconciliationStatus =
  | "MATCH"
  | "MISSING_IN_WMS"
  | "MISSING_IN_LEDGER"
  | "QTY_DIFFERENCE"
  | "CONDITION_DIFFERENCE"
  | "LOCATION_DIFFERENCE"
  | "SN_MISSING_IN_WMS"
  | "SN_WRONG_LOCATION"
  | "SN_WRONG_CONDITION"
  | "SN_STATUS_MISMATCH"
  | "SERIAL_COUNT_MATCH"
  | "SERIAL_COUNT_SHORTAGE"
  | "SERIAL_COUNT_EXCESS";

export interface ReconciliationRow {
  warehouse?: string;
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
  JSON.stringify([row.warehouse ?? "", row.sku, row.condition, row.location, row.container ?? ""]);

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
        (target.warehouse ?? "") === (source.warehouse ?? "") &&
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
        (target.warehouse ?? "") === (source.warehouse ?? "") &&
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

export interface SerialReconciliationRow {
  serialNumber: string;
  sku: string;
  warehouse: string;
  location: string;
  condition: string;
  status: string;
  legacyIncomplete?: boolean;
}

export interface SerialReconciliationResult {
  status: Extract<
    ReconciliationStatus,
    "MATCH" | "SN_MISSING_IN_WMS" | "SN_WRONG_LOCATION" | "SN_WRONG_CONDITION" | "SN_STATUS_MISMATCH"
  >;
  ledger: SerialReconciliationRow;
  wms?: SerialReconciliationRow;
  classification: "LEGACY_TRACEABILITY_GAP" | "CURRENT_OPERATIONAL_ERROR" | "MATCH";
}

export function reconcileSerials(
  ledgerRows: SerialReconciliationRow[],
  wmsRows: SerialReconciliationRow[],
): SerialReconciliationResult[] {
  const wmsBySerial = new Map(
    wmsRows.map((row) => [row.serialNumber.trim().toUpperCase(), row]),
  );
  return ledgerRows.map((ledger) => {
    const wms = wmsBySerial.get(ledger.serialNumber.trim().toUpperCase());
    const classification = ledger.legacyIncomplete
      ? "LEGACY_TRACEABILITY_GAP"
      : "CURRENT_OPERATIONAL_ERROR";
    if (!wms) return { status: "SN_MISSING_IN_WMS", ledger, classification };
    if (wms.location !== ledger.location || wms.warehouse !== ledger.warehouse)
      return { status: "SN_WRONG_LOCATION", ledger, wms, classification };
    if (wms.condition !== ledger.condition)
      return { status: "SN_WRONG_CONDITION", ledger, wms, classification };
    if (wms.status !== ledger.status)
      return { status: "SN_STATUS_MISMATCH", ledger, wms, classification };
    return { status: "MATCH", ledger, wms, classification: "MATCH" };
  });
}

export interface SerialCountBalance {
  balanceId: string;
  productId: string;
  sku: string;
  warehouse: string;
  location: string;
  condition: string;
  physicalQty: number;
  legacySerialGap?: boolean;
}

export interface PhysicalSerialIdentity {
  productId: string;
  warehouse?: string;
  location?: string;
  condition: string;
  status: SerialStatus;
}

export interface SerialCountReconciliationResult {
  status: Extract<
    ReconciliationStatus,
    "SERIAL_COUNT_MATCH" | "SERIAL_COUNT_SHORTAGE" | "SERIAL_COUNT_EXCESS"
  >;
  balance: SerialCountBalance;
  physicalQty: number;
  activeSerialQty: number;
  classification: "MATCH" | "LEGACY_TRACEABILITY_GAP" | "CURRENT_OPERATIONAL_ERROR";
}

export function reconcileSerialCounts(
  balances: SerialCountBalance[],
  serials: PhysicalSerialIdentity[],
): SerialCountReconciliationResult[] {
  return balances.map((balance) => {
    const activeSerialQty = serials.filter(
      (serial) =>
        isPhysicallyPresentSerialStatus(serial.status) &&
        serial.productId === balance.productId &&
        serial.warehouse === balance.warehouse &&
        serial.location === balance.location &&
        serial.condition === balance.condition,
    ).length;
    if (activeSerialQty === balance.physicalQty)
      return {
        status: "SERIAL_COUNT_MATCH",
        balance,
        physicalQty: balance.physicalQty,
        activeSerialQty,
        classification: "MATCH",
      };
    if (activeSerialQty < balance.physicalQty)
      return {
        status: "SERIAL_COUNT_SHORTAGE",
        balance,
        physicalQty: balance.physicalQty,
        activeSerialQty,
        classification: balance.legacySerialGap
          ? "LEGACY_TRACEABILITY_GAP"
          : "CURRENT_OPERATIONAL_ERROR",
      };
    return {
      status: "SERIAL_COUNT_EXCESS",
      balance,
      physicalQty: balance.physicalQty,
      activeSerialQty,
      classification: "CURRENT_OPERATIONAL_ERROR",
    };
  });
}
