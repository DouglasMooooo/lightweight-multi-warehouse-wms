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

export const supportedLocales = ["en", "zh-CN"] as const;
export type Locale = (typeof supportedLocales)[number];
export type TranslationKey = keyof typeof en | keyof typeof bulkEn | keyof typeof sprint5En | keyof typeof sprint51En | keyof typeof sprint6En | keyof typeof sprint61En;
export const defaultLocale: Locale = "en";
export const localeStorageKey = "wms-ui-locale";

const messages: Record<Locale, Record<string, string>> = {
  en: { ...en, ...bulkEn, ...sprint5En, ...sprint51En, ...sprint6En, ...sprint61En },
  "zh-CN": { ...zhCN, ...bulkZhCN, ...sprint5ZhCN, ...sprint51ZhCN, ...sprint6ZhCN, ...sprint61ZhCN },
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

export function translateError(locale: Locale, code: string | undefined, fallback?: string) {
  const key = code ? `error.${code}` : "error.UNKNOWN";
  const translated = messages[locale][key] ?? messages.en[key];
  return translated ?? fallback ?? translate(locale, "error.UNKNOWN");
}
