import { DomainError } from "./errors";

export type RepairLifecycleStatus =
  | "Received"
  | "Pending_Repair"
  | "In_Repair"
  | "Repair_Completed"
  | "Repair_Good"
  | "Scrap_Pending"
  | "Scrapped";

export type RepairCompletionOutcome = "Repair_Good" | "Scrap" | "Returned_Unrepaired";

export function assertRepairCanStart(status: RepairLifecycleStatus) {
  if (status !== "Pending_Repair")
    throw new DomainError(
      `Repair cannot start from ${status}. Expected Pending_Repair.`,
      "INVALID_REPAIR_STATE",
    );
}

export function assertRepairCanComplete(status: RepairLifecycleStatus) {
  if (["Repair_Completed", "Repair_Good", "Scrap_Pending", "Scrapped"].includes(status))
    throw new DomainError("Repair job has already been completed.", "REPAIR_ALREADY_COMPLETED");
  if (status !== "In_Repair")
    throw new DomainError(
      `Repair cannot complete from ${status}. Start Repair first.`,
      "INVALID_REPAIR_STATE",
    );
}

export function repairCompletionDisposition(outcome: RepairCompletionOutcome) {
  switch (outcome) {
    case "Repair_Good":
      return {
        jobStatus: "Repair_Good" as const,
        targetCondition: "Repair_Good" as const,
        serialStatus: "In_Stock" as const,
        returnsToUsableStock: true,
      };
    case "Scrap":
      return {
        jobStatus: "Scrapped" as const,
        targetCondition: "Scrap" as const,
        serialStatus: "Scrapped" as const,
        returnsToUsableStock: false,
      };
    case "Returned_Unrepaired":
      return {
        jobStatus: "Repair_Completed" as const,
        targetCondition: "Repair" as const,
        serialStatus: "Repair" as const,
        returnsToUsableStock: false,
      };
    default:
      throw new DomainError("Unsupported repair outcome.", "INVALID_REPAIR_OUTCOME");
  }
}

export function buildRepairCompletionLedgerEvidence(input: {
  warehouseId: string;
  sourceLocationId: string;
  targetLocationId: string;
  productId: string;
  serialNumberId?: string | null;
  itemType: "Product" | "Material";
  outcome: RepairCompletionOutcome;
  businessReference?: string | null;
  operationId: string;
  effectiveAt: Date;
  remark: string;
  createdById: string;
}) {
  const disposition = repairCompletionDisposition(input.outcome);
  return {
    transactionType: "Repair_Completed" as const,
    warehouseId: input.warehouseId,
    sourceLocationId: input.sourceLocationId,
    targetLocationId: input.targetLocationId,
    productId: input.productId,
    serialNumberId: input.serialNumberId ?? undefined,
    itemType: input.itemType,
    condition: disposition.targetCondition,
    sourceCondition: "Repair" as const,
    targetCondition: disposition.targetCondition,
    repairOutcome: input.outcome,
    quantity: 1,
    physicalDelta: 0,
    businessReference: input.businessReference ?? undefined,
    operationId: input.operationId,
    effectiveAt: input.effectiveAt,
    reason: input.outcome,
    remark: input.remark,
    createdById: input.createdById,
  };
}

export function repairInventoryTransition(input: {
  sourceLocationId: string;
  targetLocationId: string;
  outcome: RepairCompletionOutcome;
}) {
  const disposition = repairCompletionDisposition(input.outcome);
  const changesBalance =
    input.sourceLocationId !== input.targetLocationId ||
    disposition.targetCondition !== "Repair";
  return {
    sourceCondition: "Repair" as const,
    targetCondition: disposition.targetCondition,
    sourcePhysicalDelta: changesBalance ? -1 : 0,
    targetPhysicalDelta: changesBalance ? 1 : 0,
    changesBalance,
  };
}
