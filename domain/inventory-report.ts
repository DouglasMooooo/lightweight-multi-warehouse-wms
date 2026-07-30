import type { ItemType, StockCondition } from "./types";

export interface InventoryReportAggregateInput {
  warehouseCode: string;
  productId: string;
  sku: string;
  model: string;
  itemType: ItemType;
  condition: StockCondition;
  locationId: string;
  physicalQty: number;
  frozenQty: number;
  inTransitQty: number;
  legacySerialGap: boolean;
}

export interface InventoryReportRow {
  warehouseCode: string;
  productId: string;
  sku: string;
  model: string;
  itemType: ItemType;
  physicalQty: number;
  frozenQty: number;
  availableQty: number;
  inTransitQty: number;
  newQty: number;
  repairGoodQty: number;
  repairQty: number;
  scrapQty: number;
  materialQty: number;
  locationCount: number;
  knownSerialCount: number;
  legacySerialGap: boolean;
  serialCoverageGap: number;
}

export interface InventoryReportFilters {
  query?: string;
  itemType?: ItemType | "All";
  availableOnly?: boolean;
  frozenOnly?: boolean;
  legacyOnly?: boolean;
}

const keyFor = (warehouseCode: string, productId: string) => `${warehouseCode}:${productId}`;

export function aggregateInventoryReport(
  inputs: InventoryReportAggregateInput[],
  knownSerialCounts: ReadonlyMap<string, number> = new Map(),
) {
  const rows = new Map<string, InventoryReportRow & { locations: Set<string> }>();
  for (const input of inputs) {
    const key = keyFor(input.warehouseCode, input.productId);
    const current = rows.get(key) ?? {
      warehouseCode: input.warehouseCode,
      productId: input.productId,
      sku: input.sku,
      model: input.model,
      itemType: input.itemType,
      physicalQty: 0,
      frozenQty: 0,
      availableQty: 0,
      inTransitQty: 0,
      newQty: 0,
      repairGoodQty: 0,
      repairQty: 0,
      scrapQty: 0,
      materialQty: 0,
      locationCount: 0,
      knownSerialCount: 0,
      legacySerialGap: false,
      serialCoverageGap: 0,
      locations: new Set<string>(),
    };
    current.physicalQty += input.physicalQty;
    current.frozenQty += input.frozenQty;
    current.inTransitQty += input.inTransitQty;
    current.legacySerialGap ||= input.legacySerialGap;
    current.locations.add(input.locationId);
    if (input.condition === "New") current.newQty += input.physicalQty;
    if (input.condition === "Repair_Good") current.repairGoodQty += input.physicalQty;
    if (input.condition === "Repair") current.repairQty += input.physicalQty;
    if (input.condition === "Scrap") current.scrapQty += input.physicalQty;
    if (input.condition === "Material") current.materialQty += input.physicalQty;
    rows.set(key, current);
  }
  return [...rows.entries()].map(([key, row]) => {
    const knownSerialCount = knownSerialCounts.get(key) ?? 0;
    const { locations, ...value } = row;
    return {
      ...value,
      availableQty: value.physicalQty - value.frozenQty,
      locationCount: locations.size,
      knownSerialCount,
      serialCoverageGap: Math.max(0, value.physicalQty - knownSerialCount),
    };
  });
}

export function applyInventoryReportFilters(rows: InventoryReportRow[], filters: InventoryReportFilters) {
  const query = filters.query?.trim().toUpperCase();
  return rows.filter((row) =>
    (!query || row.sku.toUpperCase().includes(query) || row.model.toUpperCase().includes(query)) &&
    (!filters.itemType || filters.itemType === "All" || row.itemType === filters.itemType) &&
    (!filters.availableOnly || row.availableQty > 0) &&
    (!filters.frozenOnly || row.frozenQty > 0) &&
    (!filters.legacyOnly || row.legacySerialGap)
  );
}

export function sortInventoryReportRows(
  rows: InventoryReportRow[],
  sort: "sku" | "physical" | "available" | "frozen" | "inTransit" = "physical",
  order: "asc" | "desc" = "desc",
) {
  const direction = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort === "sku") return direction * a.sku.localeCompare(b.sku);
    const field = sort === "inTransit" ? "inTransitQty" : `${sort}Qty` as
      "physicalQty" | "availableQty" | "frozenQty";
    return direction * (a[field] - b[field]) || a.sku.localeCompare(b.sku);
  });
}

const csvCell = (value: string | number | boolean) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function buildInventoryReportCsv(rows: InventoryReportRow[]) {
  const header = [
    "Warehouse", "SKU", "Model", "Item Type", "Physical", "Available", "Frozen", "In Transit",
    "New", "Repair Good", "Repair", "Scrap", "Known SN", "Legacy Gap",
  ];
  const body = rows.map((row) => [
    row.warehouseCode, row.sku, row.model, row.itemType, row.physicalQty, row.availableQty,
    row.frozenQty, row.inTransitQty, row.newQty, row.repairGoodQty, row.repairQty, row.scrapQty,
    row.knownSerialCount, row.legacySerialGap,
  ]);
  return [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
