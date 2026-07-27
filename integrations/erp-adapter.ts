export interface ERPSerialLookup {
  serialNumber: string;
  relatedShNo: string;
  sku: string;
  model: string;
  originalOutboundDate: string;
  warehouse: string;
  erpStatus: string;
}

export interface ERPAdapter {
  findBySerialNumber(serialNumber: string): Promise<ERPSerialLookup | null>;
  getOutboundOrder(shNo: string): Promise<unknown | null>;
  getTransferOrder(transferNo: string): Promise<unknown | null>;
  writeBackOutbound(payload: unknown): Promise<{ accepted: boolean }>;
  writeBackTransfer(payload: unknown): Promise<{ accepted: boolean }>;
  healthCheck(): Promise<{ ok: boolean; adapter: string }>;
}
