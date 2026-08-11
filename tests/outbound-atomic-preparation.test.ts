/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { OutboundPreparationService } from "@/services/server/outbound-preparation-service";

vi.mock("server-only", () => ({}));

const d = (value: number) => new Prisma.Decimal(value);

function atomicFixture(input: {
  serialTracked?: boolean;
  requiredQty?: number;
  physicalQty?: number;
  secondLine?: boolean;
} = {}) {
  const requiredQty = input.requiredQty ?? 2;
  const warehouse = { id: "warehouse-syd", code: "SYD" };
  const location = { id: "location-flex", code: "FLEX-01", warehouseId: warehouse.id, active: true };
  const otherLocation = { id: "location-r1", code: "R1-01", warehouseId: warehouse.id, active: true };
  const product = {
    id: "product-1", sku: "SKU-1", model: "MODEL-1", itemType: "Product",
    serialTrackingRequired: input.serialTracked ?? true,
  };
  const product2 = { ...product, id: "product-2", sku: "SKU-2", model: "MODEL-2" };
  const order: any = {
    id: "order-1", shNo: "SH-ATOMIC-1", warehouseId: warehouse.id, warehouse,
    status: "Pending_Allocation", pickupCode: null, pickupBatchId: null,
    allocatedAt: null, preparedAt: null, readyForPickupAt: null,
  };
  const line = (id: string, lineProduct: any): any => ({
    id, outboundOrderId: order.id, outboundOrder: order,
    productId: lineProduct.id, product: lineProduct, requiredCondition: "New",
    requiredQty: d(requiredQty), allocatedQty: d(0), preparedQty: d(0), allocations: [],
  });
  const lines = [line("line-1", product)];
  if (input.secondLine) lines.push(line("line-2", product2));
  order.lines = lines;
  const serials = [
    { id: "serial-1", serialNumber: "SN-1", productId: product.id, product, condition: "New", status: "In_Stock", currentWarehouseId: warehouse.id, currentLocationId: location.id, currentWarehouse: warehouse, currentLocation: location },
    { id: "serial-2", serialNumber: "SN-2", productId: product.id, product, condition: "New", status: "In_Stock", currentWarehouseId: warehouse.id, currentLocationId: location.id, currentWarehouse: warehouse, currentLocation: location },
    { id: "serial-wrong-sku", serialNumber: "SN-WRONG-SKU", productId: product2.id, product: product2, condition: "New", status: "In_Stock", currentWarehouseId: warehouse.id, currentLocationId: location.id, currentWarehouse: warehouse, currentLocation: location },
    { id: "serial-wrong-location", serialNumber: "SN-WRONG-LOCATION", productId: product.id, product, condition: "New", status: "In_Stock", currentWarehouseId: warehouse.id, currentLocationId: otherLocation.id, currentWarehouse: warehouse, currentLocation: otherLocation },
    { id: "serial-3", serialNumber: "SN-3", productId: product2.id, product: product2, condition: "New", status: "In_Stock", currentWarehouseId: warehouse.id, currentLocationId: location.id, currentWarehouse: warehouse, currentLocation: location },
    { id: "serial-4", serialNumber: "SN-4", productId: product2.id, product: product2, condition: "New", status: "In_Stock", currentWarehouseId: warehouse.id, currentLocationId: location.id, currentWarehouse: warehouse, currentLocation: location },
  ];
  const balances = lines.map((candidate, index) => ({
    id: `balance-${index + 1}`, warehouseId: warehouse.id, locationId: location.id,
    containerId: null, productId: candidate.productId, itemType: "Product", condition: "New",
    physicalQty: d(input.physicalQty ?? requiredQty), frozenQty: d(0), inTransitQty: d(0), version: 0,
  }));
  const allocations: any[] = [];
  const transactions: any[] = [];
  const audits: any[] = [];
  let pickupSequence = 1;
  let transactionOptions: any;

  const tx: any = {
    user: { findFirst: vi.fn(async () => ({ id: "user-1", active: true })) },
    outboundOrderLine: {
      findUnique: vi.fn(async ({ where }: any) => lines.find((candidate) => candidate.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const candidate = lines.find((row) => row.id === where.id)!;
        if (data.allocatedQty !== undefined) candidate.allocatedQty = d(Number(data.allocatedQty));
        if (data.preparedQty !== undefined) candidate.preparedQty = d(Number(data.preparedQty));
        return candidate;
      }),
    },
    location: { findFirst: vi.fn(async ({ where }: any) => [location, otherLocation].find((row) => row.code === where.code && row.warehouseId === where.warehouseId) ?? null) },
    serialNumber: {
      findMany: vi.fn(async ({ where }: any) => serials.filter((serial) => where.serialNumber.in.includes(serial.serialNumber))),
      update: vi.fn(async ({ where, data }: any) => {
        const serial = serials.find((row) => row.id === where.id)!;
        Object.assign(serial, data);
        return serial;
      }),
    },
    transferSerial: { findMany: vi.fn(async () => []) },
    outboundAllocation: {
      findMany: vi.fn(async ({ where }: any) => allocations.filter((allocation) =>
        allocation.serialNumberId && where.serialNumberId.in.includes(allocation.serialNumberId),
      )),
      aggregate: vi.fn(async () => ({ _sum: { quantity: d(0) } })),
      create: vi.fn(async ({ data }: any) => {
        const candidate = lines.find((row) => row.id === data.outboundOrderLineId)!;
        const serial = serials.find((row) => row.id === data.serialNumberId) ?? null;
        const created = {
          id: `allocation-${allocations.length + 1}`, ...data, containerId: data.containerId ?? null,
          serialNumberId: data.serialNumberId ?? null, serialNumber: serial, location,
          quantity: d(Number(data.quantity)), dispatchedAt: null, createdAt: new Date(),
        };
        allocations.push(created);
        candidate.allocations.push(created);
        return created;
      }),
    },
    inventoryBalance: {
      findFirst: vi.fn(async ({ where }: any) => balances.find((balance) =>
        balance.locationId === where.locationId && balance.productId === where.productId && balance.condition === where.condition,
      ) ?? null),
      create: vi.fn(),
      update: vi.fn(async ({ where, data }: any) => {
        const balance = balances.find((row) => row.id === where.id)!;
        balance.physicalQty = data.physicalQty;
        balance.frozenQty = data.frozenQty;
        balance.inTransitQty = data.inTransitQty;
        balance.version += 1;
        return balance;
      }),
    },
    stockTransaction: { create: vi.fn(async ({ data }: any) => (transactions.push(data), data)) },
    outboundOrder: {
      update: vi.fn(async ({ data }: any) => (Object.assign(order, data), order)),
      findUniqueOrThrow: vi.fn(async () => order),
    },
    pickupSequence: {
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({ nextValue: ++pickupSequence })),
    },
    pickupBatch: {
      upsert: vi.fn(async ({ create }: any) => ({ id: "pickup-1", ...create })),
      update: vi.fn(async () => ({})),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => (audits.push(data), data)) },
  };
  const prisma: any = {
    $transaction: async (work: any, options: any) => {
      transactionOptions = options;
      return work(tx);
    },
  };
  return {
    prisma, tx, order, lines, serials, balances, allocations, transactions, audits,
    transactionOptions: () => transactionOptions,
  };
}

const confirmInput = (overrides: Record<string, unknown> = {}) => ({
  orderId: "order-1", lineId: "line-1", locationCode: "FLEX-01",
  quantity: 2, serialNumbers: ["SN-1", "SN-2"], ...overrides,
});

describe("atomic outbound preparation", () => {
  it("commits location, exact SNs, Frozen, ledger and readiness in one action", async () => {
    const fixture = atomicFixture();
    const result = await new OutboundPreparationService(fixture.prisma).confirm(confirmInput());
    expect(result.status).toBe("Ready_for_Pickup");
    expect(fixture.order.status).toBe("Ready_for_Pickup");
    expect(fixture.lines[0].allocatedQty.toNumber()).toBe(2);
    expect(fixture.lines[0].preparedQty.toNumber()).toBe(2);
    expect(fixture.allocations).toHaveLength(2);
    expect(fixture.allocations.every((row) => row.preparedAt && row.serialNumberId)).toBe(true);
    expect(fixture.serials.slice(0, 2).every((serial) => serial.status === "Prepared")).toBe(true);
    expect(fixture.balances[0].physicalQty.toNumber()).toBe(2);
    expect(fixture.balances[0].frozenQty.toNumber()).toBe(2);
    expect(fixture.transactions).toHaveLength(1);
    expect(fixture.audits.some((row) => row.operation === "Confirmed outbound preparation")).toBe(true);
    expect(fixture.transactionOptions().isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
  });

  it.each([
    ["unknown SN", { serialNumbers: ["SN-1", "UNKNOWN"] }, "Every SN must exist"],
    ["wrong SKU", { serialNumbers: ["SN-1", "SN-WRONG-SKU"] }, "requested SKU"],
    ["wrong location", { serialNumbers: ["SN-1", "SN-WRONG-LOCATION"] }, "selected location"],
    ["duplicate SN", { serialNumbers: ["SN-1", "SN-1"] }, "Duplicate serial"],
    ["incomplete SN quantity", { serialNumbers: ["SN-1"] }, "Exact required SN quantity"],
  ])("rejects %s without any partial mutation", async (_label, overrides, message) => {
    const fixture = atomicFixture();
    await expect(new OutboundPreparationService(fixture.prisma).confirm(confirmInput(overrides))).rejects.toThrow(message);
    expect(fixture.allocations).toHaveLength(0);
    expect(fixture.balances[0].frozenQty.toNumber()).toBe(0);
    expect(fixture.lines[0].preparedQty.toNumber()).toBe(0);
    expect(fixture.transactions).toHaveLength(0);
    expect(fixture.order.status).toBe("Pending_Allocation");
  });

  it("rejects insufficient available stock without creating evidence", async () => {
    const fixture = atomicFixture({ physicalQty: 1 });
    await expect(new OutboundPreparationService(fixture.prisma).confirm(confirmInput()))
      .rejects.toThrow("Insufficient available stock");
    expect(fixture.allocations).toHaveLength(0);
    expect(fixture.balances[0].frozenQty.toNumber()).toBe(0);
  });

  it("prepares a non-serial product with location and quantity only", async () => {
    const fixture = atomicFixture({ serialTracked: false });
    const result = await new OutboundPreparationService(fixture.prisma).confirm(confirmInput({ serialNumbers: [] }));
    expect(result.status).toBe("Ready_for_Pickup");
    expect(fixture.allocations).toHaveLength(1);
    expect(fixture.allocations[0]).toMatchObject({ serialNumberId: null });
    expect(fixture.balances[0].frozenQty.toNumber()).toBe(2);
  });

  it("keeps a multi-line order partial, then auto-promotes on the final line", async () => {
    const fixture = atomicFixture({ secondLine: true });
    const service = new OutboundPreparationService(fixture.prisma);
    const first = await service.confirm(confirmInput());
    expect(first.status).toBe("Partially_Prepared");
    expect(fixture.order.status).toBe("Partially_Prepared");
    const second = await service.confirm(confirmInput({ lineId: "line-2", serialNumbers: ["SN-3", "SN-4"] }));
    expect(second.status).toBe("Ready_for_Pickup");
    expect(fixture.order.status).toBe("Ready_for_Pickup");
    expect(fixture.balances.map((balance) => balance.frozenQty.toNumber())).toEqual([2, 2]);
  });

  it("safely rejects duplicate or concurrent replay without double-freezing or assigning", async () => {
    const fixture = atomicFixture();
    const service = new OutboundPreparationService(fixture.prisma);
    await service.confirm(confirmInput());
    await expect(service.confirm(confirmInput())).rejects.toThrow("not available for preparation");
    expect(fixture.balances[0].frozenQty.toNumber()).toBe(2);
    expect(fixture.allocations).toHaveLength(2);
    expect(fixture.transactions).toHaveLength(1);
  });
});
