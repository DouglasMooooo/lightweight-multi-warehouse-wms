import {
  adjustStock,
  dispatchOutbound,
  dispatchTransfer,
  moveStock,
  prepareOutbound,
  receiveFaulty,
  receiveTransfer,
  registerSerial,
  scanOutboundSerial,
} from "@/domain/operations";
import type { StockCondition, WarehouseCode, WmsState } from "@/domain/types";
import type { ERPAdapter } from "@/integrations/erp-adapter";

export class InventoryService {
  currentStock(state: WmsState, warehouse?: WarehouseCode) {
    return state.inventory.filter((row) => !warehouse || row.warehouseCode === warehouse);
  }
}

export class OutboundService {
  prepare(state: WmsState, orderId: string, lineId: string, location: string, qty: number) {
    return prepareOutbound(state, orderId, lineId, location, qty);
  }
  scanSerial(state: WmsState, orderId: string, lineId: string, serialNumber: string) {
    return scanOutboundSerial(state, orderId, lineId, serialNumber);
  }
  dispatch(state: WmsState, orderId: string) {
    return dispatchOutbound(state, orderId);
  }
}

export class ReceivingService {
  constructor(private erp: ERPAdapter) {}
  async lookupFaulty(serialNumber: string) {
    return this.erp.findBySerialNumber(serialNumber);
  }
  receiveFaulty(state: WmsState, record: Parameters<typeof receiveFaulty>[1]) {
    return receiveFaulty(state, record);
  }
}

export class TransferService {
  dispatch(state: WmsState, transferId: string) {
    return dispatchTransfer(state, transferId);
  }
  receive(state: WmsState, transferId: string, location: string) {
    return receiveTransfer(state, transferId, location);
  }
}

export class SerialNumberService {
  register(state: WmsState, input: Parameters<typeof registerSerial>[1]) {
    return registerSerial(state, input);
  }
  search(state: WmsState, query: string) {
    const needle = query.toLowerCase();
    return state.serials.filter(
      (row) =>
        row.serialNumber.toLowerCase().includes(needle) ||
        row.sku.toLowerCase().includes(needle) ||
        row.relatedShNo?.toLowerCase().includes(needle),
    );
  }
}

export class MoveService {
  move(state: WmsState, input: Parameters<typeof moveStock>[1]) {
    return moveStock(state, input);
  }
}

export class AdjustmentService {
  adjust(state: WmsState, input: Parameters<typeof adjustStock>[1]) {
    return adjustStock(state, input);
  }
}

export class PickupCodeService {
  format(warehouseCode: WarehouseCode, sequence: number) {
    return `${warehouseCode}-${String(sequence).padStart(5, "0")}`;
  }
}

export class LabelService {
  batchLabel(state: WmsState, orderId: string) {
    const order = state.outboundOrders.find((row) => row.id === orderId);
    if (!order) throw new Error("Outbound order not found.");
    return order;
  }
}

export class StocktakeService {
  variance(expected: number, counted: number) {
    return counted - expected;
  }
}

export class AuditService {
  forReference(state: WmsState, businessReference: string) {
    return state.audit.filter((row) => row.businessReference === businessReference);
  }
}

export type AdjustmentRequest = {
  direction: "In" | "Out";
  warehouseCode: WarehouseCode;
  locationCode: string;
  sku?: string;
  itemType: "Product" | "Material";
  condition: StockCondition;
  qty: number;
  reason: string;
  remark: string;
};
