import {
  reconcileInventory,
  reconcileSerials,
  type ReconciliationResult,
  type ReconciliationRow,
  type SerialReconciliationResult,
  type SerialReconciliationRow,
} from "@/domain/reconciliation";

/**
 * Migration/shadow-mode utility. It compares semantic rows supplied by an
 * integration mapper and deliberately exposes no inventory write operation.
 */
export class SpreadsheetReconciliationService {
  compare(
    spreadsheetCurrentStock: ReconciliationRow[],
    wmsCurrentStock: ReconciliationRow[],
  ): ReconciliationResult[] {
    return reconcileInventory(spreadsheetCurrentStock, wmsCurrentStock);
  }

  compareSerials(
    spreadsheetSerials: SerialReconciliationRow[],
    wmsSerials: SerialReconciliationRow[],
  ): SerialReconciliationResult[] {
    return reconcileSerials(spreadsheetSerials, wmsSerials);
  }
}
