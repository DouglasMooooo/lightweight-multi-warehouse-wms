import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";

const reference = "DEMO-OUTBOUND-001";
const sku = "DEMO-SKU-OUTBOUND-001";
const model = "DEMO OUTBOUND SERIAL UNIT";
const locationCode = "DEMO-OUTBOUND-PREP";
const serialNumbers = ["DEMO-OUTBOUND-SN-001", "DEMO-OUTBOUND-SN-002"];

function assertPreviewPermission() {
  if (process.env.ALLOW_DEMO_OUTBOUND_FIXTURE !== "true")
    throw new Error("Set ALLOW_DEMO_OUTBOUND_FIXTURE=true to create the dedicated outbound fixture.");
  if (process.env.VERCEL_ENV !== "preview" && process.env.DATABASE_ENV !== "preview")
    throw new Error("DEMO-OUTBOUND-001 may run only against an explicitly identified Preview database.");
  if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL)
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

async function main() {
  assertPreviewPermission();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.outboundOrder.findUnique({
        where: { shNo: reference },
        include: { lines: { include: { allocations: { include: { serialNumber: true, location: true } } } } },
      });
      if (existingOrder) {
        return {
          created: false,
          shNo: existingOrder.shNo,
          status: existingOrder.status,
          preparedQty: existingOrder.lines.reduce((sum, line) => sum + Number(line.preparedQty), 0),
          assignedSerials: existingOrder.lines.flatMap((line) => line.allocations.flatMap((allocation) =>
            allocation.serialNumber ? [allocation.serialNumber.serialNumber] : [],
          )),
          note: "Existing demo lifecycle state was preserved; no reset or stock mutation was performed.",
        };
      }

      const [warehouse, actor] = await Promise.all([
        tx.warehouse.findUnique({ where: { code: "SYD" } }),
        tx.user.findUnique({ where: { email: "demo.supervisor@example.invalid" } }),
      ]);
      if (!warehouse || !actor?.active)
        throw new Error("SYD and the active server-side demo supervisor must already exist. Core data is never seeded here.");

      const location = await tx.location.upsert({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: locationCode } },
        create: { warehouseId: warehouse.id, code: locationCode, zone: "DEMO", serviceZone: true },
        update: { active: true },
      });
      const existingProduct = await tx.product.findUnique({ where: { sku } });
      if (existingProduct && (
        existingProduct.model !== model ||
        existingProduct.itemType !== "Product" ||
        !existingProduct.serialTrackingRequired
      )) throw new Error(`${sku} exists with non-demo semantics; no data was changed.`);
      const product = existingProduct ?? await tx.product.create({
        data: {
          sku,
          model,
          itemType: "Product",
          category: "DEMO_ONLY",
          serialTrackingRequired: true,
          reportMachine: false,
          active: true,
        },
      });

      const [existingSerials, existingBalance] = await Promise.all([
        tx.serialNumber.findMany({ where: { serialNumber: { in: serialNumbers } } }),
        tx.inventoryBalance.findFirst({
          where: {
            warehouseId: warehouse.id,
            locationId: location.id,
            containerId: null,
            productId: product.id,
            itemType: "Product",
            condition: "New",
          },
        }),
      ]);
      if (existingSerials.length || existingBalance)
        throw new Error("A partial DEMO-OUTBOUND-001 stock fixture exists. Manual review is required; no quantity was changed.");

      const createdSerials = await Promise.all(serialNumbers.map((serialNumber) => tx.serialNumber.create({
        data: {
          serialNumber,
          productId: product.id,
          currentWarehouseId: warehouse.id,
          currentLocationId: location.id,
          condition: "New",
          status: "In_Stock",
          sourceDocument: reference,
        },
      })));
      await tx.inventoryBalance.create({
        data: {
          warehouseId: warehouse.id,
          locationId: location.id,
          productId: product.id,
          itemType: "Product",
          condition: "New",
          physicalQty: serialNumbers.length,
          frozenQty: 0,
          inTransitQty: 0,
        },
      });
      const operationId = `${reference}-OPENING-${randomUUID()}`;
      await tx.stockTransaction.createMany({
        data: createdSerials.map((serial) => ({
          transactionType: "Opening" as const,
          warehouseId: warehouse.id,
          targetLocationId: location.id,
          productId: product.id,
          serialNumberId: serial.id,
          itemType: "Product" as const,
          condition: "New" as const,
          quantity: 1,
          physicalDelta: 1,
          businessReference: reference,
          operationId,
          reason: "Dedicated Preview outbound demo fixture",
          remark: "Synthetic demo-only stock. Never use as real valuable inventory.",
          createdById: actor.id,
        })),
      });
      const order = await tx.outboundOrder.create({
        data: {
          shNo: reference,
          erpWarehouse: "DEMO-SYD",
          warehouseId: warehouse.id,
          status: "Pending_Allocation",
          erpSyncStatus: "Pending",
          customerLabel: "DEMO ONLY / 演示专用",
          importedAt: new Date(),
          lines: {
            create: {
              productId: product.id,
              requiredQty: serialNumbers.length,
              requiredCondition: "New",
              erpWarehouse: "DEMO-SYD",
            },
          },
        },
        include: { lines: true },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          operation: "Created dedicated Preview outbound demo fixture",
          entityType: "OutboundOrder",
          entityId: order.id,
          businessReference: reference,
          after: { sku, locationCode, serialNumbers, physicalQty: serialNumbers.length, status: order.status },
          remark: "Explicitly authorized synthetic fixture; no production or real inventory was used.",
        },
      });
      return {
        created: true,
        shNo: order.shNo,
        status: order.status,
        lineId: order.lines[0]?.id,
        sku,
        locationCode,
        serialNumbers,
        physicalQty: serialNumbers.length,
        frozenQty: 0,
      };
    }, { maxWait: 15_000, timeout: 30_000 });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
