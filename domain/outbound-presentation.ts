import type { OrderStatus } from "./types";

export type OutboundOperatorStage =
  | "TO_PREPARE"
  | "PARTIALLY_PREPARED"
  | "AWAITING_PICKUP"
  | "OUTBOUND"
  | "ERP_SYNCED"
  | "ERP_ISSUE";

export type OutboundQueue =
  | "To_Prepare"
  | "Partially_Prepared"
  | "Awaiting_Pickup"
  | "Outbound"
  | "ERP_Issues";

export function outboundOperatorStage(
  status: OrderStatus,
  erpSyncStatus?: string,
): OutboundOperatorStage {
  if (erpSyncStatus && ["Failed", "Manual_Review", "Retrying"].includes(erpSyncStatus))
    return "ERP_ISSUE";
  if (["Imported", "Pending_Allocation", "Allocated", "Draft", "Ready"].includes(status))
    return "TO_PREPARE";
  if (status === "Partially_Prepared") return "PARTIALLY_PREPARED";
  if (["Prepared", "Ready_for_Pickup"].includes(status)) return "AWAITING_PICKUP";
  if (status === "ERP_Synced") return "ERP_SYNCED";
  if (status === "Outbound") return "OUTBOUND";
  return "ERP_ISSUE";
}

export function outboundQueueFor(
  status: OrderStatus,
  erpSyncStatus?: string,
): OutboundQueue {
  const stage = outboundOperatorStage(status, erpSyncStatus);
  if (stage === "TO_PREPARE") return "To_Prepare";
  if (stage === "PARTIALLY_PREPARED") return "Partially_Prepared";
  if (stage === "AWAITING_PICKUP") return "Awaiting_Pickup";
  if (stage === "OUTBOUND" || stage === "ERP_SYNCED") return "Outbound";
  return "ERP_Issues";
}

export function statusesForOutboundQueue(queue: OutboundQueue): OrderStatus[] {
  if (queue === "To_Prepare") return ["Draft", "Ready", "Imported", "Pending_Allocation", "Allocated"];
  if (queue === "Partially_Prepared") return ["Partially_Prepared"];
  if (queue === "Awaiting_Pickup") return ["Prepared", "Ready_for_Pickup"];
  if (queue === "Outbound") return ["Outbound", "ERP_Synced"];
  return ["Exception"];
}
