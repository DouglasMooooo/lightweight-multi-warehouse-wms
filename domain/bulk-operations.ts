import { normalizeSerialBatch } from "./bulk-serial";

export type BulkOperationMode =
  | "NEW_INBOUND"
  | "FAULTY_RECEIVING"
  | "LEGACY_REPAIR_GOOD"
  | "BIND_EXISTING";

export type FaultyValidationCode =
  | "VALID"
  | "UNKNOWN_SN_CAN_REGISTER"
  | "ERP_NOT_FOUND"
  | "DUPLICATE_RETURN"
  | "ALREADY_IN_REPAIR"
  | "SKU_MISMATCH"
  | "MANUAL_REVIEW";

export function validateNewInboundBatch(input: {
  serialNumbers: string[];
  expectedQty: number;
  existingSerialNumbers: Set<string>;
}) {
  const serialNumbers = normalizeSerialBatch(input.serialNumbers);
  const seen = new Set<string>();
  return serialNumbers.map((serialNumber) => {
    if (seen.has(serialNumber))
      return { serialNumber, valid: false, code: "DUPLICATE_IN_BATCH" as const };
    seen.add(serialNumber);
    if (input.existingSerialNumbers.has(serialNumber))
      return { serialNumber, valid: false, code: "SN_ALREADY_EXISTS" as const };
    if (serialNumbers.length !== input.expectedQty)
      return { serialNumber, valid: false, code: "QUANTITY_MISMATCH" as const };
    return { serialNumber, valid: true, code: "VALID" as const };
  });
}

export function classifyFaultyReceipt(input: {
  duplicateInBatch: boolean;
  existingStatus?: string;
  activeRepairReturn: boolean;
  existingSku?: string;
  resolvedSku?: string;
  erpFound: boolean;
  existsInWms: boolean;
}): { valid: boolean; code: FaultyValidationCode } {
  if (input.duplicateInBatch || input.activeRepairReturn)
    return { valid: false, code: "DUPLICATE_RETURN" };
  if (input.existingStatus === "Repair")
    return { valid: false, code: "ALREADY_IN_REPAIR" };
  if (input.existingStatus && input.existingStatus !== "Outbound")
    return { valid: false, code: "MANUAL_REVIEW" };
  if (input.existingSku && input.resolvedSku && input.existingSku !== input.resolvedSku)
    return { valid: false, code: "SKU_MISMATCH" };
  if (!input.resolvedSku)
    return { valid: false, code: input.erpFound ? "MANUAL_REVIEW" : "ERP_NOT_FOUND" };
  return {
    valid: true,
    code: input.existsInWms ? "VALID" : "UNKNOWN_SN_CAN_REGISTER",
  };
}

export function canSatisfyNormalOutbound(requiredCondition: string, serialCondition: string) {
  return (
    (requiredCondition === "New" || requiredCondition === "Repair_Good") &&
    serialCondition === requiredCondition
  );
}
