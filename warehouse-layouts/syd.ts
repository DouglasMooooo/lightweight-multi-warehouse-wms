export type SydneyFloorAreaId = "REPAIR" | "R1" | "R2" | "FLEX" | "RETURN" | "DISPATCH";

export interface WarehouseFloorAreaLayout {
  id: SydneyFloorAreaId;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: "horizontal" | "vertical";
  kind: "rack" | "service";
}

export const sydWarehouseLayout: WarehouseFloorAreaLayout[] = [
  { id: "REPAIR", x: 594, y: 214, width: 182, height: 80, orientation: "horizontal", kind: "service" },
  { id: "R1", x: 48, y: 34, width: 520, height: 172, orientation: "vertical", kind: "rack" },
  { id: "R2", x: 48, y: 240, width: 520, height: 172, orientation: "vertical", kind: "rack" },
  { id: "RETURN", x: 594, y: 304, width: 182, height: 108, orientation: "horizontal", kind: "service" },
  { id: "FLEX", x: 594, y: 124, width: 182, height: 80, orientation: "horizontal", kind: "service" },
  { id: "DISPATCH", x: 594, y: 34, width: 182, height: 80, orientation: "horizontal", kind: "service" }
];

export function sydneyAreaForLocation(location: {
  code: string;
  rack?: string | null;
  zone?: string | null;
}): SydneyFloorAreaId | undefined {
  const rack = location.rack?.toUpperCase();
  if (rack === "R1" || rack === "R2") return rack;
  const identity = `${location.zone ?? ""} ${location.code}`.toUpperCase();
  if (identity.includes("REPAIR")) return "REPAIR";
  if (identity.includes("RETURN")) return "RETURN";
  if (identity.includes("DISPATCH")) return "DISPATCH";
  if (identity.includes("FLEX")) return "FLEX";
  return undefined;
}
