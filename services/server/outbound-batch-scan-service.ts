import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import { parseQRScan } from "@/domain/scan";
import type { StockCondition, WarehouseCode } from "@/domain/types";
import { getPrisma } from "@/lib/prisma";
import { BulkSerialService } from "@/services/server/bulk-serial-service";
import { QRScanService } from "@/services/server/qr-scan-service";

type OutboundScanValidationResult = {
  scanId: string;
  rawValue: string;
  serialNumber: string;
  sku?: string;
  model?: string;
  condition?: StockCondition;
  warehouse?: WarehouseCode;
  location?: string;
  source: string;
  lineId?: string;
  requiredCondition?: StockCondition;
  validationStatus: string;
  message: string;
  canRegister: boolean;
};

export class OutboundBatchScanService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async validate(orderId: string, rawValues: string[]) {
    const order = await this.prisma.outboundOrder.findUnique({
      where: { id: orderId },
      include: {
        warehouse: true,
        lines: {
          include: {
            product: true,
            allocations: { where: { dispatchedAt: null }, include: { location: true, serialNumber: true } },
          },
        },
      },
    });
    if (!order) throw new DomainError("Outbound order was not found.", "OUTBOUND_ORDER_NOT_FOUND");
    const parsed = rawValues.map((rawValue, index) => ({ ...parseQRScan(rawValue), scanId: `scan-${index + 1}` }));
    const uniqueNumbers = [...new Set(parsed.map((scan) => scan.serialNumber))];
    const serials = await this.prisma.serialNumber.findMany({
      where: { serialNumber: { in: uniqueNumbers } },
      include: { product: true, currentWarehouse: true, currentLocation: true },
    });
    const byNumber = new Map(serials.map((serial) => [serial.serialNumber, serial]));
    const assignments = serials.length ? await this.prisma.outboundAllocation.findMany({
      where: { serialNumberId: { in: serials.map((serial) => serial.id) }, dispatchedAt: null },
      select: { serialNumberId: true, outboundOrderLineId: true },
    }) : [];
    const assignmentBySerial = new Map(assignments.map((assignment) => [assignment.serialNumberId!, assignment]));
    const countByLine = new Map(order.lines.map((line) => [
      line.id,
      line.allocations.filter((allocation) => allocation.serialNumberId).length,
    ]));
    const seen = new Set<string>();
    const resolver = new QRScanService(this.prisma);
    const results: OutboundScanValidationResult[] = [];
    for (const scan of parsed) {
      const serial = byNumber.get(scan.serialNumber);
      const resolved = serial ? undefined : await resolver.resolve(scan.rawValue, scan.scanId);
      const sku = serial?.product.sku ?? resolved?.sku ?? scan.sku;
      const productId = serial?.productId ?? order.lines.find((line) => line.product.sku === sku)?.productId;
      const productLines = order.lines.filter((line) => line.productId === productId);
      const condition = serial?.condition as StockCondition | undefined;
      const candidate = condition
        ? productLines.find((line) => line.requiredCondition === condition && (countByLine.get(line.id) ?? 0) < Number(line.requiredQty))
        : productLines.length === 1 ? productLines[0] : undefined;
      const base = {
        scanId: scan.scanId,
        rawValue: scan.rawValue,
        serialNumber: scan.serialNumber,
        sku,
        model: serial?.product.model ?? resolved?.model,
        condition,
        warehouse: serial?.currentWarehouse?.code as WarehouseCode | undefined,
        location: serial?.currentLocation?.code,
        source: serial ? (scan.source === "QR_STRUCTURED" ? "QR_STRUCTURED" : "WMS_SERIAL") : resolved?.source ?? "MANUAL",
        lineId: candidate?.id,
        requiredCondition: candidate?.requiredCondition,
        validationStatus: "VALID",
        message: "Matched to outbound line.",
        canRegister: !serial && resolved?.source === "ERP_LOOKUP" && Boolean(candidate),
      };
      if (seen.has(scan.serialNumber)) {
        results.push({ ...base, validationStatus: "DUPLICATE_SCAN", message: "Duplicate SN in this batch." });
        continue;
      }
      seen.add(scan.serialNumber);
      if (!sku || !productId) {
        results.push({ ...base, validationStatus: "MANUAL_REVIEW", message: "SN could not be resolved to Product Master." });
        continue;
      }
      if (!candidate) {
        results.push({
          ...base,
          validationStatus: productLines.length ? "CONDITION_MISMATCH" : "SKU_MISMATCH",
          message: productLines.length ? "SN condition does not match an order line or the line is already complete." : "SKU is not required by this order.",
        });
        continue;
      }
      if (!serial) {
        const allocatedLocations = new Set(candidate.allocations.map((allocation) => allocation.locationId));
        if (resolved?.source !== "ERP_LOOKUP" || allocatedLocations.size !== 1) {
          results.push({ ...base, validationStatus: "MANUAL_REVIEW", message: "Unknown SN requires ERP resolution and one known allocated physical location." });
          continue;
        }
        countByLine.set(candidate.id, (countByLine.get(candidate.id) ?? 0) + 1);
        results.push({ ...base, condition: candidate.requiredCondition, validationStatus: "VALID", message: "ERP-resolved SN can be registered and matched on confirmation." });
        continue;
      }
      if (scan.sku && scan.sku !== serial.product.sku) {
        results.push({ ...base, validationStatus: "MANUAL_REVIEW", message: "QR SKU does not match the registered WMS serial." });
        continue;
      }
      if (serial.condition !== candidate.requiredCondition) {
        results.push({ ...base, validationStatus: "CONDITION_MISMATCH", message: "SN condition does not match the order line." });
        continue;
      }
      if (serial.currentWarehouseId !== order.warehouseId) {
        results.push({ ...base, validationStatus: "WRONG_WAREHOUSE", message: "SN is not in the order warehouse." });
        continue;
      }
      const allocatedLocations = new Set(candidate.allocations.map((allocation) => allocation.locationId));
      if (!serial.currentLocationId || !allocatedLocations.has(serial.currentLocationId)) {
        results.push({ ...base, validationStatus: "WRONG_LOCATION", message: "SN is not at an allocated physical location." });
        continue;
      }
      const assignment = assignmentBySerial.get(serial.id);
      if (assignment && assignment.outboundOrderLineId !== candidate.id) {
        results.push({ ...base, validationStatus: "ALREADY_ASSIGNED", message: "SN is assigned to another active outbound." });
        continue;
      }
      if (!["In_Stock", "Prepared"].includes(serial.status)) {
        results.push({ ...base, validationStatus: "NOT_ALLOCATABLE", message: "SN status is not valid for outbound." });
        continue;
      }
      countByLine.set(candidate.id, (countByLine.get(candidate.id) ?? 0) + 1);
      results.push(base);
    }
    const lineSummary = order.lines.map((line) => ({
      lineId: line.id,
      sku: line.product.sku,
      model: line.product.model,
      condition: line.requiredCondition,
      requiredQty: Number(line.requiredQty),
      assignedQty: line.allocations.filter((allocation) => allocation.serialNumberId).length,
      batchMatchedQty: results.filter((result) => result.validationStatus === "VALID" && result.lineId === line.id).length,
    }));
    const valid = results.filter((result) => result.validationStatus === "VALID").length;
    return {
      order: { id: order.id, shNo: order.shNo, warehouse: order.warehouse.code },
      summary: { total: results.length, valid, invalid: results.length - valid },
      lineSummary,
      results,
    };
  }

  async commit(orderId: string, rawValues: string[]) {
    const validation = await this.validate(orderId, rawValues);
    if (!validation.summary.valid || validation.summary.invalid)
      throw new DomainError("Outbound scan batch contains invalid machines.", "OUTBOUND_SCAN_BATCH_INVALID");
    const grouped = new Map<string, { serialNumbers: string[]; registerUnknownSerials: string[] }>();
    for (const result of validation.results) {
      const line = grouped.get(result.lineId!) ?? { serialNumbers: [], registerUnknownSerials: [] };
      line.serialNumbers.push(result.serialNumber);
      if (result.canRegister) line.registerUnknownSerials.push(result.serialNumber);
      grouped.set(result.lineId!, line);
    }
    for (const [lineId, group] of grouped) {
      await new BulkSerialService(this.prisma).commit({ orderId, lineId, ...group });
    }
    return { ...validation, committed: validation.summary.valid };
  }
}
