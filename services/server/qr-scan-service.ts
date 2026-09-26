import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { BulkScanSession, parseQRScan, QRScanResolver, type ScanResult } from "@/domain/scan";
import type { StockCondition, WarehouseCode } from "@/domain/types";
import { createERPAdapter } from "@/integrations/erp-adapter-factory";
import type { ERPAdapter } from "@/integrations/erp-adapter";
import { getPrisma } from "@/lib/prisma";

export class QRScanService {
  constructor(
    private readonly prisma: PrismaClient = getPrisma(),
    private readonly erp: ERPAdapter = createERPAdapter(),
  ) {}

  private resolver() {
    return new QRScanResolver(
      async (serialNumber) => {
        const serial = await this.prisma.serialNumber.findUnique({
          where: { serialNumber },
          include: { product: true, currentWarehouse: true, currentLocation: true },
        });
        return serial ? {
          serialNumber: serial.serialNumber,
          sku: serial.product.sku,
          model: serial.product.model,
          condition: serial.condition as StockCondition,
          warehouse: serial.currentWarehouse?.code as WarehouseCode | undefined,
          location: serial.currentLocation?.code,
        } : null;
      },
      async (serialNumber) => {
        const match = await this.erp.findBySerialNumber(serialNumber);
        if (!match) return null;
        const product = await this.prisma.product.findUnique({ where: { sku: match.sku } });
        if (!product?.active) return null;
        return {
          serialNumber: match.serialNumber.toUpperCase(),
          sku: product.sku,
          model: product.model,
        };
      },
    );
  }

  resolve(rawValue: string, scanId?: string) {
    return this.resolver().resolve(rawValue, scanId);
  }

  async resolveBatch(rawValues: string[]) {
    const parsed = rawValues.map(parseQRScan);
    const serialNumbers = [...new Set(parsed.map((row) => row.serialNumber))];
    const wmsSerials = await this.prisma.serialNumber.findMany({
      where: { serialNumber: { in: serialNumbers } },
      include: { product: true, currentWarehouse: true, currentLocation: true },
    });
    const wmsByNumber = new Map(wmsSerials.map((row) => [row.serialNumber, row]));
    const unknownNumbers = serialNumbers.filter((serialNumber) => !wmsByNumber.has(serialNumber));
    const erpMatches = await Promise.all(
      unknownNumbers.map((serialNumber) => this.erp.findBySerialNumber(serialNumber)),
    );
    const erpByNumber = new Map(
      erpMatches.filter((match) => match).map((match) => [match!.serialNumber.toUpperCase(), match!]),
    );
    const evidenceSkus = [...new Set([
      ...erpMatches.flatMap((match) => match ? [match.sku] : []),
      ...parsed.flatMap((scan) => scan.sku ? [scan.sku] : []),
    ])];
    const evidenceProducts = evidenceSkus.length
      ? await this.prisma.product.findMany({ where: { sku: { in: evidenceSkus }, active: true } })
      : [];
    const productsBySku = new Map(evidenceProducts.map((product) => [product.sku, product]));
    const session = new BulkScanSession();
    for (let index = 0; index < parsed.length; index += 1) {
      const scan = parsed[index];
      const wms = wmsByNumber.get(scan.serialNumber);
      const erp = erpByNumber.get(scan.serialNumber);
      const erpProduct = erp ? productsBySku.get(erp.sku) : undefined;
      let result: ScanResult;
      if (wms) {
        const mismatch = Boolean(scan.sku && scan.sku !== wms.product.sku);
        result = {
          scanId: `scan-${index + 1}`,
          rawValue: scan.rawValue,
          serialNumber: wms.serialNumber,
          sku: wms.product.sku,
          model: wms.product.model,
          condition: wms.condition as StockCondition,
          warehouse: wms.currentWarehouse?.code as WarehouseCode | undefined,
          location: wms.currentLocation?.code,
          source: scan.source === "QR_STRUCTURED" ? "QR_STRUCTURED" : "WMS_SERIAL",
          validationStatus: mismatch ? "MANUAL_REVIEW" : "VALID",
          message: mismatch
            ? "QR SKU does not match the registered WMS serial."
            : "Serial number resolved from WMS.",
        };
      } else if (erp && erpProduct && (!scan.sku || scan.sku === erp.sku)) {
        result = {
          scanId: `scan-${index + 1}`,
          rawValue: scan.rawValue,
          serialNumber: scan.serialNumber,
          sku: erpProduct.sku,
          model: erpProduct.model,
          source: "ERP_LOOKUP",
          validationStatus: "VALID",
          message: "Serial number resolved from ERP production data.",
        };
      } else {
        const productEvidence = scan.sku ? productsBySku.get(scan.sku) : undefined;
        result = {
          scanId: `scan-${index + 1}`,
          rawValue: scan.rawValue,
          serialNumber: scan.serialNumber,
          sku: scan.sku,
          model: productEvidence?.model,
          source: scan.source === "QR_STRUCTURED" ? "QR_STRUCTURED" : "MANUAL",
          validationStatus: "MANUAL_REVIEW",
          message: "Serial number could not be resolved without inventing a SKU.",
        };
      }
      session.add(result);
    }
    const results = session.results();
    return {
      summary: {
        total: results.length,
        valid: results.filter((row) => row.validationStatus === "VALID").length,
        invalid: results.filter((row) => row.validationStatus !== "VALID").length,
      },
      results,
    };
  }
}

export type { ScanResult };
