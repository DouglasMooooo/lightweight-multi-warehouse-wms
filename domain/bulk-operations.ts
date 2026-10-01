import { normalizeSerialBatch } from "./bulk-serial";

export type BulkOperationMode =
  | "NEW_INBOUND"
  | "FAULTY_RECEIVING"
  | "LEGACY_REPAIR_GOOD"
  | "BIND_EXISTING";

export type FaultyValidationCode =
  | "VALID"
  | "UNKNOWN_SN"
  | "ERP_LOOKUP_FAILED"
  | "ORIGINAL_SH_NOT_FOUND"
  | "SKU_NOT_FOUND"
  | "DUPLICATE_IN_BATCH"
  | "ALREADY_RECEIVED"
  | "WRONG_WAREHOUSE"
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
  resolvedShNo?: string;
  erpFound: boolean;
  erpLookupFailed?: boolean;
  existsInWms: boolean;
  wrongWarehouse?: boolean;
}): { valid: boolean; code: FaultyValidationCode } {
  if (input.duplicateInBatch)
    return { valid: false, code: "DUPLICATE_IN_BATCH" };
  if (input.activeRepairReturn)
    return { valid: false, code: "ALREADY_RECEIVED" };
  if (input.existingStatus === "Repair")
    return { valid: false, code: "ALREADY_RECEIVED" };
  if (input.wrongWarehouse)
    return { valid: false, code: "WRONG_WAREHOUSE" };
  if (input.existingStatus && input.existingStatus !== "Outbound")
    return { valid: false, code: "MANUAL_REVIEW" };
  if (input.existingSku && input.resolvedSku && input.existingSku !== input.resolvedSku)
    return { valid: false, code: "SKU_MISMATCH" };
  if (input.erpLookupFailed && !input.existsInWms)
    return { valid: false, code: "ERP_LOOKUP_FAILED" };
  if (!input.resolvedSku)
    return { valid: false, code: input.erpFound ? "SKU_NOT_FOUND" : "UNKNOWN_SN" };
  if (!input.resolvedShNo)
    return { valid: false, code: "ORIGINAL_SH_NOT_FOUND" };
  return { valid: true, code: "VALID" };
}

export interface ExpectedInboundRow {
  serialNumber: string;
  sku: string;
}

export function matchExpectedInboundBatch(input: {
  expected: ExpectedInboundRow[];
  received: ExpectedInboundRow[];
}) {
  const expectedBySn = new Map(
    input.expected.map((row) => [row.serialNumber.trim().toUpperCase(), row.sku.trim().toUpperCase()]),
  );
  const seen = new Set<string>();
  const results = input.received.map((row) => {
    const serialNumber = row.serialNumber.trim().toUpperCase();
    const sku = row.sku.trim().toUpperCase();
    if (seen.has(serialNumber))
      return { serialNumber, sku, result: "DUPLICATE_SN" as const };
    seen.add(serialNumber);
    const expectedSku = expectedBySn.get(serialNumber);
    if (!expectedSku)
      return { serialNumber, sku, result: "UNEXPECTED_SN" as const };
    if (expectedSku !== sku)
      return { serialNumber, sku, expectedSku, result: "SKU_MISMATCH" as const };
    return { serialNumber, sku, result: "EXPECTED_AND_RECEIVED" as const };
  });
  const missing = [...expectedBySn.entries()]
    .filter(([serialNumber]) => !seen.has(serialNumber))
    .map(([serialNumber, sku]) => ({ serialNumber, sku, result: "MISSING" as const }));
  return {
    results: [...results, ...missing],
    summary: {
      expected: expectedBySn.size,
      received: seen.size,
      matched: results.filter((row) => row.result === "EXPECTED_AND_RECEIVED").length,
      exceptions: results.filter((row) => row.result !== "EXPECTED_AND_RECEIVED").length + missing.length,
    },
  };
}

export function canSatisfyNormalOutbound(requiredCondition: string, serialCondition: string) {
  return (
    (requiredCondition === "New" || requiredCondition === "Repair_Good") &&
    serialCondition === requiredCondition
  );
}
