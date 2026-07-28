import type { ERPAdapter, ERPOutboundOrder, ERPSerialLookup } from "./erp-adapter";

const serialFixtures: Record<string, ERPSerialLookup> = {
  "60E5M4805C3F242": {
    serialNumber: "60E5M4805C3F242",
    relatedShNo: "SH-2607-00165610",
    sku: "97-223-00107-00",
    model: "EQ4800-S",
    originalOutboundDate: "2026-06-18",
    warehouse: "Sydney Material Warehouse",
    erpStatus: "Replacement completed / returned unit expected",
  },
};

const outboundFixtures: Record<string, ERPOutboundOrder> = {
  "SH-2607-00175722": {
    shNo: "SH-2607-00175722",
    physicalWarehouseCode: "SYD",
    customerLabel: "Sydney service replacement",
    replacementUnitInformation: [
      {
        sku: "97-229-00020-00",
        model: "CQ6-M",
        quantity: 1,
        erpWarehouse: "Sydney Material Warehouse",
      },
      {
        sku: "97-229-00021-00",
        model: "CQ6-S",
        quantity: 3,
        erpWarehouse: "Sydney Good Product Warehouse",
      },
    ],
  },
};

export class MockERPAdapter implements ERPAdapter {
  async findBySerialNumber(serialNumber: string): Promise<ERPSerialLookup | null> {
    return serialFixtures[serialNumber.trim().toUpperCase()] ?? null;
  }

  async getOutboundOrder(shNo: string): Promise<ERPOutboundOrder | null> {
    return outboundFixtures[shNo.trim().toUpperCase()] ?? null;
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
