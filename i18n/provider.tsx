"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultLocale,
  isLocale,
  localeStorageKey,
  persistLocalePreference,
  translate,
  translateError,
  translateStatus,
  type Locale,
  type TranslationKey,
} from "./config";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey | string, values?: Record<string, string | number>) => string;
  status: (code: string) => string;
  error: (code?: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  useEffect(() => {
    const stored = window.localStorage.getItem(localeStorageKey);
    // Hydrate the client-only operator preference after the stable SSR default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLocale(stored)) setLocaleState(stored);
  }, []);
  function setLocale(next: Locale) {
    setLocaleState(next);
    persistLocalePreference(window.localStorage, next, window.location.pathname);
    document.documentElement.lang = next;
  }
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
      status: (code) => translateStatus(locale, code),
      error: (code, fallback) => translateError(locale, code, fallback),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider.");
  return value;
}
