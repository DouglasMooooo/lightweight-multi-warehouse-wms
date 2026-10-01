import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import {
  buildSydneyCutoverPlan,
  SYDNEY_CUTOVER_REFERENCE,
  type SydneyCutoverSource,
} from "../import/sydney-cutover";
import { SydneyCutoverService } from "../services/server/sydney-cutover-service";

const ledgerSpreadsheetId = "18nA9WzvCa_d9XoJtgO9zdBdxknhRJ9SN0qi2lbI7c_E";
const sourceUrls = {
  ledgerCsv: `https://docs.google.com/spreadsheets/d/${ledgerSpreadsheetId}/export?format=csv&gid=1436765633`,
  currentStockCsv: `https://docs.google.com/spreadsheets/d/${ledgerSpreadsheetId}/export?format=csv&gid=611764643`,
  productCsv: `https://docs.google.com/spreadsheets/d/${ledgerSpreadsheetId}/export?format=csv&gid=536486404`,
  locationCsv: `https://docs.google.com/spreadsheets/d/${ledgerSpreadsheetId}/export?format=csv&gid=1935996091`,
};

function argument(name: string) {
  const withEquals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function fetchCsv(url: string, label: string) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${label} download failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (!text.trim()) throw new Error(`${label} is empty.`);
  return text;
}

async function readRequiredSnapshot(flag: string, label: string) {
  const path = argument(flag);
  if (!path)
    throw new Error(
      `${flag}=<file.csv> is required. Export the authoritative ${label} tab without editing the Google Sheet.`,
    );
  return readFile(resolve(path), "utf8");
}

function printPlan(plan: ReturnType<typeof buildSydneyCutoverPlan>, database?: unknown) {
  console.log("\n## Sydney WMS Cutover\n");
  console.log(`Business reference: ${plan.businessReference}`);
  console.log(`Source checksum: ${plan.sourceChecksum}`);
  console.log(`Products: ${plan.summary.products}`);
  console.log(`Locations: ${plan.summary.locations}`);
  console.log(`Containers: ${plan.summary.containers}`);
  console.log(`Opening balances: ${plan.summary.openingBalances}`);
  console.log(`Serials: ${plan.summary.serials}`);
  console.log(`In Stock: ${plan.summary.inStock}`);
  console.log(`Prepared: ${plan.summary.prepared}`);
  console.log(`Outbound historical: ${plan.summary.outboundHistorical}`);
  console.log(`Physical Qty: ${plan.summary.physicalQty}`);
  console.log(`Frozen Qty: ${plan.summary.frozenQty}`);
  console.log(`Prepared orders rebuilt: ${plan.summary.preparedOrders}`);
  console.log(`Exceptions: ${plan.summary.exceptions} (${plan.summary.criticalExceptions} critical)`);
  if (database) console.log(`Database inspection: ${JSON.stringify(database)}`);
  if (plan.issues.length) {
    console.log("\n### Exceptions\n");
    for (const issue of plan.issues)
      console.log(`- [${issue.severity}] ${issue.code} · ${issue.source}${issue.rowNumber ? ` row ${issue.rowNumber}` : ""}: ${issue.message}`);
  }
}

function connect() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required for database inspection/apply.");
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });
  return { pool, prisma: new PrismaClient({ adapter: new PrismaPg(pool) }) };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const databaseCheck = process.argv.includes("--database-check");
  const cutoverAt = new Date(argument("--cutover-at") ?? "2026-08-11T00:00:00+10:00");
  if (Number.isNaN(cutoverAt.valueOf())) throw new Error("--cutover-at is invalid.");
  const [ledgerCsv, currentStockCsv, productCsv, locationCsv, goodSerialCsv, newSerialCsv] = await Promise.all([
    fetchCsv(sourceUrls.ledgerCsv, "Stock_Transaction_Log"),
    fetchCsv(sourceUrls.currentStockCsv, "Current_Stock_Detail"),
    fetchCsv(sourceUrls.productCsv, "Product_Stock_Master"),
    fetchCsv(sourceUrls.locationCsv, "Location_Master"),
    readRequiredSnapshot("--good-sn-csv", "良品"),
    readRequiredSnapshot("--new-sn-csv", "新机"),
  ]);
  const source: SydneyCutoverSource = {
    ledgerCsv,
    currentStockCsv,
    productCsv,
    locationCsv,
    goodSerialCsv,
    newSerialCsv,
  };
  const plan = buildSydneyCutoverPlan({
    source,
    cutoverAt,
    businessReference: argument("--business-reference") ?? SYDNEY_CUTOVER_REFERENCE,
  });
  if (plan.summary.criticalExceptions > 0) {
    printPlan(plan);
    throw new Error("Critical cutover validation failed. No database writes were attempted.");
  }
  if (dryRun && !databaseCheck) {
    printPlan(plan);
    return;
  }
  const { pool, prisma } = connect();
  try {
    const service = new SydneyCutoverService(prisma);
    const database = await service.inspect(plan);
    if (dryRun) {
      printPlan(plan, database);
      return;
    }
    if (process.env.ALLOW_SYDNEY_CUTOVER !== "true")
      throw new Error("Set ALLOW_SYDNEY_CUTOVER=true for the explicit one-time apply.");
    if (process.env.DATABASE_ENV !== "production")
      throw new Error("Sydney production cutover requires DATABASE_ENV=production.");
    const result = await service.apply(plan);
    printPlan(plan, database);
    console.log(`\nApply result: ${JSON.stringify(result)}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
