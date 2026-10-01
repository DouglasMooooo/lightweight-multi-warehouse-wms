import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import {
  evaluateOutboundReadiness,
  reconcileOutboundReadiness,
} from "../services/server/outbound-readiness-service";

const warehouseCode = process.env.OUTBOUND_RECONCILIATION_WAREHOUSE ?? "SYD";
const legacyLabel = process.env.OUTBOUND_RECONCILIATION_LEGACY_LABEL ?? "Workbook migration evidence";
const apply = process.env.APPLY_OUTBOUND_READINESS === "true";

type OrderRow = Awaited<ReturnType<typeof loadCandidateOrders>>[number];

function assertPreviewOnly() {
  if (process.env.DATABASE_ENV !== "preview")
    throw new Error("Reconciliation requires DATABASE_ENV=preview.");
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "preview")
    throw new Error("Reconciliation requires VERCEL_ENV=preview when VERCEL_ENV is set.");
  if (process.env.APP_ENV && process.env.APP_ENV !== "preview")
    throw new Error("Reconciliation requires APP_ENV=preview when APP_ENV is set.");
  if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL)
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

function loadCandidateOrders(prisma: PrismaClient | Prisma.TransactionClient) {
  return prisma.outboundOrder.findMany({
    where: {
      warehouse: { code: warehouseCode },
      status: "Prepared",
      customerLabel: legacyLabel,
    },
    include: {
      warehouse: true,
      lines: {
        include: {
          product: true,
          allocations: {
            where: { dispatchedAt: null },
            include: { serialNumber: true, location: true },
          },
        },
      },
    },
    orderBy: { shNo: "asc" },
  });
}

const grainKey = (input: {
  warehouseId: string;
  locationId: string;
  containerId: string | null;
  productId: string | null;
  condition: string;
}) => [
  input.warehouseId,
  input.locationId,
  input.containerId ?? "",
  input.productId,
  input.condition,
].join("|");

async function assess(prisma: PrismaClient | Prisma.TransactionClient, orders: OrderRow[]) {
  const warehouse = await prisma.warehouse.findUnique({ where: { code: warehouseCode } });
  if (!warehouse) throw new Error(`Warehouse ${warehouseCode} does not exist.`);

  const [activePreparedAllocations, balances, duplicateAssignments] = await Promise.all([
    prisma.outboundAllocation.findMany({
      where: {
        preparedAt: { not: null },
        dispatchedAt: null,
        outboundOrderLine: {
          outboundOrder: {
            warehouseId: warehouse.id,
            status: { in: ["Prepared", "Partially_Prepared", "Ready_for_Pickup"] },
          },
        },
      },
      include: {
        outboundOrderLine: { select: { productId: true, requiredCondition: true } },
      },
    }),
    prisma.inventoryBalance.findMany({ where: { warehouseId: warehouse.id } }),
    prisma.outboundAllocation.groupBy({
      by: ["serialNumberId"],
      where: { serialNumberId: { not: null }, dispatchedAt: null },
      _count: { _all: true },
      having: { serialNumberId: { _count: { gt: 1 } } },
    }),
  ]);

  const reservedByGrain = new Map<string, Prisma.Decimal>();
  for (const allocation of activePreparedAllocations) {
    const key = grainKey({
      warehouseId: warehouse.id,
      locationId: allocation.locationId,
      containerId: allocation.containerId,
      productId: allocation.outboundOrderLine.productId,
      condition: allocation.outboundOrderLine.requiredCondition,
    });
    reservedByGrain.set(
      key,
      (reservedByGrain.get(key) ?? new Prisma.Decimal(0)).plus(allocation.quantity),
    );
  }
  const balanceByGrain = new Map(balances.map((balance) => [grainKey(balance), balance]));
  const duplicateSerialIds = new Set(
    duplicateAssignments.flatMap((row) => row.serialNumberId ? [row.serialNumberId] : []),
  );

  return orders.map((order) => {
    const readiness = evaluateOutboundReadiness(order);
    const reasons = new Set<string>();
    let requiredQty = 0;
    let preparedQty = 0;
    let assignedSnQty = 0;

    if (!readiness.ready) {
      for (const line of readiness.lines) {
        if (!line.quantityPrepared) reasons.add(`line ${line.lineId}: prepared quantity incomplete`);
        if (!line.allocationConfirmed) reasons.add(`line ${line.lineId}: allocation/location not confirmed`);
        if (!line.serialComplete) reasons.add(`line ${line.lineId}: authoritative SN evidence incomplete`);
      }
    }

    for (const line of order.lines) {
      requiredQty += Number(line.requiredQty);
      preparedQty += Number(line.preparedQty);
      assignedSnQty += line.allocations.filter((allocation) => allocation.serialNumberId).length;
      for (const allocation of line.allocations) {
        if (!allocation.location || allocation.location.warehouseId !== order.warehouseId)
          reasons.add(`line ${line.id}: allocation location is missing or belongs to another warehouse`);
        if (allocation.serialNumberId && duplicateSerialIds.has(allocation.serialNumberId))
          reasons.add(`line ${line.id}: SN has another active outbound assignment`);
        const key = grainKey({
          warehouseId: order.warehouseId,
          locationId: allocation.locationId,
          containerId: allocation.containerId,
          productId: line.productId,
          condition: line.requiredCondition,
        });
        const balance = balanceByGrain.get(key);
        const reserved = reservedByGrain.get(key) ?? new Prisma.Decimal(0);
        if (!balance)
          reasons.add(`line ${line.id}: inventory balance grain is missing`);
        else if (balance.frozenQty.lessThan(reserved))
          reasons.add(`line ${line.id}: Frozen ${balance.frozenQty} is below active reservations ${reserved}`);
        else if (balance.frozenQty.greaterThan(balance.physicalQty))
          reasons.add(`line ${line.id}: Frozen exceeds Physical`);
      }
    }

    return {
      orderId: order.id,
      shNo: order.shNo,
      rawStatus: order.status,
      requiredQty,
      preparedQty,
      assignedSnQty,
      eligible: reasons.size === 0,
      blockingReason: reasons.size ? [...reasons].join("; ") : "",
    };
  });
}

function inventorySnapshot(rows: Array<{
  id: string;
  physicalQty: Prisma.Decimal;
  frozenQty: Prisma.Decimal;
  inTransitQty: Prisma.Decimal;
  version: number;
}>) {
  return rows.map((row) => ({
    id: row.id,
    physicalQty: row.physicalQty.toString(),
    frozenQty: row.frozenQty.toString(),
    inTransitQty: row.inTransitQty.toString(),
    version: row.version,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
  assertPreviewOnly();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const dryRunOrders = await loadCandidateOrders(prisma);
    const dryRunRows = await assess(prisma, dryRunOrders);
    const result = {
      mode: apply ? "APPLY" : "DRY_RUN",
      databaseEnvironment: process.env.DATABASE_ENV,
      warehouseCode,
      legacyLabel,
      candidateCount: dryRunRows.length,
      eligibleCount: dryRunRows.filter((row) => row.eligible).length,
      blockedCount: dryRunRows.filter((row) => !row.eligible).length,
      rows: dryRunRows,
      promoted: [] as string[],
      inventoryBalancesUnchanged: true,
      erpSyncJobsCreated: 0,
      auditRecordsCreated: 0,
    };

    if (apply && dryRunRows.some((row) => row.eligible)) {
      const applied = await prisma.$transaction(async (tx) => {
        const beforeJobs = await tx.eRPSyncJob.count();
        const beforeBalances = inventorySnapshot(await tx.inventoryBalance.findMany({
          where: { warehouse: { code: warehouseCode } },
          orderBy: { id: "asc" },
        }));
        const actor = await tx.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
        if (!actor) throw new Error("An active Preview audit actor is required.");
        const currentOrders = await loadCandidateOrders(tx);
        const currentRows = await assess(tx, currentOrders);
        const eligibleIds = new Set(currentRows.filter((row) => row.eligible).map((row) => row.orderId));
        const promoted: string[] = [];
        const reconciliationStartedAt = new Date();
        for (const order of currentOrders) {
          if (!eligibleIds.has(order.id)) continue;
          const readiness = await reconcileOutboundReadiness(tx, order.id, actor.id);
          if (!readiness.ready || readiness.status !== "Ready_for_Pickup")
            throw new Error(`${order.shNo} changed during reconciliation and was not promoted.`);
          promoted.push(order.shNo);
        }
        const afterBalances = inventorySnapshot(await tx.inventoryBalance.findMany({
          where: { warehouse: { code: warehouseCode } },
          orderBy: { id: "asc" },
        }));
        const afterJobs = await tx.eRPSyncJob.count();
        if (JSON.stringify(beforeBalances) !== JSON.stringify(afterBalances))
          throw new Error("Inventory balances changed; transaction will roll back.");
        if (afterJobs !== beforeJobs)
          throw new Error("ERP sync jobs changed; transaction will roll back.");
        const auditCount = promoted.length
          ? await tx.auditLog.count({
              where: {
                operation: "Outbound ready for pickup",
                businessReference: { in: promoted },
                createdAt: { gte: reconciliationStartedAt },
              },
            })
          : 0;
        if (auditCount < promoted.length)
          throw new Error("A promoted order is missing its readiness audit record; transaction will roll back.");
        return { promoted, beforeJobs, afterJobs, auditCount };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15_000,
        timeout: 60_000,
      });
      result.promoted = applied.promoted;
      result.erpSyncJobsCreated = applied.afterJobs - applied.beforeJobs;
      result.auditRecordsCreated = applied.auditCount;
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
