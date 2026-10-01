export type BulkRegistrationCode =
  | "VALID"
  | "DUPLICATE_IN_BATCH"
  | "SN_ALREADY_EXISTS"
  | "INVALID_SKU"
  | "INVALID_LOCATION"
  | "INVALID_CONDITION"
  | "SERIAL_TRACKING_NOT_REQUIRED"
  | "REGISTRATION_CAPACITY_EXCEEDED";

export function evaluateRegistrationBatch(input: {
  serialNumbers: string[];
  existingSerialNumbers: Set<string>;
  availableCapacity: number;
  contextError?: { code: BulkRegistrationCode; message: string };
}) {
  const seen = new Set<string>();
  let accepted = 0;
  return input.serialNumbers.map((serialNumber) => {
    if (seen.has(serialNumber))
      return {
        serialNumber,
        valid: false,
        code: "DUPLICATE_IN_BATCH" as const,
        message: "Duplicate serial number in this batch.",
      };
    seen.add(serialNumber);
    if (input.contextError)
      return { serialNumber, valid: false, ...input.contextError };
    if (input.existingSerialNumbers.has(serialNumber))
      return {
        serialNumber,
        valid: false,
        code: "SN_ALREADY_EXISTS" as const,
        message: "Serial number already exists.",
      };
    if (accepted >= input.availableCapacity)
      return {
        serialNumber,
        valid: false,
        code: "REGISTRATION_CAPACITY_EXCEEDED" as const,
        message: "Batch exceeds remaining physical registration capacity.",
      };
    accepted += 1;
    return {
      serialNumber,
      valid: true,
      code: "VALID" as const,
      message: "Valid for inventory registration.",
    };
  });
}
