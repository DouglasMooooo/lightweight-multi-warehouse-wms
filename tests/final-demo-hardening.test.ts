import { describe, expect, it, vi } from "vitest";
import { demoState } from "@/domain/demo-data";
import type { WmsState } from "@/domain/types";
import { TransferService } from "@/services";
import { OperationalReportingService } from "@/services/server/reporting-service";
import { TransferReceiptService } from "@/services/server/transfer-receipt-service";

vi.mock("server-only", () => ({}));

function isolatedTransferState(): WmsState {
  const state = structuredClone(demoState);
  const serials = ["TEST-TRANSFER-001", "TEST-TRANSFER-002", "TEST-TRANSFER-003"];
  state.inventory.push({
    id: "test-transfer-balance",
    warehouseCode: "SYD",
    locationCode: "FLEX-01",
    sku: "TEST-TRANSFER-SKU",
    model: "TEST TRANSFER UNIT",
    itemType: "Product",
    condition: "New",
    physicalQty: 3,
    frozenQty: 0,
    inTransitQty: 0,
    availableQty: 3,
  });
  state.serials.push(...serials.map((serialNumber, index) => ({
    id: `test-transfer-sn-${index + 1}`,
    serialNumber,
    sku: "TEST-TRANSFER-SKU",
    model: "TEST TRANSFER UNIT",
    warehouseCode: "SYD" as const,
    locationCode: "FLEX-01",
    condition: "New" as const,
    status: "In_Stock" as const,
  })));
  state.transfers.push({
    id: "test-transfer-id",
    transferNo: "TEST-TRANSFER-ORDER-001",
    sourceWarehouse: "SYD",
    destinationWarehouse: "MEL",
    status: "Draft",
    sku: "TEST-TRANSFER-SKU",
    model: "TEST TRANSFER UNIT",
    condition: "New",
    qty: 3,
    serials,
    sourceLocation: "FLEX-01",
  });
  return state;
}

describe("final hardening transfer service lifecycle", () => {
  it("dispatches and receives the same Transfer ID with balance, SN, ledger and audit evidence", () => {
    const service = new TransferService();
    const initial = isolatedTransferState();
    const initialTransferCount = initial.transfers.length;

    const dispatched = service.dispatch(initial, "test-transfer-id");
    const sourceAfterDispatch = dispatched.inventory.find((row) => row.id === "test-transfer-balance");
    const transferAfterDispatch = dispatched.transfers.find((row) => row.id === "test-transfer-id");
    expect(sourceAfterDispatch).toMatchObject({ physicalQty: 0, inTransitQty: 3, availableQty: 0 });
    expect(transferAfterDispatch).toMatchObject({ id: "test-transfer-id", status: "In_Transit", condition: "New" });
    expect(dispatched.serials.filter((row) => row.relatedTransferNo === "TEST-TRANSFER-ORDER-001"))
      .toHaveLength(3);
    expect(dispatched.serials.filter((row) => row.relatedTransferNo === "TEST-TRANSFER-ORDER-001"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: "In_Transit", condition: "New" })]));
    expect(dispatched.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "Transfer_Out", businessReference: "TEST-TRANSFER-ORDER-001", qty: 3 }),
    ]));
    expect(dispatched.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "Dispatched transfer", entityId: "test-transfer-id" }),
    ]));

    const received = service.receive(dispatched, "test-transfer-id", "RECEIVING-01");
    const sourceAfterReceipt = received.inventory.find((row) => row.id === "test-transfer-balance");
    const destination = received.inventory.find((row) =>
      row.warehouseCode === "MEL" && row.locationCode === "RECEIVING-01" && row.sku === "TEST-TRANSFER-SKU",
    );
    expect(sourceAfterReceipt).toMatchObject({ physicalQty: 0, inTransitQty: 0 });
    expect(destination).toMatchObject({ physicalQty: 3, availableQty: 3, condition: "New" });
    expect(received.transfers).toHaveLength(initialTransferCount);
    expect(received.transfers.find((row) => row.id === "test-transfer-id"))
      .toMatchObject({ status: "Received", destinationLocation: "RECEIVING-01", condition: "New" });
    expect(received.serials.filter((row) => row.relatedTransferNo === "TEST-TRANSFER-ORDER-001"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ status: "In_Stock", warehouseCode: "MEL", locationCode: "RECEIVING-01", condition: "New" }),
      ]));
    expect(received.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "Transfer_In", businessReference: "TEST-TRANSFER-ORDER-001", qty: 3, condition: "New" }),
    ]));
    expect(received.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "Received transfer", entityId: "test-transfer-id" }),
    ]));
    expect(() => service.receive(received, "test-transfer-id", "RECEIVING-01"))
      .toThrow("Transfer is not ready to receive");
  });

  it("rejects duplicate and unexpected SNs during receipt validation", async () => {
    const serials = ["TEST-TRANSFER-001", "TEST-TRANSFER-002", "TEST-TRANSFER-003"];
    const prisma = {
      transferOrder: {
        findUnique: vi.fn(async () => ({
          id: "test-transfer-id",
          transferNo: "TEST-TRANSFER-ORDER-001",
          status: "In_Transit",
          destinationWarehouseId: "warehouse-mel",
          destinationWarehouse: { code: "MEL" },
          lines: [{
            condition: "New",
            product: { sku: "TEST-TRANSFER-SKU", model: "TEST TRANSFER UNIT" },
            serials: serials.map((serialNumber) => ({ serialNumber: { serialNumber, status: "In_Transit" } })),
          }],
        })),
      },
      location: {
        findFirst: vi.fn(async () => ({ id: "location-mel-receiving", code: "RECEIVING-01" })),
      },
    };
    const service = new TransferReceiptService(prisma as never);
    const result = await service.validate("test-transfer-id", "RECEIVING-01", [
      "TEST-TRANSFER-001",
      "TEST-TRANSFER-001",
      "TEST-TRANSFER-002",
      "TEST-TRANSFER-003",
      "TEST-TRANSFER-UNEXPECTED",
    ]);
    expect(result.summary).toEqual({ total: 5, expected: 3, valid: 3, invalid: 2, missing: 0 });
    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ serialNumber: "TEST-TRANSFER-001", validationStatus: "DUPLICATE_SCAN" }),
      expect.objectContaining({ serialNumber: "TEST-TRANSFER-UNEXPECTED", validationStatus: "NOT_IN_TRANSFER" }),
    ]));
  });
});

const postPeriodMovements = [
  { transactionType: "Outbound", condition: "New", sourceCondition: null, targetCondition: null, quantity: 2, physicalDelta: -2 },
  { transactionType: "Transfer_Out", condition: "New", sourceCondition: null, targetCondition: null, quantity: 1, physicalDelta: -1 },
  { transactionType: "Transfer_In", condition: "Repair_Good", sourceCondition: null, targetCondition: null, quantity: 1, physicalDelta: 1 },
  { transactionType: "Return_to_Repair", condition: "Repair", sourceCondition: null, targetCondition: null, quantity: 1, physicalDelta: 1 },
  { transactionType: "Repair_Completed", condition: "Repair_Good", sourceCondition: "Repair", targetCondition: "Repair_Good", quantity: 1, physicalDelta: 0 },
];

function reportingPrisma(openingBaseline: number) {
  const warehouses = {
    "warehouse-syd": { id: "warehouse-syd", code: "SYD", name: "Sydney", timezone: "Australia/Sydney", floorAreaSqm: null, operationalAreaSqm: null },
    "warehouse-mel": { id: "warehouse-mel", code: "MEL", name: "Melbourne", timezone: "Australia/Melbourne", floorAreaSqm: null, operationalAreaSqm: null },
  };
  return {
    warehouse: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: keyof typeof warehouses } }) => warehouses[where.id]),
    },
    outboundOrder: { findMany: vi.fn(async () => []) },
    repairReturn: { findMany: vi.fn(async () => []) },
    repairJob: { findMany: vi.fn(async () => []) },
    inventoryBalance: {
      findMany: vi.fn(async () => [
        { condition: "New", physicalQty: 7, frozenQty: 0, inTransitQty: 0 },
        { condition: "Repair_Good", physicalQty: 3, frozenQty: 0, inTransitQty: 0 },
        { condition: "Repair", physicalQty: 1, frozenQty: 0, inTransitQty: 0 },
      ]),
    },
    stockTransaction: {
      findMany: vi.fn(async ({ where }: { where: { effectiveAt: { gt?: Date } } }) =>
        where.effectiveAt.gt ? postPeriodMovements : [],
      ),
      aggregate: vi.fn(async () => ({
        _sum: { physicalDelta: -1, frozenDelta: 0, inTransitDelta: 0 },
      })),
      count: vi.fn(async () => openingBaseline),
    },
    exception: {
      count: vi.fn(async ({ where }: { where: { warehouseId: string } }) =>
        where.warehouseId === "warehouse-syd" ? 2 : 5,
      ),
    },
  };
}

describe("final hardening historical operations reporting", () => {
  const from = new Date("2026-06-01T00:00:00.000Z");
  const to = new Date("2026-06-30T23:59:59.999Z");

  it("reconstructs period end from an Opening baseline and reverses every post-period movement", async () => {
    const prisma = reportingPrisma(1);
    const report = await new OperationalReportingService(prisma as never)
      .period("warehouse-syd", from, to);
    expect(report.historyAvailable).toBe(true);
    expect(report.closingPhysical).toBe(12);
    expect(report.physicalByCondition).toMatchObject({
      New: 10,
      Repair_Good: 1,
      Repair: 1,
    });
    expect(report.newInventory).toBe(10);
    expect(report.repairGoodInventory).toBe(1);
    expect(report.repairInventory).toBe(1);
    expect(report.openOperationalExceptions).toBe(2);
    expect(prisma.exception.count).toHaveBeenCalledWith({
      where: { warehouseId: "warehouse-syd", status: { not: "Resolved" } },
    });
  });

  it("does not leak current InventoryBalance when the Opening baseline is absent", async () => {
    const report = await new OperationalReportingService(reportingPrisma(0) as never)
      .period("warehouse-syd", from, to);
    expect(report).toMatchObject({
      historyAvailable: false,
      historyUnavailableReason: "HISTORICAL_BASELINE_INSUFFICIENT",
    });
    expect(report.closingPhysical).toBeUndefined();
    expect(report.physicalByCondition).toBeUndefined();
    expect(report.newInventory).toBeUndefined();
    expect(report.repairGoodInventory).toBeUndefined();
    expect(report.repairInventory).toBeUndefined();
  });

  it("keeps SYD and MEL exception totals separately scoped", async () => {
    const prisma = reportingPrisma(1);
    const service = new OperationalReportingService(prisma as never);
    const [syd, mel] = await Promise.all([
      service.period("warehouse-syd", from, to),
      service.period("warehouse-mel", from, to),
    ]);
    expect(syd.openOperationalExceptions).toBe(2);
    expect(mel.openOperationalExceptions).toBe(5);
  });
});
