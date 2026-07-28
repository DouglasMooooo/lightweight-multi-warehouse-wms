import { DomainError } from "./errors";

export interface WorkflowAllocation {
  id: string;
  locationCode: string;
  quantity: number;
  preparedAt?: string;
}

export interface WorkflowLine {
  requiredQty: number;
  allocatedQty: number;
  preparedQty: number;
  allocations: WorkflowAllocation[];
}

export interface WorkflowOrder {
  shNo: string;
  status: "Pending_Allocation" | "Allocated" | "Prepared" | "Ready_for_Pickup" | "Outbound" | "ERP_Synced";
  createdAt: string;
  preparedAt?: string;
  readyForPickupAt?: string;
  outboundAt?: string;
  lines: WorkflowLine[];
}

export function importedOutbound(shNo: string, quantities: number[], createdAt: string): WorkflowOrder {
  if (!shNo.trim()) throw new DomainError("SH number is required.");
  if (!quantities.length || quantities.some((qty) => qty <= 0))
    throw new DomainError("Imported order lines require positive quantities.");
  return {
    shNo,
    status: "Pending_Allocation",
    createdAt,
    lines: quantities.map((requiredQty) => ({
      requiredQty,
      allocatedQty: 0,
      preparedQty: 0,
      allocations: [],
    })),
  };
}

export function allocateLine(
  order: WorkflowOrder,
  lineIndex: number,
  input: { id: string; locationCode: string; quantity: number },
): WorkflowOrder {
  const next = structuredClone(order);
  const line = next.lines[lineIndex];
  if (!line) throw new DomainError("Outbound order line not found.");
  if (!input.locationCode.trim()) throw new DomainError("MISSING_PHYSICAL_LOCATION");
  if (input.quantity <= 0 || line.allocatedQty + input.quantity > line.requiredQty)
    throw new DomainError("Allocation quantity exceeds requested quantity.");
  line.allocations.push(input);
  line.allocatedQty += input.quantity;
  next.status = next.lines.every((row) => row.allocatedQty === row.requiredQty)
    ? "Allocated"
    : "Pending_Allocation";
  return next;
}

export function prepareAllocations(
  order: WorkflowOrder,
  allocationIds: string[],
  preparedAt: string,
): WorkflowOrder {
  const next = structuredClone(order);
  if (!allocationIds.length) throw new DomainError("ORDER_NOT_ALLOCATED");
  const requested = new Set(allocationIds);
  let prepared = 0;
  for (const line of next.lines) {
    for (const allocation of line.allocations) {
      if (!requested.has(allocation.id) || allocation.preparedAt) continue;
      if (!allocation.locationCode) throw new DomainError("MISSING_PHYSICAL_LOCATION");
      allocation.preparedAt = preparedAt;
      line.preparedQty += allocation.quantity;
      prepared += allocation.quantity;
      requested.delete(allocation.id);
    }
  }
  if (requested.size || prepared === 0) throw new DomainError("ORDER_NOT_ALLOCATED");
  const complete = next.lines.every((line) => line.preparedQty === line.requiredQty);
  next.status = complete ? "Ready_for_Pickup" : "Prepared";
  next.preparedAt ??= preparedAt;
  if (complete) next.readyForPickupAt = preparedAt;
  return next;
}

export function markOutbound(order: WorkflowOrder, outboundAt: string): WorkflowOrder {
  if (!order.lines.every((line) => line.preparedQty === line.requiredQty))
    throw new DomainError("All requested stock must be prepared before dispatch.");
  const next = structuredClone(order);
  next.status = "Outbound";
  next.outboundAt = outboundAt;
  return next;
}
