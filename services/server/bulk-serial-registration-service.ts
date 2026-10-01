import "server-only";

import { Prisma, type PrismaClient, type StockCondition } from "@/generated/prisma/client";
import { normalizeSerialBatch } from "@/domain/bulk-serial";
import {
  evaluateRegistrationBatch,
  type BulkRegistrationCode,
} from "@/domain/bulk-serial-registration";
import { DomainError } from "@/domain/errors";
import {
  isPhysicallyPresentSerialStatus,
  registeredSerialStatusForCondition,
} from "@/domain/serial-policy";
import { getPrisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export interface BulkRegistrationResult {
  serialNumber: string;
  valid: boolean;
  code: BulkRegistrationCode;
  message: string;
}

export interface BulkRegistrationValidation {
  warehouseCode: string;
  locationCode: string;
  sku: string;
  condition: StockCondition;
  physicalQty: number;
  registeredPhysicalSerials: number;
  availableRegistrationCapacity: number;
  summary: { total: number; valid: number; invalid: number };
  results: BulkRegistrationResult[];
}

export async function validateRegistration(
  db: Db,
  input: {
    warehouseCode: string;
    locationCode: string;
    sku: string;
    condition: StockCondition;
    serialNumbers: string[];
  },
): Promise<BulkRegistrationValidation> {
  const serialNumbers = normalizeSerialBatch(input.serialNumbers);
  const [warehouse, product] = await Promise.all([
    db.warehouse.findUnique({ where: { code: input.warehouseCode } }),
    db.product.findUnique({ where: { sku: input.sku } }),
  ]);
  const location = warehouse
    ? await db.location.findUnique({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: input.locationCode } },
      })
    : null;
  const contextError:
    | Pick<BulkRegistrationResult, "code" | "message">
    | undefined =
    !product
      ? { code: "INVALID_SKU", message: "SKU does not exist." }
      : !warehouse || !location
        ? { code: "INVALID_LOCATION", message: "Warehouse or physical location does not exist." }
        : !product.serialTrackingRequired
          ? { code: "SERIAL_TRACKING_NOT_REQUIRED", message: "Product is not configured for serial tracking." }
          : !["New", "Repair_Good", "Repair"].includes(input.condition)
            ? { code: "INVALID_CONDITION", message: "Condition does not support serial registration." }
            : undefined;

  const physicalQty =
    contextError || !warehouse || !location || !product
      ? 0
      : Number((await db.inventoryBalance.aggregate({
          where: {
            warehouseId: warehouse.id,
            locationId: location.id,
            productId: product.id,
            condition: input.condition,
          },
          _sum: { physicalQty: true },
        }))._sum.physicalQty ?? 0);
  const physicallyPresent = !warehouse || !location || !product
    ? []
    : await db.serialNumber.findMany({
        where: {
          currentWarehouseId: warehouse.id,
          currentLocationId: location.id,
          productId: product.id,
          condition: input.condition,
        },
        select: { status: true },
      });
  const registeredPhysicalSerials = physicallyPresent.filter((row) =>
    isPhysicallyPresentSerialStatus(row.status),
  ).length;
  const availableRegistrationCapacity = Math.max(0, physicalQty - registeredPhysicalSerials);
  const existing = serialNumbers.length
    ? await db.serialNumber.findMany({
        where: { serialNumber: { in: [...new Set(serialNumbers)] } },
        select: { serialNumber: true },
      })
    : [];
  const existingNumbers = new Set(existing.map((row) => row.serialNumber));
  const results: BulkRegistrationResult[] = evaluateRegistrationBatch({
    serialNumbers,
    existingSerialNumbers: existingNumbers,
    availableCapacity: availableRegistrationCapacity,
    contextError,
  });
  return {
    warehouseCode: input.warehouseCode,
    locationCode: input.locationCode,
    sku: input.sku,
    condition: input.condition,
    physicalQty,
    registeredPhysicalSerials,
    availableRegistrationCapacity,
    summary: {
      total: results.length,
      valid: results.filter((row) => row.valid).length,
      invalid: results.filter((row) => !row.valid).length,
    },
    results,
  };
}

export class BulkSerialRegistrationService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  validate(input: {
    warehouseCode: string;
    locationCode: string;
    sku: string;
    condition: StockCondition;
    serialNumbers: string[];
  }) {
    return validateRegistration(this.prisma, input);
  }

  async commit(input: {
    warehouseCode: string;
    locationCode: string;
    sku: string;
    condition: StockCondition;
    serialNumbers: string[];
  }) {
    const serialNumbers = normalizeSerialBatch(input.serialNumbers);
    if (!serialNumbers.length)
      throw new DomainError("At least one serial number is required.", "EMPTY_SERIAL_BATCH");
    return this.prisma.$transaction(async (tx) => {
      const validation = await validateRegistration(tx, { ...input, serialNumbers });
      if (validation.summary.invalid)
        throw new DomainError(
          `Registration batch is invalid; ${validation.summary.invalid} serial number(s) require attention.`,
          "BULK_SERIAL_REGISTRATION_FAILED",
        );
      const [warehouse, product] = await Promise.all([
        tx.warehouse.findUniqueOrThrow({ where: { code: input.warehouseCode } }),
        tx.product.findUniqueOrThrow({ where: { sku: input.sku } }),
      ]);
      const location = await tx.location.findUniqueOrThrow({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: input.locationCode } },
      });
      const status = registeredSerialStatusForCondition(input.condition);
      await tx.serialNumber.createMany({
        data: serialNumbers.map((serialNumber) => ({
          serialNumber,
          productId: product.id,
          currentWarehouseId: warehouse.id,
          currentLocationId: location.id,
          condition: input.condition,
          status,
          sourceDocument: "Bulk inventory SN registration",
        })),
      });
      const actor = await tx.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
      if (!actor) throw new DomainError("An active audit actor is required.", "AUDIT_ACTOR_REQUIRED");
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          operation: "Bulk serial registration",
          entityType: "InventoryBalance",
          entityId: `${warehouse.id}:${location.id}:${product.id}:${input.condition}`,
          after: {
            serialNumbers,
            registered: serialNumbers.length,
            physicalQtyBefore: validation.physicalQty,
            physicalQtyAfter: validation.physicalQty,
          },
          remark: `Registered ${serialNumbers.length} SN identities without changing Physical Qty.`,
        },
      });
      return {
        registered: serialNumbers.length,
        physicalQty: validation.physicalQty,
        availableRegistrationCapacity:
          validation.availableRegistrationCapacity - serialNumbers.length,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
