import { DomainError } from "./errors";

export interface RepairAssetState {
  jobId: string;
  serialId?: string;
  serialNumber?: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  condition: "Repair" | "Repair_Good" | "Scrap";
  serialStatus?: "Repair" | "In_Stock" | "Scrapped";
  status: "Pending_Repair" | "In_Repair" | "Repair_Good" | "Scrapped";
  receivedAt: string;
  repairStartedAt?: string;
  repairCompletedAt?: string;
  returnedToStockAt?: string;
  outcome?: "Repair_Good" | "Scrap" | "Returned_Unrepaired";
  source: "Native_Return" | "Legacy_Manual";
}

export function startRepairAsset(asset: RepairAssetState, repairStartedAt: string) {
  if (asset.status !== "Pending_Repair")
    throw new DomainError("Repair job is not eligible to start.", "INVALID_REPAIR_STATE");
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
  if (!["Pending_Repair", "In_Repair"].includes(asset.status))
    throw new DomainError("Repair job is not eligible for completion.");
  if (!input.targetLocationId) throw new DomainError("MISSING_PHYSICAL_LOCATION");
  const next = structuredClone(asset);
  next.locationId = input.targetLocationId;
  next.repairCompletedAt = input.completedAt;
  next.returnedToStockAt = input.completedAt;
  next.outcome = input.outcome;
  if (input.outcome === "Repair_Good") {
    next.status = "Repair_Good";
    next.condition = "Repair_Good";
    next.serialStatus = next.serialId ? "In_Stock" : undefined;
  } else if (input.outcome === "Scrap") {
    next.status = "Scrapped";
    next.condition = "Scrap";
    next.serialStatus = next.serialId ? "Scrapped" : undefined;
  } else {
    next.status = "Repair_Good";
    next.condition = "Repair";
    next.serialStatus = next.serialId ? "In_Stock" : undefined;
  }
  return next;
}
