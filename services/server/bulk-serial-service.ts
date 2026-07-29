import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  classifyBulkSerial,
  normalizeSerialBatch,
  type BulkSerialCode,
} from "@/domain/bulk-serial";
import { DomainError } from "@/domain/errors";
import { getPrisma } from "@/lib/prisma";
import { validateRegistration } from "@/services/server/bulk-serial-registration-service";

type Db = PrismaClient | Prisma.TransactionClient;

export interface BulkSerialResult {
  serialNumber: string;
  valid: boolean;
  code: BulkSerialCode;
  message: string;
  sku?: string;
  location?: string;
  condition?: string;
  status?: string;
  canRegisterAndAssign?: boolean;
}

export interface BulkSerialValidation {
  orderId: string;
  lineId: string;
  requiredQty: number;
  assignedQty: number;
  remainingQty: number;
  summary: { total: number; valid: number; invalid: number };
  results: BulkSerialResult[];
}

async function validateAgainstDatabase(
  db: Db,
  input: { orderId: string; lineId: string; serialNumbers: string[] },
): Promise<BulkSerialValidation> {
  const serialNumbers = normalizeSerialBatch(input.serialNumbers);
  const line = await db.outboundOrderLine.findUnique({
    where: { id: input.lineId },
    include: {
      product: true,
      outboundOrder: { include: { warehouse: true } },
      allocations: {
        where: { dispatchedAt: null },
        include: { location: true },
      },
    },
  });
  if (!line || line.outboundOrderId !== input.orderId)
    throw new DomainError("Outbound order line not found.", "OUTBOUND_LINE_NOT_FOUND");
  if (!line.product.serialTrackingRequired)
    throw new DomainError("This product does not require serial numbers.", "SERIAL_NOT_REQUIRED");

  const unique = [...new Set(serialNumbers)];
  const serialRows = await db.serialNumber.findMany({
    where: { serialNumber: { in: unique } },
    include: { product: true, currentWarehouse: true, currentLocation: true },
  });
  const byNumber = new Map(serialRows.map((row) => [row.serialNumber, row]));
  const activeAssignments = serialRows.length
    ? await db.outboundAllocation.findMany({
        where: {
          serialNumberId: { in: serialRows.map((row) => row.id) },
          dispatchedAt: null,
        },
        select: { serialNumberId: true, outboundOrderLineId: true },
      })
    : [];
  const assignmentBySerial = new Map(activeAssignments.map((row) => [row.serialNumberId!, row]));
  const allocatedLocations = new Set(line.allocations.map((row) => row.locationId));
  const alreadyAssignedHere = new Set(
    line.allocations.flatMap((row) => (row.serialNumberId ? [row.serialNumberId] : [])),
  );
  const requiredQty = Number(line.requiredQty);
  const assignedQty = alreadyAssignedHere.size;
  let acceptedNew = 0;
  const seen = new Set<string>();
  const unknownNumbers = serialNumbers.filter((serialNumber) => !byNumber.has(serialNumber));
  const soleLocation = allocatedLocations.size === 1
    ? line.allocations[0]?.location
    : undefined;
  const unknownRegistration = soleLocation && unknownNumbers.length
    ? await validateRegistration(db, {
        warehouseCode: line.outboundOrder.warehouse.code,
        locationCode: soleLocation.code,
        sku: line.product.sku,
        condition: line.requiredCondition,
        serialNumbers: unknownNumbers,
      })
    : undefined;
  const registerableUnknown = new Set(
    unknownRegistration?.results.filter((row) => row.valid).map((row) => row.serialNumber) ?? [],
  );

  const results = serialNumbers.map<BulkSerialResult>((serialNumber) => {
    const duplicate = seen.has(serialNumber);
    seen.add(serialNumber);
    const serial = byNumber.get(serialNumber);
    const assignment = serial ? assignmentBySerial.get(serial.id) : undefined;
    const base = {
      serialNumber,
      sku: serial?.product.sku,
      location: serial?.currentLocation?.code,
      condition: serial?.condition,
      status: serial?.status,
      canRegisterAndAssign: !serial && registerableUnknown.has(serialNumber),
    };
    const decision = classifyBulkSerial({
      duplicate,
      exists: Boolean(serial),
      skuMatches: serial?.productId === line.productId,
      condition: serial?.condition,
      requiredCondition: line.requiredCondition,
      warehouseMatches: serial?.currentWarehouseId === line.outboundOrder.warehouseId,
      locationMatches: Boolean(serial?.currentLocationId && allocatedLocations.has(serial.currentLocationId)),
      status: serial?.status,
      assignedElsewhere: Boolean(assignment && assignment.outboundOrderLineId !== line.id),
      exceedsRequiredQty: Boolean(serial && !alreadyAssignedHere.has(serial.id) && assignedQty + acceptedNew >= requiredQty),
    });
    const invalid = (code: BulkSerialCode, message: string): BulkSerialResult => ({
      ...base,
      valid: false,
      code,
      message,
    });
    if (!decision.valid) return invalid(decision.code, decision.message);
    if (!serial) return invalid("UNKNOWN_SN", "Serial number is not registered.");
    if (!alreadyAssignedHere.has(serial.id)) acceptedNew += 1;
    return { ...base, valid: true, code: "VALID", message: "Valid for assignment." };
  });
  const valid = results.filter((row) => row.valid).length;
  return {
    orderId: input.orderId,
    lineId: input.lineId,
    requiredQty,
    assignedQty,
    remainingQty: Math.max(0, requiredQty - assignedQty),
    summary: { total: results.length, valid, invalid: results.length - valid },
    results,
  };
}

export class BulkSerialService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  validate(input: { orderId: string; lineId: string; serialNumbers: string[] }) {
    return validateAgainstDatabase(this.prisma, input);
  }

  async commit(input: {
    orderId: string;
    lineId: string;
    serialNumbers: string[];
    registerUnknownSerials?: string[];
  }) {
    const normalized = normalizeSerialBatch(input.serialNumbers);
    const registerUnknown = normalizeSerialBatch(input.registerUnknownSerials ?? []);
    if (!normalized.length) throw new DomainError("At least one serial number is required.", "EMPTY_SERIAL_BATCH");
    return this.prisma.$transaction(
      async (tx) => {
        if (registerUnknown.length) {
          if (registerUnknown.some((serialNumber) => !normalized.includes(serialNumber)))
            throw new DomainError(
              "Register-and-assign SNs must be part of the submitted assignment batch.",
              "INVALID_REGISTER_AND_ASSIGN_BATCH",
            );
          const registrationLine = await tx.outboundOrderLine.findUnique({
            where: { id: input.lineId },
            include: {
              product: true,
              outboundOrder: { include: { warehouse: true } },
              allocations: { where: { dispatchedAt: null }, include: { location: true } },
            },
          });
          if (!registrationLine || registrationLine.outboundOrderId !== input.orderId)
            throw new DomainError("Outbound order line not found.", "OUTBOUND_LINE_NOT_FOUND");
          const locationIds = [...new Set(registrationLine.allocations.map((row) => row.locationId))];
          if (locationIds.length !== 1)
            throw new DomainError(
              "Register-and-assign requires exactly one allocated physical location.",
              "REGISTER_AND_ASSIGN_LOCATION_AMBIGUOUS",
            );
          const location = registrationLine.allocations[0].location;
          const registration = await validateRegistration(tx, {
            warehouseCode: registrationLine.outboundOrder.warehouse.code,
            locationCode: location.code,
            sku: registrationLine.product.sku,
            condition: registrationLine.requiredCondition,
            serialNumbers: registerUnknown,
          });
          if (registration.summary.invalid)
            throw new DomainError(
              "Unknown SN registration capacity or master-data validation changed.",
              "REGISTER_AND_ASSIGN_REVALIDATION_FAILED",
            );
          await tx.serialNumber.createMany({
            data: registerUnknown.map((serialNumber) => ({
              serialNumber,
              productId: registrationLine.productId,
              currentWarehouseId: registrationLine.outboundOrder.warehouseId,
              currentLocationId: location.id,
              condition: registrationLine.requiredCondition,
              status: "In_Stock",
              sourceDocument: `Register-and-assign:${registrationLine.outboundOrder.shNo}`,
            })),
          });
        }
        const validation = await validateAgainstDatabase(tx, { ...input, serialNumbers: normalized });
        const invalid = validation.results.filter((row) => !row.valid);
        if (invalid.length)
          throw new DomainError(
            `Batch changed or is invalid; ${invalid.length} serial number(s) require attention.`,
            "BULK_SERIAL_REVALIDATION_FAILED",
          );
        const line = await tx.outboundOrderLine.findUniqueOrThrow({
          where: { id: input.lineId },
          include: {
            outboundOrder: true,
            allocations: { where: { dispatchedAt: null }, orderBy: { createdAt: "asc" } },
          },
        });
        const serials = await tx.serialNumber.findMany({
          where: { serialNumber: { in: [...new Set(normalized)] } },
        });
        let accepted = 0;
        for (const serial of serials) {
          if (line.allocations.some((row) => row.serialNumberId === serial.id)) continue;
          const aggregate = line.allocations.find(
            (row) =>
              row.locationId === serial.currentLocationId &&
              !row.serialNumberId &&
              row.quantity.greaterThan(0),
          );
          if (!aggregate)
            throw new DomainError("Allocated quantity changed during batch confirmation.", "BULK_SERIAL_ALLOCATION_CONFLICT");
          if (aggregate.quantity.equals(1)) {
            await tx.outboundAllocation.delete({ where: { id: aggregate.id } });
            line.allocations.splice(line.allocations.indexOf(aggregate), 1);
          } else {
            aggregate.quantity = aggregate.quantity.minus(1);
            await tx.outboundAllocation.update({
              where: { id: aggregate.id },
              data: { quantity: aggregate.quantity },
            });
          }
          await tx.outboundAllocation.create({
            data: {
              outboundOrderLineId: line.id,
              locationId: aggregate.locationId,
              containerId: aggregate.containerId,
              serialNumberId: serial.id,
              quantity: 1,
              preparedAt: aggregate.preparedAt,
            },
          });
          if (aggregate.preparedAt)
            await tx.serialNumber.update({ where: { id: serial.id }, data: { status: "Prepared" } });
          accepted += 1;
        }
        const user = await tx.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
        if (!user) throw new DomainError("An active audit actor is required.", "AUDIT_ACTOR_REQUIRED");
        await tx.auditLog.create({
          data: {
            userId: user.id,
            operation: "Bulk serial assignment",
            entityType: "OutboundOrderLine",
            entityId: line.id,
            businessReference: line.outboundOrder.shNo,
            after: {
              submitted: normalized.length,
              accepted,
              rejected: 0,
              registeredUnknown: registerUnknown,
            },
            remark: `Bulk serial assignment submitted ${normalized.length}; accepted ${accepted}; registered unknown ${registerUnknown.length}; rejected 0.`,
          },
        });
        return {
          orderId: input.orderId,
          lineId: input.lineId,
          submitted: normalized.length,
          accepted,
          rejected: 0,
          assignedQty: validation.assignedQty + accepted,
          requiredQty: validation.requiredQty,
          registeredUnknown: registerUnknown.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
