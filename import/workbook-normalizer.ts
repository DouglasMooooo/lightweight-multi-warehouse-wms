import type { ItemType, StockCondition } from "@/domain/types";
import { DomainError } from "@/domain/errors";
import type { WorkbookCellValue } from "./workbook-types";

export function normalizeText(value: WorkbookCellValue | undefined) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || undefined;
}

export function normalizeHeader(value: WorkbookCellValue | undefined) {
  return (normalizeText(value) ?? "")
    .toLowerCase()
    .replace(/[：:（）()_\-\/\\\s]/g, "");
}

export function normalizeSku(value: WorkbookCellValue | undefined) {
  return normalizeText(value)?.toUpperCase();
}

export function normalizeSerial(value: WorkbookCellValue | undefined) {
  return normalizeText(value)?.toUpperCase();
}

export function normalizeLocation(value: WorkbookCellValue | undefined) {
  return normalizeText(value)?.toUpperCase();
}

export function normalizeBoolean(value: WorkbookCellValue | undefined, defaultValue = false) {
  const text = normalizeText(value)?.toLowerCase();
  if (!text) return defaultValue;
  return ["yes", "y", "true", "1", "active", "启用", "是"].includes(text);
}

export function normalizeItemType(value: WorkbookCellValue | undefined): ItemType {
  const text = normalizeText(value)?.toLowerCase().split("/")[0].trim();
  if (text === "product" || text === "产品" || text === "成品") return "Product";
  if (text === "material" || text === "物料" || text === "材料") return "Material";
  throw new DomainError(`Invalid item type: ${normalizeText(value) ?? "(blank)"}`, "INVALID_ITEM_TYPE");
}

export function normalizeCondition(value: WorkbookCellValue | undefined): StockCondition {
  const text = normalizeText(value)?.toLowerCase().split("/")[0].trim().replace(/[\s-]+/g, "_");
  const aliases: Record<string, StockCondition> = {
    new: "New",
    新品: "New",
    repair_good: "Repair_Good",
    repairgood: "Repair_Good",
    良品: "Repair_Good",
    维修良品: "Repair_Good",
    repair: "Repair",
    维修: "Repair",
    坏机: "Repair",
    scrap: "Scrap",
    报废: "Scrap",
    material: "Material",
    物料: "Material",
  };
  const condition = text ? aliases[text] : undefined;
  if (!condition)
    throw new DomainError(
      `Invalid stock condition: ${normalizeText(value) ?? "(blank)"}`,
      "INVALID_STOCK_CONDITION",
    );
  return condition;
}

export function normalizeQuantity(value: WorkbookCellValue | undefined) {
  const quantity = typeof value === "number" ? value : Number(normalizeText(value));
  if (!Number.isFinite(quantity))
    throw new DomainError(`Invalid quantity: ${normalizeText(value) ?? "(blank)"}`, "INVALID_QUANTITY");
  return quantity;
}

export function normalizeDate(value: WorkbookCellValue | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + value * 86_400_000);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const text = normalizeText(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
