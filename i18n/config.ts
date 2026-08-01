import en from "./messages/en.json";
import zhCN from "./messages/zh-CN.json";
import bulkEn from "./messages/bulk-en.json";
import bulkZhCN from "./messages/bulk-zh-CN.json";
import sprint5En from "./messages/sprint5-en.json";
import sprint5ZhCN from "./messages/sprint5-zh-CN.json";
import sprint51En from "./messages/sprint51-en.json";
import sprint51ZhCN from "./messages/sprint51-zh-CN.json";
import sprint6En from "./messages/sprint6-en.json";
import sprint6ZhCN from "./messages/sprint6-zh-CN.json";
import sprint61En from "./messages/sprint61-en.json";
import sprint61ZhCN from "./messages/sprint61-zh-CN.json";
import finalPatchEn from "./messages/final-patch-en.json";
import finalPatchZhCN from "./messages/final-patch-zh-CN.json";

export const supportedLocales = ["en", "zh-CN"] as const;
export type Locale = (typeof supportedLocales)[number];
export type TranslationKey = keyof typeof en | keyof typeof bulkEn | keyof typeof sprint5En | keyof typeof sprint51En | keyof typeof sprint6En | keyof typeof sprint61En | keyof typeof finalPatchEn;
export const defaultLocale: Locale = "en";
export const localeStorageKey = "wms-ui-locale";

const messages: Record<Locale, Record<string, string>> = {
  en: { ...en, ...bulkEn, ...sprint5En, ...sprint51En, ...sprint6En, ...sprint61En, ...finalPatchEn },
  "zh-CN": { ...zhCN, ...bulkZhCN, ...sprint5ZhCN, ...sprint51ZhCN, ...sprint6ZhCN, ...sprint61ZhCN, ...finalPatchZhCN },
};

export function isLocale(value: unknown): value is Locale {
  return supportedLocales.includes(value as Locale);
}

export function persistLocalePreference(
  storage: Pick<Storage, "setItem">,
  locale: Locale,
  currentRoute: string,
) {
  storage.setItem(localeStorageKey, locale);
  return currentRoute;
}

export function translate(locale: Locale, key: TranslationKey | string, values: Record<string, string | number> = {}) {
  const message = messages[locale][key] ?? messages.en[key];
  if (!message) return process.env.NODE_ENV === "production" ? key : `⟦${key}⟧`;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    message,
  );
}

export function translateStatus(locale: Locale, domainCode: string) {
  return translate(locale, `status.${domainCode}`);
}

const auditOperationKeys: Record<string, string> = {
  "Seeded PostgreSQL Preview": "audit.operation.seededPreview",
  "Migrated demo transfer SN prefix": "audit.operation.migratedDemoTransfer",
  "Corrected demo transfer fixture": "audit.operation.correctedDemoTransfer",
  "Prepared demo transfer fixture": "audit.operation.preparedDemoTransfer",
  "Created scanner transfer batch": "audit.operation.createdScannerTransfer",
  "Bulk new stock inbound": "audit.operation.bulkNewInbound",
  "Bulk faulty receiving": "audit.operation.bulkFaultyReceiving",
  "Legacy Repair_Good recognition": "audit.operation.legacyRepairGood",
  "Bulk serial registration": "audit.operation.bulkSerialRegistration",
  "Bulk serial assignment": "audit.operation.bulkSerialAssignment",
  "Confirmed outbound review preparation": "audit.operation.confirmedOutboundReview",
  SHADOW_SEED: "audit.operation.shadowSeed",
  "Generated pickup code": "audit.operation.generatedPickupCode",
  "Imported replacement outbound": "audit.operation.importedReplacement",
  "Allocated outbound": "audit.operation.allocatedOutbound",
  "Prepared outbound": "audit.operation.preparedOutbound",
  "Allocated outbound serial": "audit.operation.allocatedOutboundSerial",
  "Confirmed outbound": "audit.operation.confirmedOutbound",
  "Registered serial": "audit.operation.registeredSerial",
  "Received faulty serial": "audit.operation.receivedFaultySerial",
  "Completed repair": "audit.operation.completedRepair",
  "Started repair": "audit.operation.startedRepair",
  "Recognised legacy Repair_Good": "audit.operation.recognisedLegacyRepairGood",
  "Moved stock": "audit.operation.movedStock",
  "Transfer Out": "audit.operation.transferOut",
  "Transfer In": "audit.operation.transferIn",
};

export function translateAuditOperation(locale: Locale, operation: string) {
  const key = auditOperationKeys[operation];
  return key ? translate(locale, key) : operation;
}

const roleKeys: Record<string, string> = {
  Warehouse_Supervisor: "role.Warehouse_Supervisor",
  Warehouse_Operator: "role.Warehouse_Operator",
  Admin: "role.Admin",
  Viewer: "role.Viewer",
};

export function translateRole(locale: Locale, role: string) {
  const key = roleKeys[role];
  return key ? translate(locale, key) : role;
}

export function translateError(locale: Locale, code: string | undefined, fallback?: string) {
  const key = code ? `error.${code}` : "error.UNKNOWN";
  const translated = messages[locale][key] ?? messages.en[key];
  return translated ?? fallback ?? translate(locale, "error.UNKNOWN");
}
