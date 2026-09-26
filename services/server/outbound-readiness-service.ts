import { Prisma, type OutboundStatus } from "@/generated/prisma/client";
import { formatPickupCode } from "@/domain/rules";
import type { WarehouseCode } from "@/domain/types";

type Tx = Prisma.TransactionClient;
type Quantity = Prisma.Decimal | number | string;

interface ReadinessAllocation {
  quantity: Quantity;
  locationId: string;
  preparedAt: Date | null;
  serialNumberId: string | null;
  serialNumber: null | {
    id: string;
    productId: string;
    condition: string;
    status: string;
    currentWarehouseId: string | null;
    currentLocationId: string | null;
  };
}

interface ReadinessLine {
  id: string;
  productId: string;
  requiredQty: Quantity;
  allocatedQty: Quantity;
  preparedQty: Quantity;
  requiredCondition: string;
  product: { serialTrackingRequired: boolean };
  allocations: ReadinessAllocation[];
}

export interface OutboundReadinessResult {
  ready: boolean;
  allQuantitiesPrepared: boolean;
  lines: Array<{
    lineId: string;
    quantityPrepared: boolean;
    allocationConfirmed: boolean;
    serialComplete: boolean;
    assignedSerialCount: number;
    requiredQty: number;
  }>;
}

const decimal = (value: Quantity) => new Prisma.Decimal(value);

export function evaluateOutboundReadiness(input: {
  warehouseId: string;
  lines: ReadinessLine[];
}): OutboundReadinessResult {
  const seenSerialIds = new Set<string>();
  const lines = input.lines.map((line) => {
    const requiredQty = Number(line.requiredQty);
    const allocationTotal = line.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.quantity),
      new Prisma.Decimal(0),
    );
    const quantityPrepared = decimal(line.preparedQty).equals(line.requiredQty);
    const allocationConfirmed =
      decimal(line.allocatedQty).equals(line.requiredQty) &&
      allocationTotal.equals(line.requiredQty) &&
      line.allocations.length > 0 &&
      line.allocations.every((allocation) => allocation.preparedAt !== null);
    const serialAllocations = line.allocations.filter((allocation) => allocation.serialNumberId);
    let serialComplete = !line.product.serialTrackingRequired;
    if (line.product.serialTrackingRequired) {
      serialComplete =
        Number.isInteger(requiredQty) &&
        serialAllocations.length === requiredQty &&
        serialAllocations.every((allocation) => {
          const serial = allocation.serialNumber;
          if (!serial || !allocation.serialNumberId || seenSerialIds.has(allocation.serialNumberId)) return false;
          seenSerialIds.add(allocation.serialNumberId);
          return (
            decimal(allocation.quantity).equals(1) &&
            serial.productId === line.productId &&
            serial.condition === line.requiredCondition &&
            serial.status === "Prepared" &&
            serial.currentWarehouseId === input.warehouseId &&
            serial.currentLocationId === allocation.locationId
          );
        });
    }
    return {
      lineId: line.id,
      quantityPrepared,
      allocationConfirmed,
      serialComplete,
      assignedSerialCount: serialAllocations.length,
      requiredQty,
    };
  });
  const allQuantitiesPrepared = lines.length > 0 && lines.every((line) => line.quantityPrepared);
  return {
    ready:
      allQuantitiesPrepared &&
      lines.every((line) => line.allocationConfirmed && line.serialComplete),
    allQuantitiesPrepared,
    lines,
  };
}

export async function reconcileOutboundReadiness(
  tx: Tx,
  orderId: string,
  actorId: string,
  at = new Date(),
) {
  const order = await tx.outboundOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      warehouse: true,
      lines: {
        include: {
          product: true,
          allocations: {
            where: { dispatchedAt: null },
            include: { serialNumber: true },
          },
        },
      },
    },
  });
  const readiness = evaluateOutboundReadiness(order);
  const anyPrepared = order.lines.some((line) => line.preparedQty.greaterThan(0));
  const nextStatus: OutboundStatus = readiness.ready
    ? "Ready_for_Pickup"
    : readiness.allQuantitiesPrepared
      ? "Prepared"
      : anyPrepared
        ? "Partially_Prepared"
        : order.status;
  let pickupCode = order.pickupCode;
  let pickupBatchId = order.pickupBatchId;

  if (readiness.ready) {
    if (!pickupCode) {
      await tx.pickupSequence.upsert({
        where: { warehouseId: order.warehouseId },
        update: {},
        create: { warehouseId: order.warehouseId, nextValue: 1 },
      });
      const sequence = await tx.pickupSequence.update({
        where: { warehouseId: order.warehouseId },
        data: { nextValue: { increment: 1 } },
      });
      pickupCode = formatPickupCode(
        order.warehouse.code as WarehouseCode,
        sequence.nextValue - 1,
      );
    }
    if (pickupBatchId) {
      await tx.pickupBatch.update({
        where: { id: pickupBatchId },
        data: { status: "Ready", readyAt: order.readyForPickupAt ?? at },
      });
    } else {
      const batch = await tx.pickupBatch.upsert({
        where: { code: pickupCode! },
        update: { status: "Ready", readyAt: order.readyForPickupAt ?? at },
        create: {
          code: pickupCode!,
          warehouseId: order.warehouseId,
          status: "Ready",
          readyAt: at,
        },
      });
      pickupBatchId = batch.id;
    }
  }

  await tx.outboundOrder.update({
    where: { id: order.id },
    data: {
      status: nextStatus,
      pickupCode,
      pickupBatchId,
      readyForPickupAt: readiness.ready ? order.readyForPickupAt ?? at : null,
    },
  });

  if (order.status !== nextStatus) {
    await tx.auditLog.create({
      data: {
        userId: actorId,
        operation: readiness.ready ? "Outbound ready for pickup" : "Outbound readiness held",
        entityType: "OutboundOrder",
        entityId: order.id,
        businessReference: order.shNo,
        before: { status: order.status },
        after: {
          status: nextStatus,
          pickupCode,
          readiness: readiness.lines,
        },
        remark: readiness.ready
          ? "All prepared quantities, physical allocations and authoritative serial assignments are complete."
          : "Order remains in preparation because quantity, allocation or serial evidence is incomplete.",
      },
    });
  }

  return { ...readiness, status: nextStatus, pickupCode, pickupBatchId };
}
