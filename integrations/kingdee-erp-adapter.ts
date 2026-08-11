import { DomainError } from "@/domain/errors";
import type {
  ERPAdapter,
  ERPOutboundOrder,
  ERPSerialLookup,
} from "./erp-adapter";

export interface KingdeeAdapterConfig {
  baseUrl: string;
  accessToken: string;
  serialLookupPath: string;
  outboundOrderPath: string;
  transferOrderPath: string;
  outboundWriteBackPath: string;
  transferWriteBackPath: string;
  healthPath: string;
}

type Fetcher = typeof fetch;
type GatewayEnvelope<T> = { ok: boolean; data?: T; error?: string; code?: string };

function assertOutboundOrder(value: unknown): asserts value is ERPOutboundOrder {
  const order = value as ERPOutboundOrder | undefined;
  if (
    !order ||
    typeof order.shNo !== "string" ||
    typeof order.physicalWarehouseCode !== "string" ||
    !Array.isArray(order.replacementUnitInformation)
  ) {
    throw new DomainError("Kingdee gateway returned an invalid outbound order.", "ERP_INVALID_RESPONSE");
  }
  for (const line of order.replacementUnitInformation) {
    if (
      !line ||
      typeof line.sku !== "string" ||
      typeof line.model !== "string" ||
      typeof line.quantity !== "number" ||
      typeof line.erpWarehouse !== "string"
    ) {
      throw new DomainError("Kingdee gateway returned an invalid replacement line.", "ERP_INVALID_RESPONSE");
    }
  }
}

/**
 * The WMS boundary consumes a normalized gateway contract. Raw Kingdee payload
 * mapping belongs in the integration gateway once the real API contract is supplied.
 */
export class KingdeeERPAdapter implements ERPAdapter {
  constructor(
    private readonly config: KingdeeAdapterConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  private async request<T>(path: string, body?: unknown): Promise<T | null> {
    const response = await this.fetcher(new URL(path, this.config.baseUrl), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.config.accessToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = (await response.json().catch(() => null)) as GatewayEnvelope<T> | null;
    if (!response.ok || !envelope?.ok) {
      throw new DomainError(
        envelope?.error || `ERP request failed with HTTP ${response.status}.`,
        envelope?.code || "ERP_REQUEST_FAILED",
      );
    }
    return envelope.data ?? null;
  }

  async findBySerialNumber(serialNumber: string): Promise<ERPSerialLookup | null> {
    return this.request<ERPSerialLookup>(this.config.serialLookupPath, { serialNumber });
  }

  async getOutboundOrder(shNo: string): Promise<ERPOutboundOrder | null> {
    const order = await this.request<ERPOutboundOrder>(this.config.outboundOrderPath, { shNo });
    if (order) assertOutboundOrder(order);
    return order;
  }

  async getTransferOrder(transferNo: string) {
    return this.request<unknown>(this.config.transferOrderPath, { transferNo });
  }

  async writeBackOutbound(payload: unknown) {
    return (await this.request<{ accepted: boolean }>(this.config.outboundWriteBackPath, payload)) ?? { accepted: false };
  }

  async writeBackTransfer(payload: unknown) {
    return (await this.request<{ accepted: boolean }>(this.config.transferWriteBackPath, payload)) ?? { accepted: false };
  }

  async healthCheck() {
    const result = await this.request<{ connected: boolean }>(this.config.healthPath);
    return { ok: Boolean(result?.connected), adapter: "Kingdee" };
  }
}
