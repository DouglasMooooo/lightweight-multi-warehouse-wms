import { DomainError } from "./errors";
import {
  assertRepairCanComplete,
  assertRepairCanStart,
  repairCompletionDisposition,
} from "./repair-rules";

export interface RepairAssetState {
  jobId: string;
  serialId?: string;
  serialNumber?: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  condition: "Repair" | "Repair_Good" | "Scrap";
  serialStatus?: "Repair" | "In_Stock" | "Scrapped";
  status:
    | "Received"
    | "Pending_Repair"
    | "In_Repair"
    | "Repair_Completed"
    | "Repair_Good"
    | "Scrap_Pending"
    | "Scrapped";
  receivedAt: string;
  repairStartedAt?: string;
  repairCompletedAt?: string;
  returnedToStockAt?: string;
  outcome?: "Repair_Good" | "Scrap" | "Returned_Unrepaired";
  source: "Native_Return" | "Legacy_Manual";
}

export function startRepairAsset(asset: RepairAssetState, repairStartedAt: string) {
  assertRepairCanStart(asset.status);
  return { ...asset, status: "In_Repair" as const, repairStartedAt };
}

export function recogniseLegacyRepairGood(input: {
  productId: string;
  targetLocationId: string;
  quantity: number;
  reason: string;
  serialNumber?: string;
}) {
  if (!input.productId) throw new DomainError("Product is required.", "MISSING_PRODUCT");
  if (!input.targetLocationId)
    throw new DomainError("Physical location is required.", "MISSING_PHYSICAL_LOCATION");
  if (!(input.quantity > 0)) throw new DomainError("Quantity must be positive.", "INVALID_QUANTITY");
  if (!input.reason.trim()) throw new DomainError("Reason is required.", "MISSING_REASON");
  if (input.serialNumber && input.quantity !== 1)
    throw new DomainError("A known serial can recognise exactly one unit.", "INVALID_SERIAL_QUANTITY");
  return {
    ...input,
    condition: "Repair_Good" as const,
    source: "Legacy_Manual" as const,
    auditRequired: true,
    traceabilityWarning: !input.serialNumber,
  };
}

export function completeRepairAsset(
  asset: RepairAssetState,
  input: {
    targetLocationId: string;
    completedAt: string;
    outcome: "Repair_Good" | "Scrap" | "Returned_Unrepaired";
  },
) {
  assertRepairCanComplete(asset.status);
  if (!input.targetLocationId)
    throw new DomainError("Physical location is required.", "MISSING_PHYSICAL_LOCATION");
  const disposition = repairCompletionDisposition(input.outcome);
  const next = structuredClone(asset);
  next.locationId = input.targetLocationId;
  next.repairCompletedAt = input.completedAt;
  next.returnedToStockAt = disposition.returnsToUsableStock ? input.completedAt : undefined;
  next.outcome = input.outcome;
  next.status = disposition.jobStatus;
  next.condition = disposition.targetCondition;
  next.serialStatus = next.serialId ? disposition.serialStatus : undefined;
  return next;
}
