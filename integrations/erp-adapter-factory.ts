import { DomainError } from "@/domain/errors";
import { normalizeAppEnvironment } from "@/lib/environment";
import type { ERPAdapter } from "./erp-adapter";
import { KingdeeERPAdapter, type KingdeeAdapterConfig } from "./kingdee-erp-adapter";
import { MockERPAdapter } from "./mock-erp-adapter";
import { UnconfiguredERPAdapter } from "./unconfigured-erp-adapter";

type ERPEnvironment = Record<string, string | undefined>;

export function kingdeeConfigFromEnvironment(env: ERPEnvironment): KingdeeAdapterConfig | null {
  const required = [
    "KINGDEE_BASE_URL",
    "KINGDEE_ACCESS_TOKEN",
    "KINGDEE_SERIAL_LOOKUP_PATH",
    "KINGDEE_OUTBOUND_ORDER_PATH",
    "KINGDEE_TRANSFER_ORDER_PATH",
    "KINGDEE_OUTBOUND_WRITEBACK_PATH",
    "KINGDEE_TRANSFER_WRITEBACK_PATH",
    "KINGDEE_HEALTH_PATH",
  ] as const;
  if (required.some((key) => !env[key]?.trim())) return null;
  return {
    baseUrl: env.KINGDEE_BASE_URL!,
    accessToken: env.KINGDEE_ACCESS_TOKEN!,
    serialLookupPath: env.KINGDEE_SERIAL_LOOKUP_PATH!,
    outboundOrderPath: env.KINGDEE_OUTBOUND_ORDER_PATH!,
    transferOrderPath: env.KINGDEE_TRANSFER_ORDER_PATH!,
    outboundWriteBackPath: env.KINGDEE_OUTBOUND_WRITEBACK_PATH!,
    transferWriteBackPath: env.KINGDEE_TRANSFER_WRITEBACK_PATH!,
    healthPath: env.KINGDEE_HEALTH_PATH!,
  };
}

export function createERPAdapter(env: ERPEnvironment = process.env): ERPAdapter {
  const appEnv = normalizeAppEnvironment(env.APP_ENV ?? env.VERCEL_ENV ?? env.NODE_ENV);
  const configured = env.ERP_ADAPTER?.trim().toLowerCase();
  const selection = configured || (appEnv === "development" || appEnv === "test" ? "mock" : "unconfigured");

  if (selection === "mock") {
    if (appEnv === "production")
      throw new DomainError("Production cannot use MockERPAdapter.", "ERP_MOCK_FORBIDDEN");
    return new MockERPAdapter();
  }

  if (selection === "kingdee") {
    const config = kingdeeConfigFromEnvironment(env);
    if (!config) {
      if (appEnv === "production")
        throw new DomainError("Kingdee ERP configuration is incomplete.", "ERP_CONNECTION_NOT_CONFIGURED");
      return new UnconfiguredERPAdapter();
    }
    return new KingdeeERPAdapter(config);
  }

  if (selection === "unconfigured" && appEnv !== "production")
    return new UnconfiguredERPAdapter();

  throw new DomainError(
    `Unsupported ERP adapter configuration: ${selection}.`,
    selection === "unconfigured" ? "ERP_CONNECTION_NOT_CONFIGURED" : "ERP_ADAPTER_INVALID",
  );
}
