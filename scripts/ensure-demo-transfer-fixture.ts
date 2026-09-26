import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";

const reference = "DEMO-TRANSFER-001";
const groups = [
  {
    sku: "DEMO-SKU-TRANSFER-A",
    model: "DEMO TRANSFER UNIT A",
    condition: "New" as const,
    serials: ["DEMO-TRANSFER-A-001", "DEMO-TRANSFER-A-002"],
    legacySerials: ["DEMO-TF-A-001", "DEMO-TF-A-002"],
  },
  {
    sku: "DEMO-SKU-TRANSFER-B",
    model: "DEMO TRANSFER UNIT B",
    condition: "New" as const,
    previousCondition: "Repair_Good" as const,
    serials: ["DEMO-TRANSFER-B-001", "DEMO-TRANSFER-B-002"],
    legacySerials: ["DEMO-TF-B-001", "DEMO-TF-B-002"],
  },
] as const;

function assertExplicitNonProductionPermission() {
  if (process.env.ALLOW_DEMO_FIXTURE !== "true")
    throw new Error("Set ALLOW_DEMO_FIXTURE=true to create the dedicated transfer fixture.");
  if (process.env.DATABASE_ENV === "production" || process.env.VERCEL_ENV === "production")
    throw new Error("DEMO-TRANSFER-001 cannot be created in a production environment.");
  if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL)
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

async function main() {
  assertExplicitNonProductionPermission();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [sourceWarehouse, destinationWarehouse, actor] = await Promise.all([
        tx.warehouse.findUnique({ where: { code: "SYD" } }),
        tx.warehouse.findUnique({ where: { code: "MEL" } }),
        tx.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } }),
      ]);
      if (!sourceWarehouse || !destinationWarehouse || !actor)
        throw new Error("SYD, MEL and an active demo actor must already exist. The script never seeds core data.");

      const sourceLocation = await tx.location.upsert({
        where: { warehouseId_code: { warehouseId: sourceWarehouse.id, code: "DEMO-TRANSFER-OUT" } },
        create: {
          warehouseId: sourceWarehouse.id,
          code: "DEMO-TRANSFER-OUT",
          zone: "DEMO",
          serviceZone: true,
        },
        update: { active: true },
      });
      await tx.location.upsert({
        where: { warehouseId_code: { warehouseId: destinationWarehouse.id, code: "DEMO-TRANSFER-IN" } },
        create: {
          warehouseId: destinationWarehouse.id,
          code: "DEMO-TRANSFER-IN",
          zone: "DEMO",
          serviceZone: true,
        },
        update: { active: true },
      });

      let changed = false;
      let corrected = false;
      let migratedLegacyIdentity = false;
      for (const group of groups) {
        const existingProduct = await tx.product.findUnique({ where: { sku: group.sku } });
        if (
          existingProduct &&
          (existingProduct.model !== group.model ||
            existingProduct.itemType !== "Product" ||
            !existingProduct.serialTrackingRequired)
        ) throw new Error(`${group.sku} exists but is not the approved demo product.`);
        const product = existingProduct ?? await tx.product.create({
          data: {
            sku: group.sku,
            model: group.model,
            itemType: "Product",
            category: "DEMO_ONLY",
            serialTrackingRequired: true,
            reportMachine: false,
            active: true,
          },
        });
        const existingSerials = await tx.serialNumber.findMany({
          where: { serialNumber: { in: [...group.serials] } },
        });
        if (existingSerials.length && existingSerials.length !== group.serials.length)
          throw new Error(`${group.sku} fixture is partial; manual review is required. No quantity was changed.`);
        if (existingSerials.length) {
          const safe = existingSerials.every((serial: {
            id: string;
            productId: string;
            currentWarehouseId: string | null;
            currentLocationId: string | null;
            condition: string;
            status: string;
            sourceDocument: string | null;
          }) =>
            serial.productId === product.id &&
            serial.currentWarehouseId === sourceWarehouse.id &&
            serial.currentLocationId === sourceLocation.id &&
            serial.condition === group.condition &&
            serial.status === "In_Stock",
          );
          if (!safe) {
            const previousCondition = "previousCondition" in group ? group.previousCondition : undefined;
            const canCorrectDedicatedFixture = Boolean(previousCondition) && existingSerials.every((serial) =>
              serial.productId === product.id &&
              serial.currentWarehouseId === sourceWarehouse.id &&
              serial.currentLocationId === sourceLocation.id &&
              serial.condition === previousCondition &&
              serial.status === "In_Stock" &&
              serial.sourceDocument === reference,
            );
            if (!canCorrectDedicatedFixture)
              throw new Error(`${group.sku} demo serials have already entered a workflow. The script will not reset them.`);
            const [oldBalance, newBalance] = await Promise.all([
              tx.inventoryBalance.findFirst({
                where: {
                  warehouseId: sourceWarehouse.id,
                  locationId: sourceLocation.id,
                  containerId: null,
                  productId: product.id,
                  itemType: "Product",
                  condition: previousCondition,
                },
              }),
              tx.inventoryBalance.findFirst({
                where: {
                  warehouseId: sourceWarehouse.id,
                  locationId: sourceLocation.id,
                  containerId: null,
                  productId: product.id,
                  itemType: "Product",
                  condition: group.condition,
                },
              }),
            ]);
            if (
              !oldBalance ||
              !oldBalance.physicalQty.equals(group.serials.length) ||
              !oldBalance.frozenQty.equals(0) ||
              !oldBalance.inTransitQty.equals(0) ||
              (newBalance && !newBalance.physicalQty.equals(0))
            ) throw new Error(`${group.sku} demo balance is not safe for condition correction.`);
            await tx.inventoryBalance.update({
              where: { id: oldBalance.id },
              data: { physicalQty: 0, version: { increment: 1 } },
            });
            if (newBalance) {
              await tx.inventoryBalance.update({
                where: { id: newBalance.id },
                data: { physicalQty: group.serials.length, version: { increment: 1 } },
              });
            } else {
              await tx.inventoryBalance.create({
                data: {
                  warehouseId: sourceWarehouse.id,
                  locationId: sourceLocation.id,
                  productId: product.id,
                  itemType: "Product",
                  condition: group.condition,
                  physicalQty: group.serials.length,
                },
              });
            }
            await tx.serialNumber.updateMany({
              where: { id: { in: existingSerials.map((serial) => serial.id) } },
              data: { condition: group.condition },
            });
            const correctionOperationId = `${reference}-${group.sku}-CONDITION-CORRECTION`;
            await tx.stockTransaction.createMany({
              data: [
                {
                  transactionType: "Adjustment_Out",
                  warehouseId: sourceWarehouse.id,
                  sourceLocationId: sourceLocation.id,
                  productId: product.id,
                  itemType: "Product",
                  condition: previousCondition!,
                  quantity: group.serials.length,
                  physicalDelta: -group.serials.length,
                  businessReference: reference,
                  operationId: correctionOperationId,
                  reason: "Correct dedicated demo fixture condition",
                  remark: "Synthetic demo-only condition correction; historical Opening retained.",
                  createdById: actor.id,
                },
                {
                  transactionType: "Adjustment_In",
                  warehouseId: sourceWarehouse.id,
                  targetLocationId: sourceLocation.id,
                  productId: product.id,
                  itemType: "Product",
                  condition: group.condition,
                  quantity: group.serials.length,
                  physicalDelta: group.serials.length,
                  businessReference: reference,
                  operationId: correctionOperationId,
                  reason: "Correct dedicated demo fixture condition",
                  remark: "Synthetic demo-only condition correction; historical Opening retained.",
                  createdById: actor.id,
                },
              ],
            });
            changed = true;
            corrected = true;
          }
          continue;
        }

        const legacySerials = await tx.serialNumber.findMany({
          where: { serialNumber: { in: [...group.legacySerials] } },
        });
        if (legacySerials.length) {
          if (legacySerials.length !== group.legacySerials.length)
            throw new Error(`${group.sku} legacy demo fixture is partial. No identity was changed.`);
          const balance = await tx.inventoryBalance.findFirst({
            where: {
              warehouseId: sourceWarehouse.id,
              locationId: sourceLocation.id,
              containerId: null,
              productId: product.id,
              itemType: "Product",
              condition: group.condition,
            },
          });
          const safeLegacyIdentity = legacySerials.every((serial) =>
            serial.productId === product.id &&
            serial.currentWarehouseId === sourceWarehouse.id &&
            serial.currentLocationId === sourceLocation.id &&
            serial.condition === group.condition &&
            serial.status === "In_Stock" &&
            serial.sourceDocument === reference,
          );
          if (
            !safeLegacyIdentity ||
            !balance ||
            !balance.physicalQty.equals(group.serials.length) ||
            !balance.frozenQty.equals(0) ||
            !balance.inTransitQty.equals(0)
          ) throw new Error(`${group.sku} legacy demo identity is not safe to replace. No quantity or SN was changed.`);
          await tx.serialNumber.updateMany({
            where: { id: { in: legacySerials.map((serial) => serial.id) } },
            data: { status: "Outbound", currentWarehouseId: null, currentLocationId: null },
          });
          await tx.serialNumber.createMany({
            data: group.serials.map((serialNumber) => ({
              serialNumber,
              productId: product.id,
              currentWarehouseId: sourceWarehouse.id,
              currentLocationId: sourceLocation.id,
              condition: group.condition,
              status: "In_Stock" as const,
              sourceDocument: reference,
            })),
          });
          const identityOperationId = `${reference}-${group.sku}-IDENTITY-MIGRATION`;
          await tx.stockTransaction.createMany({
            data: [
              {
                transactionType: "Adjustment_Out",
                warehouseId: sourceWarehouse.id,
                sourceLocationId: sourceLocation.id,
                productId: product.id,
                itemType: "Product",
                condition: group.condition,
                quantity: group.serials.length,
                physicalDelta: -group.serials.length,
                businessReference: reference,
                operationId: identityOperationId,
                reason: "Retire legacy synthetic demo SN prefix",
                remark: `Demo-only identity migration from ${group.legacySerials.join(", ")}. InventoryBalance is updated by the paired entry only.`,
                createdById: actor.id,
              },
              {
                transactionType: "Adjustment_In",
                warehouseId: sourceWarehouse.id,
                targetLocationId: sourceLocation.id,
                productId: product.id,
                itemType: "Product",
                condition: group.condition,
                quantity: group.serials.length,
                physicalDelta: group.serials.length,
                businessReference: reference,
                operationId: identityOperationId,
                reason: "Register approved synthetic demo SN prefix",
                remark: `Demo-only identity migration to ${group.serials.join(", ")}. Net Physical Qty is unchanged.`,
                createdById: actor.id,
              },
            ],
          });
          changed = true;
          migratedLegacyIdentity = true;
          continue;
        }

        const balance = await tx.inventoryBalance.findFirst({
          where: {
            warehouseId: sourceWarehouse.id,
            locationId: sourceLocation.id,
            containerId: null,
            productId: product.id,
            itemType: "Product",
            condition: group.condition,
          },
        });
        if (balance && !balance.physicalQty.equals(0))
          throw new Error(`${group.sku} demo balance already contains quantity. No quantity was changed.`);
        if (balance) {
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { physicalQty: group.serials.length, version: { increment: 1 } },
          });
        } else {
          await tx.inventoryBalance.create({
            data: {
              warehouseId: sourceWarehouse.id,
              locationId: sourceLocation.id,
              productId: product.id,
              itemType: "Product",
              condition: group.condition,
              physicalQty: group.serials.length,
            },
          });
        }
        await tx.serialNumber.createMany({
          data: group.serials.map((serialNumber) => ({
            serialNumber,
            productId: product.id,
            currentWarehouseId: sourceWarehouse.id,
            currentLocationId: sourceLocation.id,
            condition: group.condition,
            status: "In_Stock" as const,
            sourceDocument: reference,
          })),
        });
        await tx.stockTransaction.create({
          data: {
            transactionType: "Opening",
            warehouseId: sourceWarehouse.id,
            targetLocationId: sourceLocation.id,
            productId: product.id,
            itemType: "Product",
            condition: group.condition,
            quantity: group.serials.length,
            physicalDelta: group.serials.length,
            businessReference: reference,
            operationId: `${reference}-${group.sku}`,
            reason: "Dedicated non-production demo fixture",
            remark: "Synthetic demo-only transfer stock; safe for destructive rehearsal.",
            createdById: actor.id,
          },
        });
        changed = true;
      }
      if (changed) {
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            operation: migratedLegacyIdentity ? "Migrated demo transfer SN prefix" : corrected ? "Corrected demo transfer fixture" : "Prepared demo transfer fixture",
            entityType: "TransferDemoFixture",
            entityId: reference,
            businessReference: reference,
            remark: "Ensured four DEMO-TRANSFER-* New-condition SNs in two Product + Condition groups for SYD to MEL rehearsal; no operational stock was used.",
          },
        });
      }
      return { changed, corrected, migratedLegacyIdentity, reference, serials: groups.flatMap((group) => [...group.serials]) };
    }, { maxWait: 15_000, timeout: 30_000 });
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
