import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { normalizeSerialBatch } from "@/domain/bulk-serial";
import { DomainError } from "@/domain/errors";
import { parseQRScan } from "@/domain/scan";
import type { ScanReviewInputRow } from "@/domain/scan-review";
import { isAllocatableStockCondition } from "@/domain/serial-policy";
import { getPrisma } from "@/lib/prisma";
import { InventoryRepository } from "@/repositories/inventory-repository";
import { reconcileOutboundReadiness } from "@/services/server/outbound-readiness-service";

type Db = PrismaClient | Prisma.TransactionClient;

export interface ConfirmOutboundPreparationInput {
  orderId: string;
  lineId: string;
  locationCode: string;
  quantity: number;
  serialNumbers: string[];
  reviewBatchReference?: string;
}

async function serializable<T>(prisma: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      ) continue;
      throw error;
    }
  }
  throw new Error("Transaction retry limit exceeded.");
}

async function loadContext(db: Db, input: Pick<ConfirmOutboundPreparationInput, "orderId" | "lineId" | "locationCode">) {
  const line = await db.outboundOrderLine.findUnique({
    where: { id: input.lineId },
    include: {
      product: true,
      outboundOrder: { include: { warehouse: true } },
      allocations: { where: { dispatchedAt: null }, include: { serialNumber: true, location: true } },
    },
  });
  if (!line || line.outboundOrderId !== input.orderId)
    throw new DomainError("Outbound order line not found.", "OUTBOUND_LINE_NOT_FOUND");
  const location = await db.location.findFirst({
    where: { warehouseId: line.outboundOrder.warehouseId, code: input.locationCode, active: true },
  });
  if (!location)
    throw new DomainError("Select an active physical location in the order warehouse.", "INVALID_PREPARATION_LOCATION");
  return { line, location };
}

async function validateSerialIdentity(
  db: Db,
  input: ConfirmOutboundPreparationInput,
) {
  const { line, location } = await loadContext(db, input);
  const serialNumbers = normalizeSerialBatch(input.serialNumbers);
  if (!line.product.serialTrackingRequired) {
    if (serialNumbers.length)
      throw new DomainError("This product does not require serial numbers.", "SERIAL_NOT_REQUIRED");
    return { line, location, serialNumbers, serials: [] };
  }
  if (!Number.isInteger(input.quantity) || serialNumbers.length !== input.quantity)
    throw new DomainError("Exact required SN quantity is required.", "INCOMPLETE_SERIAL_QUANTITY");
  if (new Set(serialNumbers).size !== input.serialNumbers.length)
    throw new DomainError("Duplicate serial numbers are not allowed.", "DUPLICATE_SN");

  const serials = await db.serialNumber.findMany({
    where: { serialNumber: { in: serialNumbers } },
    include: { product: true, currentWarehouse: true, currentLocation: true },
  });
  if (serials.length !== serialNumbers.length)
    throw new DomainError("Every SN must exist in authoritative WMS inventory.", "UNKNOWN_SN");
  const [activeOutbound, activeTransfers] = await Promise.all([
    db.outboundAllocation.findMany({
      where: { serialNumberId: { in: serials.map((serial) => serial.id) }, dispatchedAt: null },
      select: { serialNumberId: true },
    }),
    db.transferSerial.findMany({
      where: {
        serialNumberId: { in: serials.map((serial) => serial.id) },
        transferOrderLine: {
          transferOrder: { status: { in: ["Draft", "Prepared", "Dispatched", "In_Transit", "Partially_Received"] } },
        },
      },
      select: { serialNumberId: true },
    }),
  ]);
  const unavailable = new Set([
    ...activeOutbound.flatMap((row) => row.serialNumberId ? [row.serialNumberId] : []),
    ...activeTransfers.map((row) => row.serialNumberId),
  ]);
  for (const serial of serials) {
    if (serial.productId !== line.productId)
      throw new DomainError(`${serial.serialNumber} does not match the requested SKU.`, "WRONG_SKU");
    if (serial.condition !== line.requiredCondition)
      throw new DomainError(`${serial.serialNumber} does not match the required condition.`, "WRONG_CONDITION");
    if (serial.currentWarehouseId !== line.outboundOrder.warehouseId)
      throw new DomainError(`${serial.serialNumber} is in another warehouse.`, "WRONG_WAREHOUSE");
    if (serial.currentLocationId !== location.id)
      throw new DomainError(`${serial.serialNumber} is not at the selected location.`, "WRONG_LOCATION");
    if (serial.status !== "In_Stock")
      throw new DomainError(`${serial.serialNumber} is not available for preparation.`, "SN_NOT_AVAILABLE");
    if (unavailable.has(serial.id))
      throw new DomainError(`${serial.serialNumber} is already assigned to another active operation.`, "SN_ALREADY_ASSIGNED");
  }
  const byNumber = new Map(serials.map((serial) => [serial.serialNumber, serial]));
  return { line, location, serialNumbers, serials: serialNumbers.map((serialNumber) => byNumber.get(serialNumber)!) };
}

export class OutboundPreparationService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async validate(input: ConfirmOutboundPreparationInput, rows: ScanReviewInputRow[]) {
    const serialNumbers = rows.filter((row) => row.included !== false).map((row) => parseQRScan(row.rawValue).serialNumber);
    const normalizedInput = { ...input, serialNumbers };
    let validationError: DomainError | undefined;
    try {
      await validateSerialIdentity(this.prisma, normalizedInput);
    } catch (error) {
      if (error instanceof DomainError) validationError = error;
      else throw error;
    }
    const seen = new Set<string>();
    const context = await loadContext(this.prisma, input);
    const serials = serialNumbers.length ? await this.prisma.serialNumber.findMany({
      where: { serialNumber: { in: [...new Set(serialNumbers)] } },
      include: { product: true, currentWarehouse: true, currentLocation: true },
    }) : [];
    const byNumber = new Map(serials.map((serial) => [serial.serialNumber, serial]));
    const results = rows.map((row) => {
      const serialNumber = parseQRScan(row.rawValue).serialNumber;
      const serial = byNumber.get(serialNumber);
      const duplicate = seen.has(serialNumber);
      seen.add(serialNumber);
      let code = "VALID";
      let message = "Valid for atomic preparation.";
      if (row.included === false) { code = "EXCLUDED"; message = "Excluded from confirmation."; }
      else if (duplicate) { code = "DUPLICATE_SN"; message = "Duplicate SN in this batch."; }
      else if (!serial) { code = "UNKNOWN_SN"; message = "SN is not registered in WMS."; }
      else if (serial.productId !== context.line.productId) { code = "WRONG_SKU"; message = "SN does not match the requested SKU."; }
      else if (serial.condition !== context.line.requiredCondition) { code = "WRONG_CONDITION"; message = "SN condition does not match."; }
      else if (serial.currentWarehouseId !== context.line.outboundOrder.warehouseId) { code = "WRONG_WAREHOUSE"; message = "SN is in another warehouse."; }
      else if (serial.currentLocationId !== context.location.id) { code = "WRONG_LOCATION"; message = "SN is not at the selected location."; }
      else if (serial.status !== "In_Stock") { code = "SN_NOT_AVAILABLE"; message = "SN is not available for preparation."; }
      const valid = code === "VALID";
      return {
        rowId: row.rowId,
        rawValue: row.rawValue,
        serialNumber,
        sku: serial?.product.sku,
        model: serial?.product.model,
        condition: serial?.condition,
        warehouse: serial?.currentWarehouse?.code,
        location: serial?.currentLocation?.code,
        source: "WMS_SERIAL",
        targetLineId: context.line.id,
        targetLabel: `${context.line.product.sku} · ${context.line.product.model}`,
        included: row.included !== false,
        operatorRemark: row.operatorRemark,
        validationStatus: row.included === false ? "EXCLUDED" : valid ? "VALID" : code === "UNKNOWN_SN" ? "UNRESOLVED" : "NEEDS_ATTENTION",
        validationCode: code,
        message,
      };
    });
    const included = results.filter((row) => row.included);
    const valid = included.filter((row) => row.validationStatus === "VALID").length;
    const complete = !validationError && valid === input.quantity && included.length === input.quantity;
    return {
      batchReference: input.reviewBatchReference ?? `PREP-${context.line.outboundOrder.shNo}`,
      complete,
      summary: {
        total: results.length,
        valid,
        needsAttention: included.filter((row) => row.validationStatus === "NEEDS_ATTENTION").length + (validationError && valid === included.length ? 1 : 0),
        unresolved: included.filter((row) => row.validationStatus === "UNRESOLVED").length,
        excluded: results.filter((row) => row.validationStatus === "EXCLUDED").length,
      },
      lineSummary: [{
        lineId: context.line.id,
        sku: context.line.product.sku,
        model: context.line.product.model,
        condition: context.line.requiredCondition,
        requiredQty: Number(context.line.requiredQty),
        assignedQty: 0,
        batchMatchedQty: valid,
      }],
      results,
    };
  }

  async confirm(input: ConfirmOutboundPreparationInput) {
    return serializable(this.prisma, async (tx) => {
      const who = await tx.user.findUnique({ where: { email: "demo.supervisor@example.invalid" } });
      if (!who?.active) throw new DomainError("No active server-side actor is configured.", "AUDIT_ACTOR_REQUIRED");
      const { line, location, serials } = await validateSerialIdentity(tx, input);
      if (!["Imported", "Pending_Allocation", "Partially_Prepared", "Allocated"].includes(line.outboundOrder.status))
        throw new DomainError("Order is not open for normal preparation.", "OUTBOUND_NOT_OPEN_FOR_PREPARATION");
      if (
        line.preparedQty.greaterThan(0) ||
        line.allocatedQty.greaterThan(0) ||
        line.allocations.length
      ) throw new DomainError("This line already contains preparation evidence.", "OUTBOUND_PREPARATION_ALREADY_CONFIRMED");
      if (!isAllocatableStockCondition(line.requiredCondition))
        throw new DomainError("Condition is not allocatable for outbound.", "NON_ALLOCATABLE_CONDITION");
      if (!new Prisma.Decimal(input.quantity).equals(line.requiredQty))
        throw new DomainError("Confirm Preparation requires the exact line quantity.", "PREPARATION_QUANTITY_MISMATCH");

      const balanceWhere = {
        warehouseId: line.outboundOrder.warehouseId,
        locationId: location.id,
        containerId: null,
        productId: line.productId,
        itemType: line.product.itemType,
        condition: line.requiredCondition,
      } as const;
      const balance = await tx.inventoryBalance.findFirst({ where: balanceWhere });
      if (!balance)
        throw new DomainError("Authoritative inventory balance does not exist at this location.", "INVENTORY_BALANCE_NOT_FOUND");
      const otherUnprepared = await tx.outboundAllocation.aggregate({
        where: {
          outboundOrderLine: {
            outboundOrder: {
              warehouseId: line.outboundOrder.warehouseId,
              status: { notIn: ["Outbound", "ERP_Synced", "Cancelled"] },
            },
            productId: line.productId,
            requiredCondition: line.requiredCondition,
          },
          locationId: location.id,
          containerId: null,
          preparedAt: null,
          dispatchedAt: null,
        },
        _sum: { quantity: true },
      });
      const available = balance.physicalQty.minus(balance.frozenQty).minus(otherUnprepared._sum.quantity ?? 0);
      if (new Prisma.Decimal(input.quantity).greaterThan(available))
        throw new DomainError("Insufficient available stock at the selected location.", "INSUFFICIENT_AVAILABLE_STOCK");

      const preparedAt = new Date();
      const operationId = randomUUID();
      if (line.product.serialTrackingRequired) {
        for (const serial of serials) {
          await tx.outboundAllocation.create({
            data: {
              outboundOrderLineId: line.id,
              locationId: location.id,
              serialNumberId: serial.id,
              quantity: 1,
              preparedAt,
            },
          });
          await tx.serialNumber.update({ where: { id: serial.id }, data: { status: "Prepared" } });
        }
      } else {
        await tx.outboundAllocation.create({
          data: {
            outboundOrderLineId: line.id,
            locationId: location.id,
            quantity: input.quantity,
            preparedAt,
          },
        });
      }
      await new InventoryRepository(tx).applyDelta(balanceWhere, { frozenDelta: input.quantity });
      await tx.outboundOrderLine.update({
        where: { id: line.id },
        data: { allocatedQty: input.quantity, preparedQty: input.quantity },
      });
      await tx.stockTransaction.create({
        data: {
          transactionType: "Prepared",
          warehouseId: line.outboundOrder.warehouseId,
          sourceLocationId: location.id,
          productId: line.productId,
          itemType: line.product.itemType,
          condition: line.requiredCondition,
          quantity: input.quantity,
          frozenDelta: input.quantity,
          businessReference: line.outboundOrder.shNo,
          operationId,
          effectiveAt: preparedAt,
          remark: "Atomic Confirm Preparation: location, quantity, SN and Frozen committed together.",
          createdById: who.id,
        },
      });
      await tx.outboundOrder.update({
        where: { id: line.outboundOrder.id },
        data: {
          allocatedAt: line.outboundOrder.allocatedAt ?? preparedAt,
          preparedAt: line.outboundOrder.preparedAt ?? preparedAt,
        },
      });
      const readiness = await reconcileOutboundReadiness(tx, line.outboundOrder.id, who.id, preparedAt);
      await tx.auditLog.create({
        data: {
          userId: who.id,
          operation: "Confirmed outbound preparation",
          entityType: "OutboundOrderLine",
          entityId: line.id,
          businessReference: line.outboundOrder.shNo,
          after: {
            locationCode: location.code,
            quantity: input.quantity,
            serialNumbers: serials.map((serial) => serial.serialNumber),
            frozenDelta: input.quantity,
            operationId,
            orderStatus: readiness.status,
          },
          remark: "Location, quantity, serial assignment and Frozen reservation committed atomically.",
        },
      });
      return {
        confirmed: true,
        orderId: line.outboundOrder.id,
        lineId: line.id,
        status: readiness.status,
        pickupCode: readiness.pickupCode,
        operationId,
      };
    });
  }
}
