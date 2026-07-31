import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { classifyFaultyReceipt, validateNewInboundBatch } from "@/domain/bulk-operations";
import { normalizeSerialBatch } from "@/domain/bulk-serial";
import { DomainError } from "@/domain/errors";
import type { ERPAdapter } from "@/integrations/erp-adapter";
import { createERPAdapter } from "@/integrations/erp-adapter-factory";
import { getPrisma } from "@/lib/prisma";
import { InventoryRepository } from "@/repositories/inventory-repository";

const batchReference = (warehouseCode: string) =>
  `SNB-${warehouseCode}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;

async function actor(tx: Prisma.TransactionClient) {
  const value = await tx.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (!value) throw new DomainError("An active audit actor is required.", "AUDIT_ACTOR_REQUIRED");
  return value;
}

export class BulkOperationsService {
  constructor(
    private readonly prisma: PrismaClient = getPrisma(),
    private readonly erp: ERPAdapter = createERPAdapter(),
  ) {}

  async context(warehouseCode: string) {
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { code: warehouseCode } });
    const [products, locations, outboundOrders] = await Promise.all([
      this.prisma.product.findMany({
        where: { active: true, serialTrackingRequired: true },
        select: { id: true, sku: true, model: true },
        orderBy: { sku: "asc" },
      }),
      this.prisma.location.findMany({
        where: { warehouseId: warehouse.id, active: true },
        select: { id: true, code: true, serviceZone: true },
        orderBy: { code: "asc" },
      }),
      this.prisma.outboundOrder.findMany({
        where: {
          warehouseId: warehouse.id,
          status: { in: ["Imported", "Pending_Allocation", "Allocated", "Prepared", "Partially_Prepared", "Ready_for_Pickup"] },
        },
        select: {
          id: true,
          shNo: true,
          lines: {
            where: { product: { serialTrackingRequired: true } },
            select: {
              id: true,
              requiredQty: true,
              allocatedQty: true,
              requiredCondition: true,
              product: { select: { sku: true, model: true } },
              allocations: { where: { dispatchedAt: null }, select: { serialNumberId: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return {
      warehouse: { code: warehouse.code, timezone: warehouse.timezone },
      products,
      locations,
      outboundOrders: outboundOrders.map((order) => ({
        id: order.id,
        shNo: order.shNo,
        lines: order.lines.map((line) => ({
          id: line.id,
          sku: line.product.sku,
          model: line.product.model,
          requiredQty: Number(line.requiredQty),
          allocatedQty: Number(line.allocatedQty),
          assignedQty: line.allocations.filter((row) => row.serialNumberId).length,
          requiredCondition: line.requiredCondition,
        })),
      })),
    };
  }

  async validateNewInbound(input: {
    warehouseCode: string;
    locationCode: string;
    sku: string;
    expectedQty: number;
    serialNumbers: string[];
    sourceDocument?: string;
  }) {
    const serialNumbers = normalizeSerialBatch(input.serialNumbers);
    const [warehouse, product] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { code: input.warehouseCode } }),
      this.prisma.product.findUnique({ where: { sku: input.sku } }),
    ]);
    const location = warehouse
      ? await this.prisma.location.findUnique({
          where: { warehouseId_code: { warehouseId: warehouse.id, code: input.locationCode } },
        })
      : null;
    if (!warehouse || !location) throw new DomainError("Warehouse or location does not exist.", "INVALID_LOCATION");
    if (!product?.active) throw new DomainError("Unknown or inactive SKU.", "INVALID_SKU");
    if (!product.serialTrackingRequired)
      throw new DomainError("Bulk SN inbound requires a serial-tracked product.", "SERIAL_TRACKING_NOT_REQUIRED");
    if (!Number.isInteger(input.expectedQty) || input.expectedQty <= 0)
      throw new DomainError("Expected quantity must be a positive whole number.", "INVALID_QUANTITY");
    const existing = await this.prisma.serialNumber.findMany({
      where: { serialNumber: { in: [...new Set(serialNumbers)] } },
      select: { serialNumber: true },
    });
    const rows = validateNewInboundBatch({
      serialNumbers,
      expectedQty: input.expectedQty,
      existingSerialNumbers: new Set(existing.map((row) => row.serialNumber)),
    });
    return {
      mode: "NEW_INBOUND" as const,
      condition: "New" as const,
      expectedQty: input.expectedQty,
      detectedQty: serialNumbers.length,
      summary: {
        total: rows.length,
        valid: rows.filter((row) => row.valid).length,
        invalid: rows.filter((row) => !row.valid).length,
      },
      results: rows,
    };
  }

  async commitNewInbound(input: {
    warehouseCode: string;
    locationCode: string;
    sku: string;
    expectedQty: number;
    serialNumbers: string[];
    sourceDocument?: string;
  }) {
    const serialNumbers = normalizeSerialBatch(input.serialNumbers);
    return this.prisma.$transaction(async (tx) => {
      const validationService = new BulkOperationsService(tx as unknown as PrismaClient, this.erp);
      const validation = await validationService.validateNewInbound(input);
      if (validation.summary.invalid || validation.summary.valid !== input.expectedQty)
        throw new DomainError("Inbound batch validation changed or requires attention.", "BULK_INBOUND_REVALIDATION_FAILED");
      const [who, warehouse, product] = await Promise.all([
        actor(tx),
        tx.warehouse.findUniqueOrThrow({ where: { code: input.warehouseCode } }),
        tx.product.findUniqueOrThrow({ where: { sku: input.sku } }),
      ]);
      const location = await tx.location.findUniqueOrThrow({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: input.locationCode } },
      });
      const reference = batchReference(warehouse.code);
      const inventory = new InventoryRepository(tx);
      const balance = await inventory.applyDelta({
        warehouseId: warehouse.id,
        locationId: location.id,
        productId: product.id,
        itemType: product.itemType,
        condition: "New",
      }, { physicalDelta: input.expectedQty });
      await tx.serialNumber.createMany({
        data: serialNumbers.map((serialNumber) => ({
          serialNumber,
          productId: product.id,
          currentWarehouseId: warehouse.id,
          currentLocationId: location.id,
          condition: "New",
          status: "In_Stock",
          sourceDocument: input.sourceDocument?.trim() || reference,
        })),
      });
      await tx.stockTransaction.create({
        data: {
          transactionType: "Inbound",
          warehouseId: warehouse.id,
          targetLocationId: location.id,
          productId: product.id,
          itemType: product.itemType,
          condition: "New",
          quantity: input.expectedQty,
          physicalDelta: input.expectedQty,
          businessReference: input.sourceDocument?.trim() || reference,
          operationId: reference,
          reason: "Bulk New Stock Inbound",
          remark: `${input.expectedQty} physical units and ${serialNumbers.length} supplied serial identities received as one batch.`,
          createdById: who.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: who.id,
          operation: "Bulk new stock inbound",
          entityType: "InventoryBalance",
          entityId: balance.id,
          businessReference: reference,
          after: { sku: product.sku, location: location.code, quantity: input.expectedQty, serialNumbers, sourceDocument: input.sourceDocument || null },
          remark: `Batch ${reference} received ${input.expectedQty} New units in one inventory movement.`,
        },
      });
      return { batchReference: reference, received: input.expectedQty, condition: "New", locationCode: location.code };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async validateFaulty(input: { warehouseCode: string; locationCode?: string; serialNumbers: string[] }) {
    const serialNumbers = normalizeSerialBatch(input.serialNumbers);
    const unique = [...new Set(serialNumbers)];
    const [warehouse, existing] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { code: input.warehouseCode }, select: { id: true, code: true } }),
      this.prisma.serialNumber.findMany({
        where: { serialNumber: { in: unique } },
        include: {
          product: true,
          currentWarehouse: { select: { code: true } },
          repairReturns: { where: { active: true }, select: { id: true } },
        },
      }),
    ]);
    if (!warehouse) throw new DomainError("Warehouse does not exist.", "INVALID_WAREHOUSE");
    const existingBySn = new Map(existing.map((row) => [row.serialNumber, row]));
    const outboundHistory = existing.length
      ? await this.prisma.outboundAllocation.findMany({
          where: { serialNumberId: { in: existing.map((row) => row.id) }, dispatchedAt: { not: null } },
          select: {
            serialNumberId: true,
            dispatchedAt: true,
            outboundOrderLine: { select: { outboundOrder: { select: { shNo: true } } } },
          },
          orderBy: { dispatchedAt: "desc" },
        })
      : [];
    const shBySerialId = new Map<string, string>();
    for (const allocation of outboundHistory) {
      if (!shBySerialId.has(allocation.serialNumberId!))
        shBySerialId.set(allocation.serialNumberId!, allocation.outboundOrderLine.outboundOrder.shNo);
    }
    const erpBySn = new Map<string, Awaited<ReturnType<ERPAdapter["findBySerialNumber"]>>>();
    const erpFailures = new Set<string>();
    await Promise.all(unique.map(async (serialNumber) => {
      const current = existingBySn.get(serialNumber);
      const knownSh =
        shBySerialId.get(current?.id ?? "") ??
        (current?.sourceDocument?.startsWith("SH-") ? current.sourceDocument : undefined);
      if (current?.product.sku && knownSh) return;
      try {
        erpBySn.set(serialNumber, await this.erp.findBySerialNumber(serialNumber));
      } catch {
        erpFailures.add(serialNumber);
        erpBySn.set(serialNumber, null);
      }
    }));
    const seen = new Set<string>();
    const results = [];
    for (const serialNumber of serialNumbers) {
      const duplicateInBatch = seen.has(serialNumber);
      seen.add(serialNumber);
      const current = existingBySn.get(serialNumber);
      const erp = erpBySn.get(serialNumber) ?? null;
      const resolvedSku = erp?.sku ?? current?.product.sku;
      const resolvedShNo =
        erp?.relatedShNo ??
        shBySerialId.get(current?.id ?? "") ??
        (current?.sourceDocument?.startsWith("SH-") ? current.sourceDocument : undefined);
      const decision = classifyFaultyReceipt({
        duplicateInBatch,
        existingStatus: current?.status,
        activeRepairReturn: Boolean(current?.repairReturns.length),
        existingSku: current?.product.sku,
        resolvedSku,
        resolvedShNo,
        erpFound: Boolean(erp),
        erpLookupFailed: erpFailures.has(serialNumber),
        existsInWms: Boolean(current),
        wrongWarehouse: Boolean(
          current?.currentWarehouse?.code &&
          current.currentWarehouse.code !== warehouse.code,
        ),
      });
      results.push({
        serialNumber,
        valid: decision.valid,
        code: decision.code,
        erpFound: Boolean(erp),
        shNo: resolvedShNo,
        sku: resolvedSku,
        model: erp?.model ?? current?.product.model,
        existingStatus: current?.status,
        previousStatus: current?.status ?? "Not registered",
        returnStatus: "Repair",
        destination: input.locationCode || "REPAIR-01",
        repairLocation: input.locationCode || "REPAIR-01",
        validationResult: decision.code,
      });
    }
    return {
      mode: "FAULTY_RECEIVING" as const,
      condition: "Repair" as const,
      status: "Repair" as const,
      partialAcceptance: true,
      summary: {
        total: results.length,
        valid: results.filter((row) => row.valid).length,
        invalid: results.filter((row) => !row.valid).length,
      },
      results,
    };
  }

  async commitFaulty(input: {
    warehouseCode: string;
    locationCode?: string;
    serialNumbers: string[];
    acceptSerialNumbers: string[];
  }) {
    const accepted = new Set(normalizeSerialBatch(input.acceptSerialNumbers));
    if (!accepted.size) throw new DomainError("Select at least one valid faulty unit.", "EMPTY_ACCEPTED_BATCH");
    return this.prisma.$transaction(async (tx) => {
      const validationService = new BulkOperationsService(tx as unknown as PrismaClient, this.erp);
      const validation = await validationService.validateFaulty(input);
      const selected = validation.results.filter((row) => accepted.has(row.serialNumber) && row.valid);
      if (selected.length !== accepted.size || selected.some((row) => !row.sku))
        throw new DomainError("Selected faulty rows changed or require Manual Review.", "FAULTY_BATCH_REVALIDATION_FAILED");
      const [who, warehouse] = await Promise.all([
        actor(tx),
        tx.warehouse.findUniqueOrThrow({ where: { code: input.warehouseCode } }),
      ]);
      const location = await tx.location.findUniqueOrThrow({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: input.locationCode || "REPAIR-01" } },
      });
      if (!location.serviceZone)
        throw new DomainError("Faulty receiving requires a Repair/service location.", "INVALID_REPAIR_LOCATION");
      const reference = batchReference(warehouse.code);
      const inventory = new InventoryRepository(tx);
      const products = await tx.product.findMany({
        where: { sku: { in: [...new Set(selected.map((row) => row.sku!))] } },
      });
      const productBySku = new Map(products.map((product) => [product.sku, product]));
      if (products.length !== new Set(selected.map((row) => row.sku)).size)
        throw new DomainError("One or more resolved SKUs no longer exist.", "SKU_NOT_FOUND");
      const quantityByProduct = new Map<string, number>();
      for (const row of selected)
        quantityByProduct.set(row.sku!, (quantityByProduct.get(row.sku!) ?? 0) + 1);
      for (const [sku, quantity] of quantityByProduct) {
        const product = productBySku.get(sku)!;
        await inventory.applyDelta({
          warehouseId: warehouse.id,
          locationId: location.id,
          productId: product.id,
          itemType: product.itemType,
          condition: "Repair",
        }, { physicalDelta: quantity });
      }
      for (const row of selected) {
        const product = productBySku.get(row.sku!)!;
        const existing = await tx.serialNumber.findUnique({ where: { serialNumber: row.serialNumber } });
        const serial = existing
          ? await tx.serialNumber.update({
              where: { id: existing.id },
              data: { currentWarehouseId: warehouse.id, currentLocationId: location.id, condition: "Repair", status: "Repair", sourceDocument: row.shNo || reference },
            })
          : await tx.serialNumber.create({
              data: { serialNumber: row.serialNumber, productId: product.id, currentWarehouseId: warehouse.id, currentLocationId: location.id, condition: "Repair", status: "Repair", sourceDocument: row.shNo || reference },
            });
        const repairJob = await tx.repairJob.create({
          data: {
            serialNumberId: serial.id, warehouseId: warehouse.id, productId: product.id,
            receivedLocationId: location.id, currentLocationId: location.id,
            originalShNo: row.shNo, status: "Pending_Repair", source: "Native_Return",
            remark: `Received in faulty batch ${reference}.`,
          },
        });
        await tx.repairReturn.create({
          data: {
            serialNumberId: serial.id, productId: product.id, locationId: location.id,
            relatedShNo: row.shNo, erpMatched: row.erpFound, active: true,
            repairJobId: repairJob.id, remark: `Received in faulty batch ${reference}.`,
          },
        });
        await tx.stockTransaction.create({
          data: {
            transactionType: "Return_to_Repair", warehouseId: warehouse.id,
            targetLocationId: location.id, productId: product.id, serialNumberId: serial.id,
            itemType: product.itemType, condition: "Repair", quantity: 1, physicalDelta: 1,
            businessReference: row.shNo || reference, operationId: reference,
            remark: "Faulty unit received to repair inventory in a controlled batch.", createdById: who.id,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: who.id, operation: "Bulk faulty receiving", entityType: "RepairReturnBatch",
          entityId: reference, businessReference: reference,
          after: { submitted: validation.summary.total, accepted: selected.length, manualReview: validation.summary.invalid, serialNumbers: selected.map((row) => row.serialNumber) },
          remark: `Accepted ${selected.length} valid faulty units; ${validation.summary.invalid} rows retained for attention.`,
        },
      });
      return { batchReference: reference, accepted: selected.length, needsAttention: validation.summary.invalid };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async commitLegacyRepairGood(input: {
    warehouseCode: string;
    locationCode: string;
    sku: string;
    quantity: number;
    serialNumbers: string[];
    reason: string;
  }) {
    const serialNumbers = normalizeSerialBatch(input.serialNumbers);
    if (!input.reason.trim()) throw new DomainError("A legacy recognition reason is required.", "REASON_REQUIRED");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0)
      throw new DomainError("Quantity must be a positive whole number.", "INVALID_QUANTITY");
    return this.prisma.$transaction(async (tx) => {
      const [who, warehouse, product] = await Promise.all([
        actor(tx),
        tx.warehouse.findUniqueOrThrow({ where: { code: input.warehouseCode } }),
        tx.product.findUniqueOrThrow({ where: { sku: input.sku } }),
      ]);
      if (product.serialTrackingRequired && serialNumbers.length !== input.quantity)
        throw new DomainError("Serial-tracked Repair_Good quantity must match the supplied SN count.", "QUANTITY_MISMATCH");
      const location = await tx.location.findUniqueOrThrow({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: input.locationCode } },
      });
      const existing = serialNumbers.length
        ? await tx.serialNumber.findMany({
            where: { serialNumber: { in: [...new Set(serialNumbers)] } },
            include: { repairJobs: { where: { status: { in: ["Received", "Pending_Repair", "In_Repair"] } }, select: { id: true } } },
          })
        : [];
      if (existing.some((row) => row.repairJobs.length))
        throw new DomainError("Tracked RepairJobs must use normal Repair completion.", "NORMAL_REPAIR_LIFECYCLE_REQUIRED");
      if (existing.length)
        throw new DomainError("Existing SN identities cannot be reclassified through legacy recognition.", "LEGACY_SN_ALREADY_EXISTS");
      const duplicates = serialNumbers.filter((value, index) => serialNumbers.indexOf(value) !== index);
      if (duplicates.length) throw new DomainError("Duplicate serial number in legacy batch.", "DUPLICATE_IN_BATCH");
      const reference = batchReference(warehouse.code);
      const inventory = new InventoryRepository(tx);
      const balance = await inventory.applyDelta({
        warehouseId: warehouse.id, locationId: location.id, productId: product.id,
        itemType: product.itemType, condition: "Repair_Good",
      }, { physicalDelta: input.quantity });
      if (serialNumbers.length)
        await tx.serialNumber.createMany({
          data: serialNumbers.map((serialNumber) => ({
            serialNumber, productId: product.id, currentWarehouseId: warehouse.id,
            currentLocationId: location.id, condition: "Repair_Good", status: "In_Stock",
            sourceDocument: reference,
          })),
        });
      await tx.stockTransaction.create({
        data: {
          transactionType: "RepairGood_Adjustment_In", warehouseId: warehouse.id,
          targetLocationId: location.id, productId: product.id, itemType: product.itemType,
          condition: "Repair_Good", targetCondition: "Repair_Good", quantity: input.quantity,
          physicalDelta: input.quantity, businessReference: reference, operationId: reference,
          reason: input.reason.trim(), remark: "Controlled legacy Repair_Good recognition; no native repair lifecycle was fabricated.",
          createdById: who.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: who.id, operation: "Legacy Repair_Good recognition", entityType: "InventoryBalance",
          entityId: balance.id, businessReference: reference,
          after: { sku: product.sku, quantity: input.quantity, serialNumbers, reason: input.reason.trim() },
          remark: "Explicit legacy/manual recognition; tracked native repairs remain excluded.",
        },
      });
      return { batchReference: reference, recognized: input.quantity, condition: "Repair_Good" };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
