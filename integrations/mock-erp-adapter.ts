import type { ERPAdapter, ERPSerialLookup } from "./erp-adapter";

const serialFixtures: Record<string, ERPSerialLookup> = {
  "60E5M4805C3F242": {
    serialNumber: "60E5M4805C3F242",
    relatedShNo: "SH-2607-00165610",
    sku: "97-223-00107-00",
    model: "EQ4800-S",
    originalOutboundDate: "2026-06-18",
    warehouse: "悉尼物料仓",
    erpStatus: "Replacement completed / returned unit expected",
  },
};

export class MockERPAdapter implements ERPAdapter {
  async findBySerialNumber(serialNumber: string): Promise<ERPSerialLookup | null> {
    return serialFixtures[serialNumber.trim().toUpperCase()] ?? null;
  }
  async getOutboundOrder() {
    return null;
  }
  async getTransferOrder() {
    return null;
  }
  async writeBackOutbound() {
    return { accepted: true };
  }
  async writeBackTransfer() {
    return { accepted: true };
  }
  async healthCheck() {
    return { ok: true, adapter: "MockERPAdapter" };
  }
}
