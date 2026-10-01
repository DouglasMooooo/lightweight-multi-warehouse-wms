export type BulkSerialCode =
  | "VALID"
  | "DUPLICATE_IN_BATCH"
  | "UNKNOWN_SN"
  | "SN_WRONG_SKU"
  | "SN_WRONG_CONDITION"
  | "SN_WRONG_WAREHOUSE"
  | "SN_WRONG_LOCATION"
  | "SN_NOT_ALLOCATABLE"
  | "SN_ALREADY_OUTBOUND"
  | "SN_ALREADY_ALLOCATED"
  | "SN_SCRAPPED"
  | "SN_REPAIR"
  | "EXCEEDS_REQUIRED_QTY";

export function normalizeSerialBatch(values: string[]) {
  return values
    .flatMap((value) => value.split(/[\r\n,\t;]+/))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

export function classifyBulkSerial(input: {
  duplicate: boolean;
  exists: boolean;
  skuMatches?: boolean;
  condition?: string;
  requiredCondition?: string;
  warehouseMatches?: boolean;
  locationMatches?: boolean;
  status?: string;
  assignedElsewhere?: boolean;
  exceedsRequiredQty?: boolean;
}): { valid: boolean; code: BulkSerialCode; message: string } {
  if (input.duplicate) return { valid: false, code: "DUPLICATE_IN_BATCH", message: "Duplicate serial number in this batch." };
  if (!input.exists) return { valid: false, code: "UNKNOWN_SN", message: "Serial number is not registered." };
  if (!input.skuMatches) return { valid: false, code: "SN_WRONG_SKU", message: "Serial belongs to another SKU." };
  if (input.condition === "Scrap" || input.status === "Scrapped")
    return { valid: false, code: "SN_SCRAPPED", message: "Scrapped serial cannot be allocated." };
  if (input.condition === "Repair" || input.status === "Repair")
    return { valid: false, code: "SN_REPAIR", message: "Repair serial cannot be allocated." };
  if (input.condition !== input.requiredCondition)
    return { valid: false, code: "SN_WRONG_CONDITION", message: "Serial condition does not match the outbound line." };
  if (input.status === "Outbound")
    return { valid: false, code: "SN_ALREADY_OUTBOUND", message: "Serial is already outbound." };
  if (!input.warehouseMatches)
    return { valid: false, code: "SN_WRONG_WAREHOUSE", message: "Serial is in another physical warehouse." };
  if (!input.locationMatches)
    return { valid: false, code: "SN_WRONG_LOCATION", message: "Serial is not at an allocated physical location." };
  if (input.assignedElsewhere)
    return { valid: false, code: "SN_ALREADY_ALLOCATED", message: "Serial is allocated to another outbound order." };
  if (!["In_Stock", "Prepared"].includes(input.status ?? ""))
    return { valid: false, code: "SN_NOT_ALLOCATABLE", message: "Serial status is not allocatable." };
  if (input.exceedsRequiredQty)
    return { valid: false, code: "EXCEEDS_REQUIRED_QTY", message: "Serial count exceeds the outbound line required quantity." };
  return { valid: true, code: "VALID", message: "Valid for assignment." };
}
