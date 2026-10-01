import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";
import {
  localeStorageKey,
  persistLocalePreference,
  translate,
  translateStatus,
} from "@/i18n/config";
import {
  assertDemoResetAllowed,
  assertSafeEnvironment,
  assertShadowSeedAllowed,
  canShowShadowSeed,
  shouldShowEnvironmentBanner,
} from "@/lib/environment";
import {
  beginScanSubmission,
  completeScanSubmission,
  restoreScannerFocus,
} from "@/lib/scanner";
import {
  formatWarehouseDateTime,
  warehouseWallClockToUtc,
} from "@/lib/warehouse-time";

describe("Sprint 3.5 i18n", () => {
  it("keeps every English key present in Simplified Chinese", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
    expect(translate("en", "nav.inventory")).toBe("Current Stock");
    expect(translate("zh-CN", "nav.inventory")).toBe("当前库存");
  });

  it("maps statuses in both languages without changing the domain code", () => {
    const code = "Pending_Allocation";
    expect(translateStatus("en", code)).toBe("Needs Allocation");
    expect(translateStatus("zh-CN", code)).toBe("待分配库位");
    expect(code).toBe("Pending_Allocation");
  });

  it("fails visibly for an unknown development key", () => {
    expect(translate("en", "missing.translation")).toBe("⟦missing.translation⟧");
  });

  it("persists language without changing the route", () => {
    const writes: Record<string, string> = {};
    const route = persistLocalePreference(
      { setItem: (key, value) => { writes[key] = value; } },
      "zh-CN",
      "/outbound/order-1",
    );
    expect(route).toBe("/outbound/order-1");
    expect(writes[localeStorageKey]).toBe("zh-CN");
  });
});

describe("warehouse timezone semantics", () => {
  it("interprets Sydney winter wall-clock independently of browser timezone", () => {
    expect(warehouseWallClockToUtc("2026-07-29T18:00", "Australia/Sydney").toISOString())
      .toBe("2026-07-29T08:00:00.000Z");
  });

  it("is DST-aware for Sydney summer", () => {
    expect(warehouseWallClockToUtc("2026-01-29T18:00", "Australia/Sydney").toISOString())
      .toBe("2026-01-29T07:00:00.000Z");
  });

  it("formats English and Chinese in warehouse time", () => {
    const instant = "2026-07-29T08:30:00.000Z";
    expect(formatWarehouseDateTime(instant, "en", "Australia/Sydney")).toContain("29 Jul 2026");
    expect(formatWarehouseDateTime(instant, "zh-CN", "Australia/Sydney")).toContain("2026年7月29日");
    expect(formatWarehouseDateTime(instant, "zh-CN", "Australia/Sydney")).toContain("18:30");
  });
});

describe("production and preview guards", () => {
  it("never exposes SHADOW_SEED in production UI and rejects it on the backend", () => {
    expect(canShowShadowSeed({ appEnv: "production", enabled: "true", adminTools: "true" })).toBe(false);
    expect(() => assertShadowSeedAllowed({ appEnv: "production", enabled: "true" })).toThrow("disabled");
  });

  it("rejects demo reset in production", () => {
    expect(() => assertDemoResetAllowed({ appEnv: "production", demoMode: "true" })).toThrow("disabled");
  });

  it("blocks preview applications from production databases", () => {
    expect(() => assertSafeEnvironment({ appEnv: "preview", databaseEnv: "production" }))
      .toThrow("Unsafe environment pairing");
  });

  it("requires an explicit database environment for deployed applications", () => {
    expect(() => assertSafeEnvironment({ appEnv: "preview" }))
      .toThrow("DATABASE_ENV is required");
  });

  it("requires production applications to use the production database environment", () => {
    expect(() => assertSafeEnvironment({ appEnv: "production", databaseEnv: "preview" }))
      .toThrow("DATABASE_ENV=production");
  });

  it("shows environment banner only outside production", () => {
    expect(shouldShowEnvironmentBanner("preview")).toBe(true);
    expect(shouldShowEnvironmentBanner("staging")).toBe(true);
    expect(shouldShowEnvironmentBanner("production")).toBe(false);
  });
});

describe("scanner-first interaction state", () => {
  it("Enter submission normalizes the scan and prevents rapid duplicates", () => {
    const first = beginScanSubmission({ value: " sn-001 ", inFlight: false }, 1000);
    expect(first).toMatchObject({ accepted: true, value: "SN-001" });
    if (!first.accepted) throw new Error("Expected scan to start.");
    const completed = completeScanSubmission(first.state, { accepted: true, message: "accepted" });
    expect(completed.value).toBe("");
    const duplicate = beginScanSubmission({ ...completed, value: "SN-001" }, 1500);
    expect(duplicate.accepted).toBe(false);
  });

  it("keeps operator input after an error and restores focus", () => {
    const started = beginScanSubmission({ value: "SN-BAD", inFlight: false }, 1000);
    if (!started.accepted) throw new Error("Expected scan to start.");
    const completed = completeScanSubmission(started.state, { accepted: false, message: "wrong location" });
    expect(completed.value).toBe("SN-BAD");
    let focused = false;
    restoreScannerFocus({ focus: () => { focused = true; } });
    expect(focused).toBe(true);
  });
});
