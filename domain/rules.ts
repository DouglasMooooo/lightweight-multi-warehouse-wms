import { DomainError } from "./errors";
import type { SerialStatus, StockCondition, WarehouseCode } from "./types";

export interface BalanceQuantities {
  physical: number;
  frozen: number;
  inTransit: number;
}

export function applyBalanceDelta(
  current: BalanceQuantities,
  delta: Partial<BalanceQuantities>,
): BalanceQuantities {
  const next = {
    physical: current.physical + (delta.physical ?? 0),
    frozen: current.frozen + (delta.frozen ?? 0),
    inTransit: current.inTransit + (delta.inTransit ?? 0),
  };
  if (next.physical < 0) throw new DomainError("Physical inventory cannot become negative.");
  if (next.frozen < 0) throw new DomainError("Frozen inventory cannot become negative.");
  if (next.inTransit < 0) throw new DomainError("In-transit inventory cannot become negative.");
  if (next.frozen > next.physical) throw new DomainError("Frozen inventory cannot exceed physical inventory.");
  if (next.physical - next.frozen < 0) throw new DomainError("Available inventory cannot become negative.");
  return next;
}

export function validatePreparation(requiredQty: number, preparedQty: number, availableQty: number, qty: number) {
  if (!(qty > 0)) throw new DomainError("Prepared quantity must be positive.");
  if (preparedQty + qty > requiredQty) throw new DomainError("Prepared quantity exceeds the requested quantity.");
  if (qty > availableQty)
    throw new DomainError("Insufficient available stock.", "INSUFFICIENT_AVAILABLE_STOCK");
}

export function validateOutboundSerial(input: {
  serialSku: string;
  requiredSku: string;
  serialCondition: StockCondition;
  requiredCondition: StockCondition;
  serialWarehouse?: WarehouseCode;
  requiredWarehouse: WarehouseCode;
  serialLocation?: string;
  allocatedLocations: string[];
  status: SerialStatus;
  allocatedToAnotherOrder: boolean;
}) {
  if (input.serialSku !== input.requiredSku)
    throw new DomainError("Serial number does not match the requested SKU.", "SN_WRONG_SKU");
  if (input.serialCondition !== input.requiredCondition)
    throw new DomainError(
      "Serial number condition does not match the outbound requirement.",
      "SN_WRONG_CONDITION",
    );
  if (input.serialWarehouse !== input.requiredWarehouse)
    throw new DomainError("Serial number is not in the outbound warehouse.", "SN_WRONG_WAREHOUSE");
  if (!input.serialLocation || !input.allocatedLocations.includes(input.serialLocation))
    throw new DomainError("Serial number is not in an allocated location.", "SN_WRONG_LOCATION");
  if (input.allocatedToAnotherOrder || input.status === "Prepared")
    throw new DomainError(
      "Serial number is allocated to another active order.",
      "SN_ALREADY_ALLOCATED",
    );
  if (input.status !== "In_Stock")
    throw new DomainError("Serial number is not eligible for outbound allocation.");
}

export function validateMove(input: {
  sourceWarehouse: WarehouseCode;
  destinationWarehouse: WarehouseCode;
  sourceLocation: string;
  destinationLocation: string;
  availableQty: number;
  qty: number;
}) {
  if (input.sourceWarehouse !== input.destinationWarehouse)
    throw new DomainError("Cross-warehouse Move is prohibited. Use Transfer.");
  if (input.sourceLocation === input.destinationLocation)
    throw new DomainError("Source and destination must be different.");
  if (!(input.qty > 0)) throw new DomainError("Move quantity must be positive.");
  if (input.qty > input.availableQty) throw new DomainError("Source location does not have enough available inventory.");
}

export function validateAdjustment(input: {
  direction: "In" | "Out";
  itemType: "Product" | "Material";
  sku?: string;
  reason: string;
  qty: number;
  availableQty?: number;
}) {
  if (!(input.qty > 0)) throw new DomainError("Adjustment quantity must be positive.");
  if (input.itemType === "Product" && !input.sku) throw new DomainError("Product adjustment requires a SKU.");
  if (!input.sku && !(input.itemType === "Material" && input.reason === "Unmonitored material"))
    throw new DomainError("No-SKU stock is allowed only for controlled unmonitored Material.");
  if (input.direction === "Out" && input.qty > (input.availableQty ?? 0))
    throw new DomainError("Adjustment Out cannot consume frozen inventory.");
}

export function assertFaultyReceiptAllowed(status: SerialStatus | undefined, hasActiveRepairReturn: boolean) {
  if (status === "Repair" || hasActiveRepairReturn)
    throw new DomainError(
      "This serial number has already been received into repair inventory.",
      "ALREADY_RECEIVED_FOR_REPAIR",
    );
}

export function formatPickupCode(warehouse: WarehouseCode, sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1) throw new DomainError("Pickup sequence must be a positive integer.");
  return `${warehouse}-${String(sequence).padStart(5, "0")}`;
}
