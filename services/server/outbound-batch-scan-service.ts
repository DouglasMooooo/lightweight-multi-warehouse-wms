import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import { automaticOrderLineMatch, type ScanReviewInputRow } from "@/domain/scan-review";
import { parseQRScan, type ScanResult } from "@/domain/scan";
import type { StockCondition, WarehouseCode } from "@/domain/types";
import { getPrisma } from "@/lib/prisma";
import { InventoryRepository } from "@/repositories/inventory-repository";
import { QRScanService } from "@/services/server/qr-scan-service";
import { reconcileOutboundReadiness } from "@/services/server/outbound-readiness-service";

type Db = PrismaClient | Prisma.TransactionClient;

export interface OutboundReviewResult {
  rowId: string;
  rawValue: string;
  serialNumber: string;
  sku?: string;
  model?: string;
  condition?: StockCondition;
  warehouse?: WarehouseCode;
  location?: string;
  source: string;
  targetLineId?: string;
  targetLabel?: string;
  included: boolean;
  operatorRemark?: string;
  validationStatus: "VALID" | "NEEDS_ATTENTION" | "UNRESOLVED" | "EXCLUDED";
  validationCode: string;
  message: string;
  serialId?: string;
  alreadyAssignedHere?: boolean;
}

async function actor(db: Prisma.TransactionClient) {
  const user = await db.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (!user?.active) throw new DomainError("No active server-side actor is configured.", "AUDIT_ACTOR_REQUIRED");
  return user;
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

async function validateWithDatabase(
  db: Db,
  orderId: string,
  rows: ScanReviewInputRow[],
  resolvedByRow = new Map<string, ScanResult>(),
) {
  const order = await db.outboundOrder.findUnique({
    where: { id: orderId },
    include: {
      warehouse: true,
      lines: {
        include: {
          product: true,
          allocations: {
            where: { dispatchedAt: null },
            include: { location: true, serialNumber: true },
          },
        },
      },
    },
  });
  if (!order) throw new DomainError("Outbound order was not found.", "OUTBOUND_ORDER_NOT_FOUND");
  if (["Outbound", "ERP_Synced", "Cancelled"].includes(order.status))
    throw new DomainError("Outbound order is not open for review.", "OUTBOUND_ORDER_NOT_OPEN");

  const parsed = rows.map((row) => ({ row, parsed: parseQRScan(row.rawValue) }));
  const serialNumbers = [...new Set(parsed.map(({ parsed: scan }) => scan.serialNumber))];
  const serials = await db.serialNumber.findMany({
    where: { serialNumber: { in: serialNumbers } },
    include: { product: true, currentWarehouse: true, currentLocation: true },
  });
  const byNumber = new Map(serials.map((serial) => [serial.serialNumber, serial]));
  const [outboundAssignments, transferAssignments] = await Promise.all([
    serials.length ? db.outboundAllocation.findMany({
      where: { serialNumberId: { in: serials.map((serial) => serial.id) }, dispatchedAt: null },
      select: { serialNumberId: true, outboundOrderLineId: true },
    }) : [],
    serials.length ? db.transferSerial.findMany({
      where: {
        serialNumberId: { in: serials.map((serial) => serial.id) },
        transferOrderLine: {
          transferOrder: {
            status: { in: ["Draft", "Prepared", "Dispatched", "In_Transit", "Partially_Received"] },
          },
        },
      },
      select: { serialNumberId: true },
    }) : [],
  ]);
  const outboundBySerial = new Map(
    outboundAssignments.map((assignment) => [assignment.serialNumberId!, assignment]),
  );
  const transferSet = new Set(transferAssignments.map((assignment) => assignment.serialNumberId));
  const existingAssignedByLine = new Map(
    order.lines.map((line) => [
      line.id,
      new Set(line.allocations.flatMap((allocation) =>
        allocation.serialNumberId ? [allocation.serialNumberId] : [],
      )),
    ]),
  );
  const batchAcceptedByLine = new Map<string, number>();
  const seen = new Set<string>();
  const lineEvidence = order.lines.map((line) => ({
    id: line.id,
    sku: line.product.sku,
    model: line.product.model,
    requiredCondition: line.requiredCondition as string,
    requiredQty: Number(line.requiredQty),
    serialTrackingRequired: line.product.serialTrackingRequired,
  }));

  const results: OutboundReviewResult[] = parsed.map(({ row, parsed: scan }) => {
    const included = row.included !== false;
    const serial = byNumber.get(scan.serialNumber);
    const resolved = resolvedByRow.get(row.rowId);
    const sku = serial?.product.sku ?? resolved?.sku ?? row.supportingSku ?? scan.sku;
    const model = serial?.product.model ?? resolved?.model;
    const condition = serial?.condition as StockCondition | undefined;
    const base: OutboundReviewResult = {
      rowId: row.rowId,
      rawValue: row.rawValue,
      serialNumber: scan.serialNumber,
      sku,
      model,
      condition,
      warehouse: serial?.currentWarehouse?.code as WarehouseCode | undefined,
      location: serial?.currentLocation?.code,
      source: serial
        ? scan.source === "QR_STRUCTURED" ? "QR_STRUCTURED" : "WMS_SERIAL"
        : resolved?.source ?? scan.source,
      included,
      operatorRemark: row.operatorRemark,
      validationStatus: "VALID",
      validationCode: "VALID",
      message: "Valid for preparation review.",
      serialId: serial?.id,
    };
    const fail = (
      validationCode: string,
      message: string,
      validationStatus: OutboundReviewResult["validationStatus"] = "NEEDS_ATTENTION",
      extra: Partial<OutboundReviewResult> = {},
    ): OutboundReviewResult => ({ ...base, ...extra, validationCode, message, validationStatus });
    if (!included)
      return fail("EXCLUDED", "Excluded from final confirmation.", "EXCLUDED");
    if (seen.has(scan.serialNumber))
      return fail("DUPLICATE_SCAN", "Already added to this review batch.");
    seen.add(scan.serialNumber);
    if (row.supportingShNo && row.supportingShNo !== order.shNo)
      return fail("SH_MISMATCH", `File SH ${row.supportingShNo} does not match ${order.shNo}.`);
    if (row.supportingSku && serial && row.supportingSku !== serial.product.sku)
      return fail("SUPPORTING_SKU_MISMATCH", "Uploaded SKU does not match the WMS serial identity.");
    if (!serial) {
      return fail(
        "UNRESOLVED_SN",
        resolved?.sku
          ? "ERP resolved product identity, but WMS physical inventory for this SN is not proven."
          : "SN could not be resolved through WMS or configured ERP.",
        "UNRESOLVED",
      );
    }

    const match = automaticOrderLineMatch(
      { sku: serial.product.sku, condition: serial.condition, targetLineId: row.targetLineId },
      lineEvidence,
    );
    const target = match.line
      ? order.lines.find((line) => line.id === match.line!.id)
      : undefined;
    if (match.code !== "MATCHED" || !target) {
      const messages: Record<string, string> = {
        CONDITION_MISMATCH: `Condition mismatch. Order requires a different condition; current machine is ${serial.condition}.`,
        NO_MATCHING_ORDER_LINE: "No order line matches this SKU and condition.",
        TARGET_LINE_REQUIRED: "More than one order line matches; select the target line.",
        TARGET_LINE_INVALID: "Selected target line is not part of this order.",
        TARGET_LINE_MISMATCH: "Selected target line does not match the resolved SKU and condition.",
      };
      return fail(match.code, messages[match.code] ?? "Target line requires review.");
    }
    const targetLabel = `${target.product.sku} · ${target.product.model} · ${target.requiredCondition} × ${Number(target.requiredQty)}`;
    const targetExtra = { targetLineId: target.id, targetLabel };
    if (serial.condition === "Repair" || serial.status === "Repair")
      return fail("REPAIR_NOT_ALLOWED", "Repair stock cannot be used for normal outbound.", "NEEDS_ATTENTION", targetExtra);
    if (serial.condition === "Scrap" || serial.status === "Scrapped")
      return fail("SCRAP_NOT_ALLOWED", "Scrap stock cannot be used for outbound.", "NEEDS_ATTENTION", targetExtra);
    if (serial.condition !== target.requiredCondition)
      return fail("CONDITION_MISMATCH", "Machine condition does not match the order line.", "NEEDS_ATTENTION", targetExtra);
    if (serial.currentWarehouseId !== order.warehouseId)
      return fail("WRONG_WAREHOUSE", "SN is in another physical warehouse.", "NEEDS_ATTENTION", targetExtra);
    if (!serial.currentLocationId)
      return fail("NO_PHYSICAL_LOCATION", "SN has no current physical location.", "NEEDS_ATTENTION", targetExtra);
    const assignment = outboundBySerial.get(serial.id);
    const assignedHere = assignment?.outboundOrderLineId === target.id;
    if (assignment && !assignedHere)
      return fail("ALREADY_ASSIGNED", "SN is assigned to another active outbound.", "NEEDS_ATTENTION", targetExtra);
    if (transferSet.has(serial.id))
      return fail("ACTIVE_TRANSFER", "SN is assigned to an active transfer.", "NEEDS_ATTENTION", targetExtra);
    if (!["In_Stock", "Prepared"].includes(serial.status))
      return fail("NOT_ALLOCATABLE", "SN status is not valid for preparation.", "NEEDS_ATTENTION", targetExtra);
    if (serial.status === "Prepared" && !assignedHere)
      return fail("FROZEN_ELSEWHERE", "SN is frozen outside this order.", "NEEDS_ATTENTION", targetExtra);
    const allocatedLocations = new Set(target.allocations.map((allocation) => allocation.locationId));
    const hasUnallocatedCapacity = target.allocatedQty.lessThan(target.requiredQty);
    if (allocatedLocations.size && !allocatedLocations.has(serial.currentLocationId) && !hasUnallocatedCapacity)
      return fail("WRONG_LOCATION", "SN is not at an allocated location for this line.", "NEEDS_ATTENTION", targetExtra);

    const existing = existingAssignedByLine.get(target.id)!;
    if (!existing.has(serial.id)) {
      const accepted = batchAcceptedByLine.get(target.id) ?? 0;
      if (existing.size + accepted >= Number(target.requiredQty))
        return fail("EXCEEDS_REQUIRED_QTY", "Selected SN count exceeds the line quantity.", "NEEDS_ATTENTION", targetExtra);
      batchAcceptedByLine.set(target.id, accepted + 1);
    }
    return {
      ...base,
      ...targetExtra,
      alreadyAssignedHere: assignedHere,
    };
  });

  const selected = results.filter((row) => row.included);
  const lineSummary = order.lines.map((line) => {
    const assignedQty = existingAssignedByLine.get(line.id)?.size ?? 0;
    const batchMatchedQty = results.filter(
      (result) =>
        result.validationStatus === "VALID" &&
        result.targetLineId === line.id &&
        !result.alreadyAssignedHere,
    ).length;
    return {
      lineId: line.id,
      sku: line.product.sku,
      model: line.product.model,
      condition: line.requiredCondition,
      requiredQty: Number(line.requiredQty),
      assignedQty,
      batchMatchedQty,
      serialTrackingRequired: line.product.serialTrackingRequired,
    };
  });
  return {
    batchReference: `OBR-${order.shNo}`,
    order: { id: order.id, shNo: order.shNo, warehouse: order.warehouse.code },
    summary: {
      total: results.length,
      valid: selected.filter((row) => row.validationStatus === "VALID").length,
      needsAttention: selected.filter((row) => row.validationStatus === "NEEDS_ATTENTION").length,
      unresolved: selected.filter((row) => row.validationStatus === "UNRESOLVED").length,
      excluded: results.filter((row) => row.validationStatus === "EXCLUDED").length,
    },
    lineSummary,
    lines: lineEvidence,
    results,
  };
}

export class OutboundBatchScanService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async validate(orderId: string, rows: ScanReviewInputRow[]) {
    const resolution = await new QRScanService(this.prisma).resolveBatch(
      rows.map((row) => row.rawValue),
    );
    const resolvedByRow = new Map(
      rows.map((row, index) => [row.rowId, resolution.results[index]]),
    );
    return validateWithDatabase(this.prisma, orderId, rows, resolvedByRow);
  }

  async confirmPreparation(
    orderId: string,
    rows: ScanReviewInputRow[],
    reviewBatchReference: string,
  ) {
    return serializable(this.prisma, async (tx) => {
      const validation = await validateWithDatabase(tx, orderId, rows);
      if (validation.summary.needsAttention || validation.summary.unresolved || !validation.summary.valid)
        throw new DomainError(
          "Review batch changed or still contains selected invalid rows.",
          "OUTBOUND_REVIEW_REVALIDATION_FAILED",
        );
      const incomplete = validation.lineSummary.filter((line) =>
        line.serialTrackingRequired
          ? line.assignedQty + line.batchMatchedQty !== line.requiredQty
          : false,
      );
      if (incomplete.length)
        throw new DomainError(
          "Every serial-tracked line must have its required SN quantity.",
          "OUTBOUND_REVIEW_INCOMPLETE",
        );

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
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      });
      const who = await actor(tx);
      const validRows = validation.results.filter(
        (row) => row.validationStatus === "VALID" && row.included,
      );
      for (const row of validRows) {
        if (row.alreadyAssignedHere) continue;
        const line = order.lines.find((candidate) => candidate.id === row.targetLineId);
        if (!line || !row.serialId) throw new DomainError("Validated target line changed.", "TARGET_LINE_CHANGED");
        const serial = await tx.serialNumber.findUniqueOrThrow({ where: { id: row.serialId } });
        const aggregate = line.allocations.find((allocation) =>
          allocation.locationId === serial.currentLocationId &&
          !allocation.serialNumberId &&
          allocation.quantity.greaterThan(0),
        );
        if (aggregate) {
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
        } else if (!line.allocatedQty.lessThan(line.requiredQty)) {
          throw new DomainError("Allocated locations changed during confirmation.", "ALLOCATION_CONFLICT");
        }
        const created = await tx.outboundAllocation.create({
          data: {
            outboundOrderLineId: line.id,
            locationId: serial.currentLocationId!,
            serialNumberId: serial.id,
            quantity: 1,
            preparedAt: aggregate?.preparedAt,
          },
        });
        if (aggregate?.preparedAt) {
          await tx.serialNumber.update({
            where: { id: serial.id },
            data: { status: "Prepared" },
          });
        }
        line.allocations.push({ ...created, serialNumber: serial });
        if (!aggregate) line.allocatedQty = line.allocatedQty.plus(1);
      }

      const operationId = randomUUID();
      const preparedAt = new Date();
      const inventory = new InventoryRepository(tx);
      const skuSummary: Record<string, number> = {};
      const conditionSummary: Record<string, number> = {};
      for (const line of order.lines) {
        const serialCount = line.allocations.filter((allocation) => allocation.serialNumberId).length;
        if (line.product.serialTrackingRequired && serialCount !== Number(line.requiredQty))
          throw new DomainError("Serial allocation count changed during confirmation.", "OUTBOUND_REVIEW_INCOMPLETE");
        if (!line.product.serialTrackingRequired && line.allocatedQty.lessThan(line.requiredQty))
          throw new DomainError(
            "Non-serial-tracked lines must follow the existing allocation workflow first.",
            "NON_SERIAL_LINE_NOT_ALLOCATED",
          );
        let preparedDelta = new Prisma.Decimal(0);
        for (const allocation of line.allocations.filter((candidate) => !candidate.preparedAt)) {
          const key = {
            warehouseId: order.warehouseId,
            locationId: allocation.locationId,
            containerId: allocation.containerId,
            productId: line.productId,
            itemType: line.product.itemType,
            condition: line.requiredCondition,
          } as const;
          await inventory.applyDelta(key, { frozenDelta: allocation.quantity });
          await tx.outboundAllocation.update({
            where: { id: allocation.id },
            data: { preparedAt },
          });
          if (allocation.serialNumberId)
            await tx.serialNumber.update({
              where: { id: allocation.serialNumberId },
              data: { status: "Prepared" },
            });
          await tx.stockTransaction.create({
            data: {
              transactionType: "Prepared",
              warehouseId: order.warehouseId,
              sourceLocationId: allocation.locationId,
              containerId: allocation.containerId,
              productId: line.productId,
              itemType: line.product.itemType,
              condition: line.requiredCondition,
              quantity: allocation.quantity,
              frozenDelta: allocation.quantity,
              businessReference: order.shNo,
              operationId,
              effectiveAt: preparedAt,
              remark: `Confirmed from outbound review batch ${reviewBatchReference}.`,
              createdById: who.id,
            },
          });
          preparedDelta = preparedDelta.plus(allocation.quantity);
        }
        const preparedQty = line.preparedQty.plus(preparedDelta);
        await tx.outboundOrderLine.update({
          where: { id: line.id },
          data: { allocatedQty: line.allocatedQty, preparedQty },
        });
        skuSummary[line.product.sku] = Number(preparedQty);
        conditionSummary[line.requiredCondition] =
          (conditionSummary[line.requiredCondition] ?? 0) + Number(preparedQty);
      }

      await tx.outboundOrder.update({
        where: { id: order.id },
        data: {
          allocatedAt: order.allocatedAt ?? preparedAt,
          preparedAt: order.preparedAt ?? preparedAt,
        },
      });
      const readiness = await reconcileOutboundReadiness(
        tx,
        order.id,
        who.id,
        preparedAt,
      );
      if (!readiness.ready)
        throw new DomainError(
          "Outbound review did not produce authoritative pickup readiness.",
          "OUTBOUND_REVIEW_INCOMPLETE",
        );
      await tx.auditLog.create({
        data: {
          userId: who.id,
          operation: "Confirmed outbound review preparation",
          entityType: "OutboundOrder",
          entityId: order.id,
          businessReference: order.shNo,
          after: {
            reviewBatchReference,
            submitted: rows.filter((row) => row.included !== false).length,
            accepted: validRows.length,
            skuSummary,
            conditionSummary,
            operationId,
          },
          remark: `Review ${reviewBatchReference} confirmed; Frozen increased once under operation ${operationId}.`,
        },
      });
      return {
        orderId: order.id,
        shNo: order.shNo,
        status: readiness.status,
        reviewBatchReference,
        accepted: validRows.length,
        operationId,
      };
    });
  }
}
