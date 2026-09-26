import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import type { SydneyCutoverPlan } from "@/import/sydney-cutover";

function operationSuffix(values: unknown[]) {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 16);
}

export class SydneyCutoverService {
  constructor(private readonly prisma: PrismaClient) {}

  async inspect(plan: SydneyCutoverPlan) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { code: "SYD" } });
    const [existingMarker, existingStock] = await Promise.all([
      this.prisma.stockTransaction.findFirst({
        where: { businessReference: plan.businessReference },
        select: { id: true, operationId: true },
      }),
      warehouse
        ? this.prisma.inventoryBalance.count({
            where: {
              warehouseId: warehouse.id,
              OR: [
                { physicalQty: { not: 0 } },
                { frozenQty: { not: 0 } },
                { inTransitQty: { not: 0 } },
              ],
            },
          })
        : Promise.resolve(0),
    ]);
    return { duplicate: Boolean(existingMarker), existingStock, existingMarker };
  }

  async apply(plan: SydneyCutoverPlan) {
    if (plan.summary.criticalExceptions > 0)
      throw new DomainError("Sydney cutover has critical validation exceptions.", "CUTOVER_VALIDATION_FAILED");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", plan.businessReference);
      const existingMarker = await tx.stockTransaction.findFirst({
        where: { businessReference: plan.businessReference },
        select: { id: true, operationId: true },
      });
      if (existingMarker) return { applied: false, duplicate: true, marker: existingMarker };

      const actor = await tx.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
      if (!actor) throw new DomainError("An active cutover actor is required.", "CUTOVER_ACTOR_REQUIRED");
      const warehouse = await tx.warehouse.upsert({
        where: { code: "SYD" },
        update: { name: "Sydney Service Warehouse", timezone: "Australia/Sydney", active: true },
        create: { code: "SYD", name: "Sydney Service Warehouse", timezone: "Australia/Sydney" },
      });
      const existingStock = await tx.inventoryBalance.count({
        where: {
          warehouseId: warehouse.id,
          OR: [
            { physicalQty: { not: 0 } },
            { frozenQty: { not: 0 } },
            { inTransitQty: { not: 0 } },
          ],
        },
      });
      if (existingStock > 0)
        throw new DomainError(
          "Sydney cutover requires an empty SYD operational inventory. Existing stock was not replaced.",
          "CUTOVER_REQUIRES_EMPTY_INVENTORY",
        );

      const existingProducts = await tx.product.findMany({
        where: { sku: { in: plan.products.map((product) => product.sku) } },
      });
      const incomingProducts = new Map(plan.products.map((product) => [product.sku, product]));
      for (const existing of existingProducts) {
        const incoming = incomingProducts.get(existing.sku)!;
        if (existing.model !== incoming.model || existing.itemType !== incoming.itemType)
          throw new DomainError(
            `Existing Product ${existing.sku} conflicts with the authoritative cutover master.`,
            "CUTOVER_PRODUCT_CONFLICT",
          );
      }
      const conflictingSerial = await tx.serialNumber.findFirst({
        where: { serialNumber: { in: plan.serials.map((serial) => serial.serialNumber) } },
        select: { serialNumber: true },
      });
      if (conflictingSerial)
        throw new DomainError(
          `Serial ${conflictingSerial.serialNumber} already exists without the cutover marker.`,
          "CUTOVER_SERIAL_CONFLICT",
        );
      const conflictingOrder = await tx.outboundOrder.findFirst({
        where: { shNo: { in: plan.preparedOrders.map((order) => order.shNo) } },
        select: { shNo: true },
      });
      if (conflictingOrder)
        throw new DomainError(
          `Outbound order ${conflictingOrder.shNo} already exists without the cutover marker.`,
          "CUTOVER_OUTBOUND_CONFLICT",
        );

      const products = new Map<string, Awaited<ReturnType<typeof tx.product.upsert>>>();
      for (const row of plan.products) {
        const product = await tx.product.upsert({
          where: { sku: row.sku },
          update: {
            category: row.category,
            active: row.active,
            reportMachine: row.reportMachine,
            reportGroup: row.reportGroup,
            serialTrackingRequired: row.itemType === "Product",
          },
          create: {
            sku: row.sku,
            model: row.model,
            itemType: row.itemType,
            category: row.category,
            active: row.active,
            reportMachine: row.reportMachine,
            reportGroup: row.reportGroup,
            serialTrackingRequired: row.itemType === "Product",
          },
        });
        products.set(row.sku, product);
      }
      const locations = new Map<string, Awaited<ReturnType<typeof tx.location.upsert>>>();
      for (const row of plan.locations) {
        const location = await tx.location.upsert({
          where: { warehouseId_code: { warehouseId: warehouse.id, code: row.code } },
          update: {
            zone: row.zone ?? row.code.split("-")[0],
            rack: row.rack,
            row: row.row && /^\d+$/.test(row.row) ? Number(row.row) : null,
            bay: row.bay && /^\d+$/.test(row.bay) ? Number(row.bay) : null,
            side: row.side,
            serviceZone: row.serviceZone,
            active: true,
          },
          create: {
            warehouseId: warehouse.id,
            code: row.code,
            zone: row.zone ?? row.code.split("-")[0],
            rack: row.rack,
            row: row.row && /^\d+$/.test(row.row) ? Number(row.row) : undefined,
            bay: row.bay && /^\d+$/.test(row.bay) ? Number(row.bay) : undefined,
            side: row.side,
            serviceZone: row.serviceZone,
          },
        });
        locations.set(row.code, location);
      }
      const containers = new Map<string, Awaited<ReturnType<typeof tx.container.upsert>>>();
      for (const code of [...new Set(plan.balances.flatMap((balance) => balance.container ? [balance.container] : []))]) {
        const container = await tx.container.upsert({
          where: { warehouseId_code: { warehouseId: warehouse.id, code } },
          update: { active: true },
          create: { warehouseId: warehouse.id, code },
        });
        containers.set(code, container);
      }

      let openingTransactions = 0;
      for (const row of plan.balances) {
        const location = locations.get(row.location)!;
        const product = row.sku ? products.get(row.sku) : undefined;
        const container = row.container ? containers.get(row.container) : undefined;
        const balanceWhere = {
          warehouseId: warehouse.id,
          locationId: location.id,
          containerId: container?.id ?? null,
          productId: product?.id ?? null,
          itemType: row.itemType,
          condition: row.condition,
        } as const;
        const existingBalances = await tx.inventoryBalance.findMany({ where: balanceWhere });
        if (existingBalances.length > 1)
          throw new DomainError(`Duplicate zero balance grain at ${row.location} / ${row.sku}.`, "CUTOVER_BALANCE_CONFLICT");
        if (existingBalances[0]) {
          await tx.inventoryBalance.update({
            where: { id: existingBalances[0].id },
            data: {
              physicalQty: row.physicalQty,
              frozenQty: row.frozenQty,
              inTransitQty: 0,
              version: { increment: 1 },
            },
          });
        } else {
          await tx.inventoryBalance.create({
            data: { ...balanceWhere, physicalQty: row.physicalQty, frozenQty: row.frozenQty, inTransitQty: 0 },
          });
        }
        const suffix = operationSuffix([
          row.location,
          row.container ?? "",
          row.sku ?? "",
          row.itemType,
          row.condition,
        ]);
        await tx.stockTransaction.create({
          data: {
            transactionType: "Opening",
            warehouseId: warehouse.id,
            targetLocationId: location.id,
            containerId: container?.id,
            productId: product?.id,
            itemType: row.itemType,
            condition: row.condition,
            quantity: row.physicalQty,
            physicalDelta: row.physicalQty,
            frozenDelta: row.frozenQty,
            businessReference: plan.businessReference,
            operationId: `${plan.businessReference}:OPENING:${suffix}`,
            reason: "Sydney production cutover opening balance",
            remark: `Authoritative Google Sheets cutover; source checksum ${plan.sourceChecksum}.`,
            effectiveAt: plan.cutoverAt,
            createdById: actor.id,
          },
        });
        openingTransactions += 1;
      }

      const serials = new Map<string, Awaited<ReturnType<typeof tx.serialNumber.create>>>();
      for (const row of plan.serials) {
        const product = products.get(row.sku)!;
        const location = locations.get(row.location)!;
        const serial = await tx.serialNumber.create({
          data: {
            serialNumber: row.serialNumber,
            productId: product.id,
            currentWarehouseId: row.status === "Outbound" ? undefined : warehouse.id,
            currentLocationId: row.status === "Outbound" ? undefined : location.id,
            condition: row.condition,
            status: row.status,
            sourceDocument: plan.businessReference,
          },
        });
        serials.set(row.serialNumber, serial);
      }

      let preparedOrders = 0;
      for (const orderRow of plan.preparedOrders) {
        const pickupBatch = orderRow.pickupCode
          ? await tx.pickupBatch.upsert({
              where: { code: orderRow.pickupCode },
              update: {},
              create: {
                code: orderRow.pickupCode,
                warehouseId: warehouse.id,
                status: "Ready",
                remark: `Sydney cutover ${plan.businessReference}`,
              },
            })
          : undefined;
        const erpWarehouses = [...new Set(orderRow.lines.flatMap((line) => line.erpWarehouse ? [line.erpWarehouse] : []))];
        const order = await tx.outboundOrder.create({
          data: {
            shNo: orderRow.shNo,
            pickupCode: orderRow.pickupCode,
            pickupBatchId: pickupBatch?.id,
            erpWarehouse: erpWarehouses.join(" / ") || "Unmapped",
            warehouseId: warehouse.id,
            status: "Ready_for_Pickup",
            erpSyncStatus: "Pending",
            customerLabel: "Sydney production cutover evidence",
            importedAt: plan.cutoverAt,
            allocatedAt: plan.cutoverAt,
            preparedAt: plan.cutoverAt,
          },
        });
        for (const lineRow of orderRow.lines) {
          const product = products.get(lineRow.sku!)!;
          const line = await tx.outboundOrderLine.create({
            data: {
              outboundOrderId: order.id,
              productId: product.id,
              requiredQty: lineRow.quantity,
              requiredCondition: lineRow.condition,
              erpWarehouse: lineRow.erpWarehouse ?? order.erpWarehouse,
              allocatedQty: lineRow.quantity,
              preparedQty: lineRow.quantity,
            },
          });
          for (const allocationRow of lineRow.sourceAllocations) {
            const location = locations.get(allocationRow.location)!;
            if (product.serialTrackingRequired) {
              for (const serialNumber of allocationRow.serialNumbers)
                await tx.outboundAllocation.create({
                  data: {
                    outboundOrderLineId: line.id,
                    locationId: location.id,
                    serialNumberId: serials.get(serialNumber)!.id,
                    quantity: 1,
                    preparedAt: plan.cutoverAt,
                  },
                });
            } else {
              await tx.outboundAllocation.create({
                data: {
                  outboundOrderLineId: line.id,
                  locationId: location.id,
                  quantity: allocationRow.quantity,
                  preparedAt: plan.cutoverAt,
                },
              });
            }
          }
        }
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            operation: "SYDNEY_CUTOVER_OUTBOUND_REBUILD",
            entityType: "OutboundOrder",
            entityId: order.id,
            businessReference: order.shNo,
            after: {
              status: "Ready_for_Pickup",
              cutoverReference: plan.businessReference,
              sourceChecksum: plan.sourceChecksum,
            },
            remark: "Rebuilt only from complete Prepared allocation and authoritative SN evidence.",
          },
        });
        preparedOrders += 1;
      }

      if (plan.issues.length)
        await tx.exception.createMany({
          data: plan.issues.map((issue, index) => ({
            warehouseId: warehouse.id,
            type: issue.code,
            severity: issue.severity === "Critical" ? "Critical" as const : "Medium" as const,
            entityReference: `${plan.businessReference}:${index + 1}`,
            message: `${issue.source}${issue.rowNumber ? ` row ${issue.rowNumber}` : ""}: ${issue.message}`,
          })),
        });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          operation: "SYDNEY_PRODUCTION_CUTOVER",
          entityType: "Warehouse",
          entityId: warehouse.id,
          businessReference: plan.businessReference,
          after: {
            sourceChecksum: plan.sourceChecksum,
            cutoverAt: plan.cutoverAt,
            ...plan.summary,
            openingTransactions,
            preparedOrders,
          } as unknown as Prisma.InputJsonValue,
          remark: "Explicit one-time Sydney opening inventory and SN cutover.",
        },
      });
      return {
        applied: true,
        duplicate: false,
        openingTransactions,
        serials: serials.size,
        preparedOrders,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000, maxWait: 15_000 });
  }
}
