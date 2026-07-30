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
  { id: "REPAIR", x: 36, y: 42, width: 160, height: 180, orientation: "vertical", kind: "service" },
  { id: "R1", x: 242, y: 42, width: 250, height: 180, orientation: "vertical", kind: "rack" },
  { id: "R2", x: 538, y: 42, width: 250, height: 180, orientation: "vertical", kind: "rack" },
  { id: "RETURN", x: 36, y: 270, width: 160, height: 148, orientation: "horizontal", kind: "service" },
  { id: "FLEX", x: 242, y: 270, width: 250, height: 148, orientation: "horizontal", kind: "service" },
  { id: "DISPATCH", x: 538, y: 270, width: 250, height: 148, orientation: "horizontal", kind: "service" }
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
