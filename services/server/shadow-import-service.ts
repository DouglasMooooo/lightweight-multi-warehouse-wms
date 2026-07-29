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
  }) {
    const workbook = await readWorkbookBuffer(input.buffer, input.sourceFileName);
    const result = analyzeWorkbook(workbook, {
      mode: input.mode,
      cutoverAt: input.cutoverAt,
      wms: await this.reference(),
    });
    if (input.mode === "DRY_RUN") return { ...result, seeded: false, duplicate: false };
    return this.seed(result);
  }

  private async seed(result: ReturnType<typeof analyzeWorkbook>) {
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
    if (result.rejectedRows > 0)
      throw new DomainError(
        "SHADOW_SEED rejected because the workbook has High or Critical import issues.",
        "SHADOW_SEED_HAS_REJECTIONS",
      );
    const duplicate = await this.prisma.shadowImportBatch.findUnique({
      where: {
        sourceChecksum_mode_cutoverAt: {
          sourceChecksum: result.sourceChecksum,
          mode: "SHADOW_SEED",
          cutoverAt: new Date(result.cutoverAt),
        },
      },
    });
    if (duplicate) return { ...result, seeded: false, duplicate: true, importBatchId: duplicate.id };

    const existingStock = await this.prisma.inventoryBalance.count({
      where: {
        OR: [
          { physicalQty: { not: 0 } },
          { frozenQty: { not: 0 } },
          { inTransitQty: { not: 0 } },
        ],
      },
    });
    if (existingStock > 0)
      throw new DomainError(
        "SHADOW_SEED requires an empty shadow inventory database; use DRY_RUN for an active WMS.",
        "SHADOW_SEED_REQUIRES_EMPTY_INVENTORY",
      );
    const actor = await this.prisma.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
    if (!actor) throw new DomainError("An active import actor is required.", "IMPORT_ACTOR_REQUIRED");

    const importBatchId = await this.prisma.$transaction(
      async (tx) => {
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
            issues: result.issues as unknown as Prisma.InputJsonValue,
            createdById: actor.id,
          },
        });
        for (const [index, row] of result.workbookViewBalances.entries()) {
          if (row.physicalQty < 0 || row.frozenQty < 0)
            throw new DomainError("Negative opening quantities are not permitted.", "NEGATIVE_OPENING_BALANCE");
          const warehouse = await tx.warehouse.findUnique({ where: { code: row.warehouse } });
          const location = warehouse
            ? await tx.location.findUnique({
                where: { warehouseId_code: { warehouseId: warehouse.id, code: row.location } },
              })
            : null;
          const product = row.sku ? await tx.product.findUnique({ where: { sku: row.sku } }) : null;
          const container = row.container && warehouse
            ? await tx.container.findUnique({
                where: { warehouseId_code: { warehouseId: warehouse.id, code: row.container } },
              })
            : null;
          if (!warehouse || !location || (row.sku && !product) || (row.container && !container))
            throw new DomainError(
              `Opening row ${index + 1} references unknown master data.`,
              "UNKNOWN_OPENING_MASTER_DATA",
            );
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
        }
        for (const serial of result.workbookSerials) {
          const product = await tx.product.findUnique({ where: { sku: serial.sku } });
          const warehouse = await tx.warehouse.findUnique({ where: { code: serial.warehouse } });
          const location = warehouse
            ? await tx.location.findUnique({
                where: { warehouseId_code: { warehouseId: warehouse.id, code: serial.location } },
              })
            : null;
          if (!product || !warehouse || !location) continue;
          await tx.serialNumber.upsert({
            where: { serialNumber: serial.serialNumber },
            update: {},
            create: {
              serialNumber: serial.serialNumber,
              productId: product.id,
              currentWarehouseId: warehouse.id,
              currentLocationId: location.id,
              condition: serial.condition,
              status: serial.status,
              sourceDocument: `SHADOW:${batch.id}`,
            },
          });
        }
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
              openingRows: result.workbookViewBalances.length,
            },
            remark: "Shadow opening balances imported with immutable Opening transaction evidence.",
          },
        });
        return batch.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { ...result, seeded: true, duplicate: false, importBatchId };
  }
}
