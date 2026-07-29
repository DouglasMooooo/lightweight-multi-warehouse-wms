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
