import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import { analyzeWorkbook } from "@/import/workbook-analyzer";
import { readWorkbookBuffer } from "@/import/workbook-reader";
import type { ShadowImportMode, WmsShadowReference } from "@/import/workbook-types";
import { getPrisma } from "@/lib/prisma";
import { assertShadowSeedAllowed } from "@/lib/environment";

export class ShadowImportService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  private async reference(): Promise<WmsShadowReference> {
    const [products, locations, balances, serials] = await Promise.all([
      this.prisma.product.findMany(),
      this.prisma.location.findMany({ include: { warehouse: true } }),
      this.prisma.inventoryBalance.findMany({
        include: { warehouse: true, location: true, container: true, product: true },
      }),
      this.prisma.serialNumber.findMany({
        include: { product: true, currentWarehouse: true, currentLocation: true },
      }),
    ]);
    return {
      products: products.map((row) => ({
        sku: row.sku,
        model: row.model,
        itemType: row.itemType,
        reportMachine: row.reportMachine,
        reportGroup: row.reportGroup ?? undefined,
      })),
      locations: locations.map((row) => ({
        code: row.code,
        warehouse: row.warehouse.code,
        zone: row.zone,
        serviceZone: row.serviceZone,
      })),
      balances: balances.map((row) => ({
        warehouse: row.warehouse.code,
        location: row.location.code,
        container: row.container?.code,
        sku: row.product?.sku,
        itemType: row.itemType,
        condition: row.condition,
        physicalQty: row.physicalQty.toNumber(),
        frozenQty: row.frozenQty.toNumber(),
        legacySerialGap: row.legacySerialGap,
        source: "WMS" as const,
      })),
      serials: serials.flatMap((row) =>
        row.currentWarehouse && row.currentLocation
          ? [{
              serialNumber: row.serialNumber,
              sku: row.product.sku,
              warehouse: row.currentWarehouse.code,
              location: row.currentLocation.code,
              condition: row.condition,
              status: row.status,
            }]
          : [],
      ),
    };
  }

  async run(input: {
    buffer: Buffer;
    sourceFileName: string;
    mode: ShadowImportMode;
    cutoverAt: Date;
    replaceExisting?: boolean;
  }) {
    const parseStartedAt = performance.now();
    const workbook = await readWorkbookBuffer(input.buffer, input.sourceFileName);
    console.info("wms_timing", {
      route: "shadow-import",
      durationMs: Math.round(performance.now() - parseStartedAt),
      queryName: "workbookParsing",
      rowCount: workbook.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
    const referenceStartedAt = performance.now();
    const reference = await this.reference();
    console.info("wms_timing", {
      route: "shadow-import",
      durationMs: Math.round(performance.now() - referenceStartedAt),
      queryName: "postgresReference",
      rowCount: reference.balances.length,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
    const reconciliationStartedAt = performance.now();
    const result = analyzeWorkbook(workbook, {
      mode: input.mode,
      cutoverAt: input.cutoverAt,
      wms: reference,
    });
    console.info("wms_timing", {
      route: "shadow-import",
      durationMs: Math.round(performance.now() - reconciliationStartedAt),
      queryName: "reconciliation",
      rowCount: result.reconciliation.length,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
    if (input.mode === "DRY_RUN") return { ...result, seeded: false, duplicate: false };
    return this.seed(result, input.replaceExisting ?? false);
  }

  private async seed(result: ReturnType<typeof analyzeWorkbook>, replaceExisting: boolean) {
    try {
      assertShadowSeedAllowed({
        appEnv: process.env.APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        enabled: process.env.SHADOW_IMPORT_ENABLED,
      });
    } catch {
      throw new DomainError(
        "SHADOW_SEED is disabled. It requires a non-production environment and SHADOW_IMPORT_ENABLED=true.",
        "SHADOW_SEED_DISABLED",
      );
    }
    const duplicate = await this.prisma.shadowImportBatch.findUnique({
      where: {
        sourceChecksum_mode_cutoverAt: {
          sourceChecksum: result.sourceChecksum,
          mode: "SHADOW_SEED",
          cutoverAt: new Date(result.cutoverAt),
        },
      },
    });
    if (duplicate) {
      const counts = await this.databaseCounts();
      return {
        ...result,
        seeded: false,
        duplicate: true,
        importBatchId: duplicate.id,
        beforeCounts: counts,
        afterCounts: counts,
      };
    }

    const existingStock = await this.prisma.inventoryBalance.count({
      where: {
        OR: [
          { physicalQty: { not: 0 } },
          { frozenQty: { not: 0 } },
          { inTransitQty: { not: 0 } },
        ],
      },
    });
    if (existingStock > 0 && !replaceExisting)
      throw new DomainError(
        "SHADOW_SEED found existing inventory. Explicitly select controlled Preview replacement or use DRY_RUN.",
        "SHADOW_SEED_REQUIRES_EMPTY_INVENTORY",
      );
    if (replaceExisting && process.env.SHADOW_IMPORT_REPLACE_ENABLED !== "true")
      throw new DomainError(
        "Controlled Preview replacement is disabled. Set SHADOW_IMPORT_REPLACE_ENABLED=true in a non-production environment.",
        "SHADOW_REPLACE_DISABLED",
      );
    const actor = await this.prisma.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
    if (!actor) throw new DomainError("An active import actor is required.", "IMPORT_ACTOR_REQUIRED");

    const beforeCounts = await this.databaseCounts();
    const seeded = await this.prisma.$transaction(
      async (tx) => {
        if (replaceExisting) await this.clearOperationalData(tx);
        const warehouse = await tx.warehouse.upsert({
          where: { code: "SYD" },
          update: { name: "Sydney Service Warehouse", timezone: "Australia/Sydney", active: true },
          create: {
            code: "SYD",
            name: "Sydney Service Warehouse",
            timezone: "Australia/Sydney",
          },
        });
        const runtimeIssues = [...result.issues];
        const addIssue = (
          code: string,
          sheet: string,
          message: string,
          rowNumber?: number,
        ) => runtimeIssues.push({
          code,
          severity: "High",
          sheet,
          rowNumber,
          message,
          classification: "DATA_QUALITY",
        });
        const batch = await tx.shadowImportBatch.create({
          data: {
            sourceFileName: result.sourceFileName,
            sourceChecksum: result.sourceChecksum,
            mode: "SHADOW_SEED",
            cutoverAt: new Date(result.cutoverAt),
            status: "Completed",
            totalRows: result.workbookRows,
            acceptedRows: result.acceptedRows,
            warningRows: result.warningRows,
            rejectedRows: result.rejectedRows,
            notes: "Cutover-style opening snapshot; historical spreadsheet rows remain reference evidence.",
            issues: runtimeIssues as unknown as Prisma.InputJsonValue,
            createdById: actor.id,
          },
        });

        const products = new Map<string, Awaited<ReturnType<typeof tx.product.upsert>>>();
        for (const row of result.productRows) {
          if (!row.sku || !row.model) {
            addIssue("INVALID_PRODUCT_MASTER", "Product_Stock_Master", "Product row is missing SKU or Model.", row.rowNumber);
            continue;
          }
          const product = await tx.product.upsert({
            where: { sku: row.sku },
            update: {
              model: row.model,
              itemType: row.itemType,
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
        for (const row of result.locationRows) {
          if (!row.code) {
            addIssue("INVALID_LOCATION_MASTER", "Location_Master", "Location row is missing Location Code.", row.rowNumber);
            continue;
          }
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
        for (const code of [...new Set(result.workbookViewBalances.flatMap((row) => row.container ? [row.container] : []))]) {
          const container = await tx.container.upsert({
            where: { warehouseId_code: { warehouseId: warehouse.id, code } },
            update: { active: true },
            create: { warehouseId: warehouse.id, code },
          });
          containers.set(code, container);
        }

        let balanceCount = 0;
        let openingTransactionCount = 0;
        for (const [index, row] of result.workbookViewBalances.entries()) {
          if (row.physicalQty < 0 || row.frozenQty < 0) {
            addIssue("NEGATIVE_OPENING_BALANCE", "Current_Stock_Detail", "Negative opening quantities are not permitted.", index + 2);
            continue;
          }
          const location = locations.get(row.location);
          const product = row.sku ? products.get(row.sku) : undefined;
          const container = row.container ? containers.get(row.container) : undefined;
          if (!location || (row.sku && !product) || (row.container && !container)) {
            addIssue(
              "UNKNOWN_OPENING_MASTER_DATA",
              "Current_Stock_Detail",
              `Opening row references unknown master data (${row.location}${row.sku ? ` / ${row.sku}` : ""}).`,
              index + 2,
            );
            continue;
          }
          await tx.inventoryBalance.create({
            data: {
              warehouseId: warehouse.id,
              locationId: location.id,
              containerId: container?.id,
              productId: product?.id,
              itemType: row.itemType,
              condition: row.condition,
              physicalQty: row.physicalQty,
              frozenQty: row.frozenQty,
              legacySerialGap: row.legacySerialGap ?? false,
            },
          });
          balanceCount += 1;
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
              businessReference: `SHADOW:${batch.id}`,
              operationId: `shadow-opening:${batch.id}:${index}`,
              reason: "Shadow opening balance",
              remark: `Source ${result.sourceFileName}; checksum ${result.sourceChecksum}; cutover ${result.cutoverAt}`,
              effectiveAt: new Date(result.cutoverAt),
              createdById: actor.id,
              shadowImportBatchId: batch.id,
            },
          });
          openingTransactionCount += 1;
        }

        let serialCount = 0;
        for (const serial of result.workbookSerials) {
          const product = products.get(serial.sku);
          const location = locations.get(serial.location);
          if (!product || !location) {
            addIssue(
              "UNKNOWN_SERIAL_MASTER_DATA",
              "Stock_Transaction_Log",
              `SN ${serial.serialNumber} references unknown product or location.`,
            );
            continue;
          }
          await tx.serialNumber.upsert({
            where: { serialNumber: serial.serialNumber },
            update: {
              productId: product.id,
              currentWarehouseId: serial.status === "Outbound" ? null : warehouse.id,
              currentLocationId: serial.status === "Outbound" ? null : location.id,
              condition: serial.condition,
              status: serial.status,
              sourceDocument: `SHADOW:${batch.id}`,
            },
            create: {
              serialNumber: serial.serialNumber,
              productId: product.id,
              currentWarehouseId: serial.status === "Outbound" ? undefined : warehouse.id,
              currentLocationId: serial.status === "Outbound" ? undefined : location.id,
              condition: serial.condition,
              status: serial.status,
              sourceDocument: `SHADOW:${batch.id}`,
            },
          });
          serialCount += 1;
        }

        const pickupStatus = new Map<string, "Draft" | "Ready" | "Picked_Up">();
        for (const order of result.activeOutboundOrders) {
          if (!order.pickupCode) continue;
          const current = pickupStatus.get(order.pickupCode);
          if (order.status === "Outbound") pickupStatus.set(order.pickupCode, "Picked_Up");
          else if (order.status === "Prepared" && current !== "Picked_Up") pickupStatus.set(order.pickupCode, "Draft");
          else if (!current) pickupStatus.set(order.pickupCode, "Draft");
        }
        const pickupBatches = new Map<string, Awaited<ReturnType<typeof tx.pickupBatch.upsert>>>();
        for (const row of result.pickupBatches) {
          const status = pickupStatus.get(row.pickupCode) ?? "Draft";
          const pickup = await tx.pickupBatch.upsert({
            where: { code: row.pickupCode },
            update: {
              warehouseId: warehouse.id,
              status,
              readyAt: status === "Ready" ? new Date(result.cutoverAt) : null,
              pickedUpAt: status === "Picked_Up" ? new Date(result.cutoverAt) : null,
              remark: `Shadow migration ${batch.id}`,
            },
            create: {
              code: row.pickupCode,
              warehouseId: warehouse.id,
              status,
              readyAt: status === "Ready" ? new Date(result.cutoverAt) : undefined,
              pickedUpAt: status === "Picked_Up" ? new Date(result.cutoverAt) : undefined,
              remark: `Shadow migration ${batch.id}`,
            },
          });
          pickupBatches.set(row.pickupCode, pickup);
        }

        let outboundOrderCount = 0;
        let outboundLineCount = 0;
        for (const orderRow of result.activeOutboundOrders) {
          const validLines = orderRow.lines.filter((line) => line.sku && products.has(line.sku));
          for (const line of orderRow.lines)
            if (!line.sku || !products.has(line.sku))
              addIssue("UNKNOWN_OUTBOUND_SKU", "Stock_Transaction_Log", `SH ${orderRow.shNo} line has an unknown SKU.`);
          if (!validLines.length) continue;
          const erpWarehouses = [...new Set(validLines.map((line) => line.erpWarehouse).filter(Boolean))] as string[];
          const status =
            orderRow.status === "Review_Required" ? "Exception" :
            orderRow.status === "Outbound" ? "Outbound" :
            orderRow.status === "Prepared" ? "Prepared" : "Pending_Allocation";
          const prepared = status === "Prepared" || status === "Outbound";
          const outbound = status === "Outbound";
          const order = await tx.outboundOrder.create({
            data: {
              shNo: orderRow.shNo,
              pickupCode: orderRow.pickupCode,
              pickupBatchId: orderRow.pickupCode ? pickupBatches.get(orderRow.pickupCode)?.id : undefined,
              erpWarehouse: erpWarehouses.join(" / ") || "Unmapped",
              warehouseId: warehouse.id,
              status,
              erpSyncStatus: outbound ? "Pending" : "Pending",
              importedAt: new Date(result.cutoverAt),
              allocatedAt: prepared ? new Date(result.cutoverAt) : undefined,
              preparedAt: prepared ? new Date(result.cutoverAt) : undefined,
              readyForPickupAt: undefined,
              outboundAt: outbound ? orderRow.outboundAt : undefined,
              customerLabel: "Workbook migration evidence",
            },
          });
          outboundOrderCount += 1;
          for (const lineRow of validLines) {
            const product = products.get(lineRow.sku!)!;
            const allocatedQty = prepared
              ? lineRow.sourceAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
              : 0;
            const line = await tx.outboundOrderLine.create({
              data: {
                outboundOrderId: order.id,
                productId: product.id,
                requiredQty: lineRow.quantity,
                requiredCondition: lineRow.condition,
                erpWarehouse: lineRow.erpWarehouse ?? order.erpWarehouse,
                allocatedQty,
                preparedQty: prepared ? allocatedQty : 0,
                dispatchedQty: outbound ? lineRow.quantity : 0,
              },
            });
            outboundLineCount += 1;
            if (!prepared) continue;
            for (const allocationRow of lineRow.sourceAllocations) {
              const location = locations.get(allocationRow.location);
              if (!location) {
                addIssue("UNKNOWN_OUTBOUND_LOCATION", "Stock_Transaction_Log", `SH ${orderRow.shNo} references unknown location ${allocationRow.location}.`);
                continue;
              }
              let serialAllocated = 0;
              for (const serialNumber of allocationRow.serialNumbers) {
                const serial = await tx.serialNumber.findUnique({ where: { serialNumber } });
                if (!serial) continue;
                await tx.outboundAllocation.create({
                  data: {
                    outboundOrderLineId: line.id,
                    locationId: location.id,
                    serialNumberId: serial.id,
                    quantity: 1,
                    preparedAt: new Date(result.cutoverAt),
                    dispatchedAt: outbound ? orderRow.outboundAt : undefined,
                  },
                });
                await tx.serialNumber.update({
                  where: { id: serial.id },
                  data: outbound
                    ? { status: "Outbound", currentWarehouseId: null, currentLocationId: null }
                    : { status: "Prepared", currentWarehouseId: warehouse.id, currentLocationId: location.id },
                });
                serialAllocated += 1;
              }
              const aggregateRemainder = Math.max(0, allocationRow.quantity - serialAllocated);
              if (aggregateRemainder > 0)
                await tx.outboundAllocation.create({
                  data: {
                    outboundOrderLineId: line.id,
                    locationId: location.id,
                    quantity: aggregateRemainder,
                    preparedAt: new Date(result.cutoverAt),
                    dispatchedAt: outbound ? orderRow.outboundAt : undefined,
                  },
                });
            }
          }
        }

        let repairCount = 0;
        const seenRepairSerials = new Set<string>();
        for (const repair of result.repairItems) {
          if (!repair.createRepairJob || seenRepairSerials.has(repair.serialNumber)) continue;
          seenRepairSerials.add(repair.serialNumber);
          const serial = await tx.serialNumber.findUnique({ where: { serialNumber: repair.serialNumber } });
          const product = repair.sku ? products.get(repair.sku) : undefined;
          const location = repair.location ? locations.get(repair.location) : undefined;
          if (!serial || !product || !location) {
            addIssue("UNSUPPORTED_REPAIR_EVIDENCE", "Stock_Transaction_Log", `Repair evidence for ${repair.serialNumber} is incomplete.`);
            continue;
          }
          await tx.repairJob.create({
            data: {
              serialNumberId: serial.id,
              warehouseId: warehouse.id,
              productId: product.id,
              receivedLocationId: location.id,
              currentLocationId: location.id,
              status: "Pending_Repair",
              source: "Legacy_Manual",
              receivedAt: new Date(result.cutoverAt),
              remark: `Shadow migration ${batch.id}; source workbook evidence.`,
            },
          });
          repairCount += 1;
        }

        await tx.shadowImportBatch.update({
          where: { id: batch.id },
          data: {
            issues: runtimeIssues as unknown as Prisma.InputJsonValue,
            warningRows: runtimeIssues.filter((issue) => ["Medium", "Low"].includes(issue.severity)).length,
            rejectedRows: runtimeIssues.filter((issue) => ["Critical", "High"].includes(issue.severity)).length,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            operation: "SHADOW_SEED",
            entityType: "ShadowImportBatch",
            entityId: batch.id,
            businessReference: `SHADOW:${batch.id}`,
            after: {
              checksum: result.sourceChecksum,
              cutoverAt: result.cutoverAt,
              products: products.size,
              locations: locations.size,
              balances: balanceCount,
              openingTransactions: openingTransactionCount,
              serials: serialCount,
              outboundOrders: outboundOrderCount,
              outboundLines: outboundLineCount,
              pickupBatches: pickupBatches.size,
              repairJobs: repairCount,
              migrationExcludedRows: result.migrationExcludedRows,
            },
            remark: "Partial Shadow migration imported valid entities and retained invalid rows as diagnostics.",
          },
        });
        return {
          importBatchId: batch.id,
          migrationCounts: {
            products: products.size,
            locations: locations.size,
            balances: balanceCount,
            openingTransactions: openingTransactionCount,
            serials: serialCount,
            outboundOrders: outboundOrderCount,
            outboundLines: outboundLineCount,
            pickupBatches: pickupBatches.size,
            repairJobs: repairCount,
            migrationExcludedRows: result.migrationExcludedRows,
            issues: runtimeIssues.length,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 },
    );
    const afterCounts = await this.databaseCounts();
    return { ...result, seeded: true, duplicate: false, ...seeded, beforeCounts, afterCounts };
  }

  private databaseCounts() {
    return Promise.all([
      this.prisma.product.count(),
      this.prisma.location.count(),
      this.prisma.inventoryBalance.count(),
      this.prisma.serialNumber.count(),
      this.prisma.outboundOrder.count(),
      this.prisma.outboundOrderLine.count(),
      this.prisma.pickupBatch.count(),
      this.prisma.repairJob.count(),
      this.prisma.stockTransaction.count({ where: { transactionType: "Opening" } }),
    ]).then(([products, locations, balances, serials, outboundOrders, outboundLines, pickupBatches, repairJobs, openingTransactions]) => ({
      products,
      locations,
      balances,
      serials,
      outboundOrders,
      outboundLines,
      pickupBatches,
      repairJobs,
      openingTransactions,
    }));
  }

  private async clearOperationalData(tx: Prisma.TransactionClient) {
    await tx.auditLog.deleteMany();
    await tx.exception.deleteMany();
    await tx.eRPSyncJob.deleteMany();
    await tx.eRPDocument.deleteMany();
    await tx.stockTransaction.deleteMany();
    await tx.transferSerial.deleteMany();
    await tx.transferOrderLine.deleteMany();
    await tx.transferOrder.deleteMany();
    await tx.repairReturn.deleteMany();
    await tx.repairJob.deleteMany();
    await tx.outboundAllocation.deleteMany();
    await tx.outboundOrderLine.deleteMany();
    await tx.outboundOrder.deleteMany();
    await tx.pickupBatch.deleteMany();
    await tx.operationalSnapshot.deleteMany();
    await tx.repairWeeklyMetrics.deleteMany();
    await tx.stocktakeLine.deleteMany();
    await tx.stocktake.deleteMany();
    await tx.serialNumber.deleteMany();
    await tx.inventoryBalance.deleteMany();
    await tx.pickupSequence.deleteMany();
    await tx.eRPWarehouseMapping.deleteMany();
    await tx.container.deleteMany();
    await tx.location.deleteMany();
    await tx.product.deleteMany();
    await tx.shadowImportBatch.deleteMany();
  }
}
