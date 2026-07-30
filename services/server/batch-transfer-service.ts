import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import { parseQRScan, type ScanValidationStatus } from "@/domain/scan";
import { groupValidTransferScans } from "@/domain/transfer-scan";
import type { StockCondition, WarehouseCode } from "@/domain/types";
import { getPrisma } from "@/lib/prisma";
import { WmsApplicationService } from "@/services/server/wms-service";

export interface TransferScanResult {
  scanId: string;
  rawValue: string;
  serialNumber: string;
  sku?: string;
  model?: string;
  condition?: StockCondition;
  warehouse?: WarehouseCode;
  location?: string;
  source: "QR_STRUCTURED" | "WMS_SERIAL" | "MANUAL";
  validationStatus: ScanValidationStatus;
  message: string;
  productId?: string;
  serialId?: string;
}

export interface TransferBatchInput {
  sourceWarehouse: WarehouseCode;
  destinationWarehouse: WarehouseCode;
  requiredCondition: StockCondition;
  transferReference: string;
  rawValues: string[];
  allowRepair?: boolean;
}

export class BatchTransferService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async validate(input: TransferBatchInput) {
    if (input.sourceWarehouse === input.destinationWarehouse)
      throw new DomainError("Transfer source and destination must differ.", "TRANSFER_WAREHOUSE_MATCH");
    if (input.requiredCondition === "Scrap")
      throw new DomainError("Scrap cannot be transferred.", "TRANSFER_SCRAP_BLOCKED");
    if (input.requiredCondition === "Repair" && !input.allowRepair)
      throw new DomainError("Repair transfer requires explicit permission.", "TRANSFER_REPAIR_NOT_ALLOWED");
    const parsed = input.rawValues.map((rawValue, index) => ({
      ...parseQRScan(rawValue),
      scanId: `scan-${index + 1}`,
    }));
    const serialNumbers = [...new Set(parsed.map((row) => row.serialNumber))];
    const serialRows = await this.prisma.serialNumber.findMany({
      where: { serialNumber: { in: serialNumbers } },
      include: { product: true, currentWarehouse: true, currentLocation: true },
    });
    const byNumber = new Map(serialRows.map((serial) => [serial.serialNumber, serial]));
    const [outboundAssignments, transferAssignments] = await Promise.all([
      serialRows.length ? this.prisma.outboundAllocation.findMany({
        where: { serialNumberId: { in: serialRows.map((row) => row.id) }, dispatchedAt: null },
        select: { serialNumberId: true },
      }) : [],
      serialRows.length ? this.prisma.transferSerial.findMany({
        where: {
          serialNumberId: { in: serialRows.map((row) => row.id) },
          transferOrderLine: {
            transferOrder: { status: { in: ["Draft", "Prepared", "Dispatched", "In_Transit", "Partially_Received"] } },
          },
        },
        select: { serialNumberId: true },
      }) : [],
    ]);
    const outboundSet = new Set(outboundAssignments.map((row) => row.serialNumberId));
    const transferSet = new Set(transferAssignments.map((row) => row.serialNumberId));
    const seen = new Set<string>();
    const results = parsed.map<TransferScanResult>((scan) => {
      const serial = byNumber.get(scan.serialNumber);
      const base: TransferScanResult = {
        scanId: scan.scanId,
        rawValue: scan.rawValue,
        serialNumber: scan.serialNumber,
        sku: serial?.product.sku ?? scan.sku,
        model: serial?.product.model,
        condition: serial?.condition as StockCondition | undefined,
        warehouse: serial?.currentWarehouse?.code as WarehouseCode | undefined,
        location: serial?.currentLocation?.code,
        source: scan.source === "QR_STRUCTURED" ? "QR_STRUCTURED" : serial ? "WMS_SERIAL" : "MANUAL",
        validationStatus: "VALID",
        message: "Valid for Transfer Out.",
        productId: serial?.productId,
        serialId: serial?.id,
      };
      if (seen.has(scan.serialNumber))
        return { ...base, validationStatus: "DUPLICATE_SCAN", message: "Duplicate serial number in this transfer batch." };
      seen.add(scan.serialNumber);
      if (!serial)
        return { ...base, validationStatus: "MANUAL_REVIEW", message: "SN is not registered in WMS and physical presence cannot be proven." };
      if (scan.sku && scan.sku !== serial.product.sku)
        return { ...base, validationStatus: "MANUAL_REVIEW", message: "QR SKU does not match the registered WMS serial." };
      if (serial.condition === "Scrap" || serial.status === "Scrapped")
        return { ...base, validationStatus: "SCRAP", message: "Scrapped stock cannot be transferred." };
      if (serial.condition === "Repair" && !input.allowRepair)
        return { ...base, validationStatus: "CONDITION_MISMATCH", message: "Repair stock requires an explicitly permitted Repair transfer." };
      if (serial.condition !== input.requiredCondition)
        return { ...base, validationStatus: "CONDITION_MISMATCH", message: "SN condition does not match the transfer requirement." };
      if (serial.currentWarehouse?.code !== input.sourceWarehouse)
        return { ...base, validationStatus: "WRONG_WAREHOUSE", message: "SN is not in the source warehouse." };
      if (!serial.currentLocationId || serial.status !== "In_Stock")
        return { ...base, validationStatus: serial.status === "Prepared" ? "FROZEN" : "NOT_PHYSICALLY_PRESENT", message: "SN is not available as physically present stock." };
      if (outboundSet.has(serial.id) || transferSet.has(serial.id))
        return { ...base, validationStatus: "ALREADY_ASSIGNED", message: "SN is already assigned to an active outbound or transfer." };
      return base;
    });
    const valid = results.filter((result) => result.validationStatus === "VALID");
    const groups = groupValidTransferScans(results);
    return {
      summary: { total: results.length, valid: valid.length, invalid: results.length - valid.length },
      results,
      groups,
    };
  }

  async confirm(input: TransferBatchInput) {
    const validation = await this.validate(input);
    if (!validation.summary.valid || validation.summary.invalid)
      throw new DomainError("Transfer batch contains invalid scans.", "TRANSFER_BATCH_INVALID");
    const transfer = await this.prisma.$transaction(async (tx) => {
      const [source, destination, actor] = await Promise.all([
        tx.warehouse.findFirst({ where: { code: input.sourceWarehouse, active: true } }),
        tx.warehouse.findFirst({ where: { code: input.destinationWarehouse, active: true } }),
        tx.user.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } }),
      ]);
      if (!source || !destination) throw new DomainError("Transfer warehouse is invalid.", "TRANSFER_WAREHOUSE_INVALID");
      if (!actor) throw new DomainError("An active audit actor is required.", "AUDIT_ACTOR_REQUIRED");
      const created = await tx.transferOrder.create({
        data: {
          transferNo: input.transferReference.trim().toUpperCase(),
          sourceWarehouseId: source.id,
          destinationWarehouseId: destination.id,
          status: "Draft",
          lines: {
            create: validation.groups.map((group) => ({
              productId: group.productId,
              condition: group.condition,
              quantity: group.quantity,
              serials: { create: group.serialIds.map((serialNumberId) => ({ serialNumberId })) },
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          operation: "Created scanner transfer batch",
          entityType: "TransferOrder",
          entityId: created.id,
          businessReference: created.transferNo,
          after: {
            sourceWarehouse: input.sourceWarehouse,
            destinationWarehouse: input.destinationWarehouse,
            groups: validation.groups.map(({ serialIds, ...group }) => ({ ...group, serialCount: serialIds.length })),
          } as Prisma.InputJsonValue,
          remark: `${validation.summary.valid} scanned machine(s) grouped by Product and Condition.`,
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await new WmsApplicationService(this.prisma).execute({ type: "dispatchTransfer", transferId: transfer.id });
    return { transferId: transfer.id, transferNo: transfer.transferNo, status: "In_Transit", ...validation };
  }
}
