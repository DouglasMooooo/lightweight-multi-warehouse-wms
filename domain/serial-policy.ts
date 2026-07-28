import { DomainError } from "./errors";
import type { SerialStatus, StockCondition } from "./types";

export const PHYSICALLY_PRESENT_SERIAL_STATUSES = [
  "In_Stock",
  "Prepared",
  "Repair",
] as const satisfies readonly SerialStatus[];

export function isPhysicallyPresentSerialStatus(status: SerialStatus) {
  return PHYSICALLY_PRESENT_SERIAL_STATUSES.some((candidate) => candidate === status);
}

export function isAllocatableStockCondition(condition: StockCondition) {
  return condition === "New" || condition === "Repair_Good" || condition === "Material";
}

export function registeredSerialStatusForCondition(condition: StockCondition): SerialStatus {
  if (condition === "New" || condition === "Repair_Good") return "In_Stock";
  if (condition === "Repair") return "Repair";
  throw new DomainError(
    `${condition} inventory does not support normal serial registration.`,
    "INVALID_SERIAL_REGISTRATION_CONDITION",
  );
}

export function assertSerialRegistrationCapacity(input: {
  serialTrackingRequired: boolean;
  physicalQty: number;
  activePhysicalSerialCount: number;
}) {
  if (!input.serialTrackingRequired)
    throw new DomainError(
      "Serial registration is allowed only for serial-tracked products.",
      "SERIAL_TRACKING_NOT_REQUIRED",
    );
  if (input.physicalQty <= 0)
    throw new DomainError(
      "No positive matching physical balance exists for this serial.",
      "NO_UNASSIGNED_PHYSICAL_UNIT_FOR_SN",
    );
  if (input.physicalQty - input.activePhysicalSerialCount < 1)
    throw new DomainError(
      "No unassigned physical unit remains for another serial number.",
      "NO_UNASSIGNED_PHYSICAL_UNIT_FOR_SN",
    );
}
