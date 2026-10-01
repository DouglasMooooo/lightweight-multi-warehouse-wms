import { DomainError } from "@/domain/errors";
import type { ERPAdapter } from "./erp-adapter";

const notConfigured = () => {
  throw new DomainError("ERP connection is not configured.", "ERP_CONNECTION_NOT_CONFIGURED");
};

export class UnconfiguredERPAdapter implements ERPAdapter {
  async findBySerialNumber() {
    return notConfigured();
  }

  async getOutboundOrder() {
    return notConfigured();
  }

  async getTransferOrder() {
    return notConfigured();
  }

  async writeBackOutbound() {
    return notConfigured();
  }

  async writeBackTransfer() {
    return notConfigured();
  }

  async healthCheck() {
    return { ok: false, adapter: "Not configured" };
  }
}
