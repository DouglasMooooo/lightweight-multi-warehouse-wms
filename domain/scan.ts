import type { StockCondition, WarehouseCode } from "./types";

export type ScanSource = "QR_STRUCTURED" | "WMS_SERIAL" | "ERP_LOOKUP" | "MANUAL";
export type ScanValidationStatus =
  | "VALID"
  | "MANUAL_REVIEW"
  | "DUPLICATE_SCAN"
  | "CONDITION_MISMATCH"
  | "WRONG_WAREHOUSE"
  | "NOT_PHYSICALLY_PRESENT"
  | "ALREADY_ASSIGNED"
  | "FROZEN"
  | "SCRAP";

export interface ParsedScan {
  rawValue: string;
  serialNumber: string;
  sku?: string;
  source: "QR_STRUCTURED" | "MANUAL";
}

export interface ScanResult {
  scanId: string;
  rawValue: string;
  serialNumber: string;
  sku?: string;
  model?: string;
  condition?: StockCondition;
  warehouse?: WarehouseCode;
  location?: string;
  source: ScanSource;
  validationStatus: ScanValidationStatus;
  message: string;
}

const normalize = (value: string) => value.trim().toUpperCase();

export function parseQRScan(rawValue: string): ParsedScan {
  const raw = rawValue.trim();
  const keyValues = Object.fromEntries(
    raw
      .split(/[\r\n;&]+/)
      .map((part) => part.trim())
      .map((part) => {
        const match = part.match(/^(SKU|SN|SERIAL|SERIALNUMBER)\s*[:=]\s*(.+)$/i);
        return match ? [match[1].toUpperCase(), normalize(match[2])] : [];
      })
      .filter((entry) => entry.length === 2),
  );
  const serialNumber = keyValues.SN ?? keyValues.SERIAL ?? keyValues.SERIALNUMBER;
  if (serialNumber)
    return {
      rawValue,
      serialNumber,
      sku: keyValues.SKU,
      source: "QR_STRUCTURED",
    };

  const pipe = raw.split(/[|,;\t]+/).map(normalize).filter(Boolean);
  if (pipe.length === 2 && /\d{2}-\d{3}-\d{5}-\d{2}/.test(pipe[0]))
    return { rawValue, sku: pipe[0], serialNumber: pipe[1], source: "QR_STRUCTURED" };
  return { rawValue, serialNumber: normalize(raw), source: "MANUAL" };
}

export class BulkScanSession {
  private readonly accepted = new Set<string>();
  private readonly scans: ScanResult[] = [];

  add(result: ScanResult) {
    if (this.accepted.has(result.serialNumber)) {
      const duplicate: ScanResult = {
        ...result,
        scanId: `${result.scanId}:duplicate`,
        validationStatus: "DUPLICATE_SCAN",
        message: "Serial number has already been scanned in this batch.",
      };
      this.scans.push(duplicate);
      return duplicate;
    }
    this.accepted.add(result.serialNumber);
    this.scans.push(result);
    return result;
  }

  remove(scanId: string) {
    const index = this.scans.findIndex((scan) => scan.scanId === scanId);
    if (index < 0) return;
    const [removed] = this.scans.splice(index, 1);
    if (removed && !this.scans.some((scan) => scan.serialNumber === removed.serialNumber))
      this.accepted.delete(removed.serialNumber);
  }

  results() {
    return [...this.scans];
  }
}

export interface ScanLookupRecord {
  serialNumber: string;
  sku: string;
  model: string;
  condition?: StockCondition;
  warehouse?: WarehouseCode;
  location?: string;
}

export class QRScanResolver {
  constructor(
    private readonly findWms: (serialNumber: string) => Promise<ScanLookupRecord | null>,
    private readonly findErp: (serialNumber: string) => Promise<ScanLookupRecord | null>,
  ) {}

  async resolve(rawValue: string, scanId = crypto.randomUUID()): Promise<ScanResult> {
    const parsed = parseQRScan(rawValue);
    const wms = await this.findWms(parsed.serialNumber);
    if (wms) {
      if (parsed.sku && parsed.sku !== wms.sku)
        return {
          scanId, rawValue, serialNumber: parsed.serialNumber, sku: wms.sku, model: wms.model,
          condition: wms.condition, warehouse: wms.warehouse, location: wms.location,
          source: "WMS_SERIAL", validationStatus: "MANUAL_REVIEW",
          message: "QR SKU does not match the registered WMS serial.",
        };
      return {
        scanId, rawValue, ...wms, source: parsed.source === "QR_STRUCTURED" ? "QR_STRUCTURED" : "WMS_SERIAL",
        validationStatus: "VALID", message: "Serial number resolved from WMS.",
      };
    }
    const erp = await this.findErp(parsed.serialNumber);
    if (erp && (!parsed.sku || parsed.sku === erp.sku))
      return {
        scanId, rawValue, ...erp, source: "ERP_LOOKUP", validationStatus: "VALID",
        message: "Serial number resolved from ERP production data.",
      };
    return {
      scanId, rawValue, serialNumber: parsed.serialNumber, sku: parsed.sku,
      source: parsed.source === "QR_STRUCTURED" ? "QR_STRUCTURED" : "MANUAL",
      validationStatus: "MANUAL_REVIEW",
      message: "Serial number could not be resolved without inventing a SKU.",
    };
  }
}
