import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeWorkbook } from "@/import/workbook-analyzer";
import { readWorkbookBuffer } from "@/import/workbook-reader";

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Usage: tsx scripts/analyze-shadow-workbook.ts <workbook.xlsx> [cutover ISO]");
  const cutoverAt = process.argv[3] ? new Date(process.argv[3]) : new Date();
  if (Number.isNaN(cutoverAt.valueOf())) throw new Error("Cutover timestamp is invalid.");
  const absolute = resolve(source);
  const workbook = await readWorkbookBuffer(await readFile(absolute), absolute.split(/[\\/]/).at(-1)!);
  const result = analyzeWorkbook(workbook, {
    mode: "DRY_RUN",
    cutoverAt,
    wms: { products: [], locations: [], balances: [], serials: [] },
  });
  const tally = (values: string[], allowed: string[]) =>
    Object.fromEntries(allowed.map((value) => [value, values.filter((candidate) => candidate === value).length]));
  const inventoryStatuses = result.reconciliation
    .filter((row) => row.source === "WORKBOOK_VIEW")
    .map((row) => row.discrepancyType);
  const serialStatuses = result.reconciliation
    .filter((row) => row.source === "WORKBOOK_VIEW" && Boolean(row.serialNumber))
    .map((row) => row.discrepancyType);
  const productLedger = result.ledgerRows.filter((row) => row.itemType === "Product");
  const serialsBySh = new Map<string, string[]>();
  const skuCountBySh = new Map<string, Map<string, number>>();
  for (const row of productLedger) {
    if (!row.shNo) continue;
    if (row.serialNumber) serialsBySh.set(row.shNo, [...(serialsBySh.get(row.shNo) ?? []), row.serialNumber]);
    if (row.sku) {
      const skuCounts = skuCountBySh.get(row.shNo) ?? new Map<string, number>();
      skuCounts.set(row.sku, (skuCounts.get(row.sku) ?? 0) + 1);
      skuCountBySh.set(row.shNo, skuCounts);
    }
  }
  console.log(JSON.stringify({
  comparisonBaseline: "EMPTY_WMS_REFERENCE",
  sourceFileName: result.sourceFileName,
  sourceChecksum: result.sourceChecksum,
  cutoverAt: result.cutoverAt,
  workbookRows: result.workbookRows,
  acceptedRows: result.acceptedRows,
  productRows: result.productRows.length,
  locationRows: result.locationRows.length,
  workbookViewBalances: result.workbookViewBalances.length,
  ledgerProjectedBalances: result.ledgerProjectedBalances.length,
  workbookSerials: result.workbookSerials.length,
  activeOutboundOrders: result.activeOutboundOrders.length,
  pickupBatches: result.pickupBatches.length,
  repairItems: result.repairItems.length,
  ledger: {
    totalRows: result.workbookRows,
    acceptedRows: result.acceptedRows,
    warningRows: result.warningRows,
    rejectedRows: result.rejectedRows,
    ignoredHelperDisplayRows: result.issues.filter((row) => row.code === "DISPLAY_ONLY_PLACEHOLDER").length,
  },
  inventory: {
    totalProjectedStockRows: result.workbookViewBalances.length,
    ...tally(inventoryStatuses, [
      "MATCH",
      "MISSING_IN_WMS",
      "MISSING_IN_LEDGER",
      "QTY_DIFFERENCE",
      "CONDITION_DIFFERENCE",
      "LOCATION_DIFFERENCE",
    ]),
  },
  serialNumbers: {
    knownSerialRows: result.workbookSerials.length,
    ...tally(serialStatuses, [
      "SN_MATCH",
      "SN_MISSING_IN_WMS",
      "SN_WRONG_LOCATION",
      "SN_WRONG_CONDITION",
      "SN_STATUS_MISMATCH",
      "SERIAL_COUNT_SHORTAGE",
      "SERIAL_COUNT_EXCESS",
    ]),
    legacyTraceabilityGaps: result.reconciliation.filter((row) => row.classification === "LEGACY_TRACEABILITY_GAP").length,
  },
  workflow: {
    activeSH: result.activeOutboundOrders.filter((row) => row.status !== "Outbound").length,
    pendingAllocation: result.activeOutboundOrders.filter((row) => row.status === "Pending_Allocation").length,
    allocated: 0,
    prepared: result.activeOutboundOrders.filter((row) => row.status === "Prepared").length,
    readyForPickup: 0,
    outbound: result.activeOutboundOrders.filter((row) => row.status === "Outbound").length,
    reviewRequired: result.activeOutboundOrders.filter((row) => row.status === "Review_Required").length,
    repairItems: result.repairItems.filter((row) => row.status === "Repair").length,
    repairGood: result.repairItems.filter((row) => row.status === "Legacy_Repair_Good").length,
    scrap: result.repairItems.filter((row) => row.status === "Scrapped").length,
    activeTransfers: result.ledgerRows.filter((row) => row.action === "Transfer_Out").length,
  },
  realSerialPatterns: {
    productRowsWithSN: productLedger.filter((row) => row.serialNumber).length,
    productRowsWithoutSN: productLedger.filter((row) => !row.serialNumber).length,
    repeatedSHWithMultipleSNRows: [...serialsBySh.values()].filter((rows) => rows.length > 1).length,
    repeatedSKUUnderSameSH: [...skuCountBySh.values()].filter((skuCounts) =>
      [...skuCounts.values()].some((count) => count > 1),
    ).length,
    preparedWithSN: productLedger.filter((row) => row.action === "Prepared" && row.serialNumber).length,
    outboundWithSN: productLedger.filter((row) => row.action === "Outbound" && row.serialNumber).length,
    repairWithSN: productLedger.filter((row) => row.condition === "Repair" && row.serialNumber).length,
  },
  issuesByCode: Object.fromEntries(
    [...new Set(result.issues.map((row) => row.code))]
      .sort()
      .map((code) => [code, result.issues.filter((row) => row.code === code).length]),
  ),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
