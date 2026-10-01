import type { StockCondition } from "./types";

export type WarehouseLocationState =
  | "Empty"
  | "Occupied"
  | "Repair_Good"
  | "Mixed"
  | "Repair"
  | "Frozen"
  | "Exception";

export interface WarehouseMapSummaryInput {
  physicalQty: number;
  frozenQty: number;
  skuCount: number;
  conditions: StockCondition[];
  exceptionCount: number;
}

export interface StructuredLocation {
  code: string;
  rack?: string | null;
  row?: number | null;
  bay?: number | null;
  side?: string | null;
  serviceZone: boolean;
}

const sideRank = (side?: string | null) => {
  const normalized = side?.toUpperCase();
  if (normalized === "L") return 0;
  if (normalized === "M") return 1;
  if (normalized === "R") return 2;
  return 3;
};

export function deriveWarehouseLocationState(input: WarehouseMapSummaryInput): WarehouseLocationState {
  if (input.exceptionCount > 0) return "Exception";
  if (input.physicalQty <= 0) return "Empty";
  if (input.frozenQty > 0) return "Frozen";
  if (input.skuCount > 1 || new Set(input.conditions).size > 1) return "Mixed";
  if (input.conditions.includes("Repair")) return "Repair";
  if (input.conditions.includes("Repair_Good")) return "Repair_Good";
  return "Occupied";
}

export function sortRackLocations<T extends StructuredLocation>(locations: T[]) {
  return [...locations].sort((a, b) =>
    (a.rack ?? "").localeCompare(b.rack ?? "") ||
    (b.row ?? -1) - (a.row ?? -1) ||
    (a.bay ?? Number.MAX_SAFE_INTEGER) - (b.bay ?? Number.MAX_SAFE_INTEGER) ||
    sideRank(a.side) - sideRank(b.side) ||
    a.code.localeCompare(b.code),
  );
}

export function splitWarehouseLocations<T extends StructuredLocation>(locations: T[]) {
  return {
    rackLocations: sortRackLocations(locations.filter((location) => !location.serviceZone && location.rack)),
    serviceLocations: [...locations]
      .filter((location) => location.serviceZone || !location.rack)
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}
