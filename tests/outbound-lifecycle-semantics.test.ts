/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { evaluateOutboundReadiness } from "@/services/server/outbound-readiness-service";
import { BulkSerialService } from "@/services/server/bulk-serial-service";
import { WmsApplicationService } from "@/services/server/wms-service";

vi.mock("server-only", () => ({}));

const d = (value: number) => new Prisma.Decimal(value);
const at = new Date("2026-08-01T00:00:00.000Z");

function readinessLine(input: {
  id?: string;
  required?: number;
  prepared?: number;
  serialTracked?: boolean;
  serials?: Array<Partial<{
    id: string;
    productId: string;
    condition: string;
    status: string;
    currentWarehouseId: string;
    currentLocationId: string;
    locationId: string;
  }>>;
}) {
  const required = input.required ?? 1;
  const serials = input.serials ?? [];
  const allocations = serials.map((serial, index) => ({
    quantity: d(1),
    locationId: serial.locationId ?? "location-1",
    preparedAt: at,
    serialNumberId: serial.id ?? `serial-${index + 1}`,
    serialNumber: {
      id: serial.id ?? `serial-${index + 1}`,
      productId: serial.productId ?? "product-1",
      condition: serial.condition ?? "New",
      status: serial.status ?? "Prepared",
      currentWarehouseId: serial.currentWarehouseId ?? "warehouse-syd",
      currentLocationId: serial.currentLocationId ?? "location-1",
    },
  }));
  const remainder = required - allocations.length;
  if (remainder > 0) allocations.push({
    quantity: d(remainder),
    locationId: "location-1",
    preparedAt: at,
    serialNumberId: null as never,
    serialNumber: null as never,
  });
  return {
    id: input.id ?? "line-1",
    productId: "product-1",
    requiredQty: d(required),
    allocatedQty: d(required),
    preparedQty: d(input.prepared ?? required),
    requiredCondition: "New",
    product: { serialTrackingRequired: input.serialTracked ?? true },
    allocations,
  };
}

describe("database-backed outbound readiness policy", () => {
  it("does not mark fully prepared serial-tracked quantity ready without SN", () => {
    const result = evaluateOutboundReadiness({
      warehouseId: "warehouse-syd",
      lines: [readinessLine({ required: 2, serials: [] })],
    });
    expect(result).toMatchObject({ ready: false, allQuantitiesPrepared: true });
    expect(result.lines[0]).toMatchObject({ assignedSerialCount: 0, serialComplete: false });
  });

  it("keeps partial SN assignment pending and requires authoritative identity state", () => {
    const partial = evaluateOutboundReadiness({
      warehouseId: "warehouse-syd",
      lines: [readinessLine({ required: 2, serials: [{ id: "sn-1" }] })],
    });
    expect(partial.lines[0]).toMatchObject({ assignedSerialCount: 1, serialComplete: false });
    expect(partial.ready).toBe(false);

    for (const serial of [
      { id: "sn-wrong-sku", productId: "other-product" },
      { id: "sn-wrong-location", currentLocationId: "other-location" },
    ]) {
      expect(evaluateOutboundReadiness({
        warehouseId: "warehouse-syd",
        lines: [readinessLine({ serials: [serial] })],
      }).ready).toBe(false);
    }
    expect(evaluateOutboundReadiness({
      warehouseId: "warehouse-syd",
      lines: [readinessLine({ required: 2, serials: [{ id: "duplicate" }, { id: "duplicate" }] })],
    }).ready).toBe(false);
  });

  it("allows non-serial products after preparation and requires every line in a multi-line order", () => {
    expect(evaluateOutboundReadiness({
      warehouseId: "warehouse-syd",
      lines: [readinessLine({ serialTracked: false })],
    }).ready).toBe(true);
    expect(evaluateOutboundReadiness({
      warehouseId: "warehouse-syd",
      lines: [
        readinessLine({ id: "line-a", serials: [{ id: "sn-a" }] }),
        readinessLine({ id: "line-b", required: 2, serials: [{ id: "sn-b" }] }),
      ],
    }).ready).toBe(false);
    expect(evaluateOutboundReadiness({
      warehouseId: "warehouse-syd",
      lines: [
        readinessLine({ id: "line-a", serials: [{ id: "sn-a" }] }),
        readinessLine({ id: "line-b", required: 2, serials: [{ id: "sn-b" }, { id: "sn-c" }] }),
      ],
    }).ready).toBe(true);
  });
});

function bulkSerialPrisma() {
  const product = { id: "product-1", sku: "SKU-1", model: "MODEL-1", serialTrackingRequired: true };
  const warehouse = { id: "warehouse-syd", code: "SYD" };
  const location = { id: "location-1", code: "FLEX-01" };
  const serials = ["SN-1", "SN-2"].map((serialNumber, index) => ({
    id: `serial-${index + 1}`,
    serialNumber,
    productId: product.id,
    product,
    condition: "New",
    status: "In_Stock",
    currentWarehouseId: warehouse.id,
    currentLocationId: location.id,
    currentWarehouse: warehouse,
    currentLocation: location,
  }));
  const allocations: any[] = [{
    id: "aggregate-1",
    outboundOrderLineId: "line-1",
    locationId: location.id,
    containerId: null,
    serialNumberId: null,
    serialNumber: null,
    location,
    quantity: d(2),
    preparedAt: at,
    dispatchedAt: null,
    createdAt: at,
  }];
  const order: any = {
    id: "order-1",
    shNo: "SH-TEST-1",
    warehouseId: warehouse.id,
    warehouse,
    status: "Prepared",
    pickupCode: null,
    pickupBatchId: null,
    readyForPickupAt: null,
    allocatedAt: at,
    preparedAt: at,
  };
  const line: any = {
    id: "line-1",
    outboundOrderId: order.id,
    outboundOrder: order,
    productId: product.id,
    product,
    requiredCondition: "New",
    requiredQty: d(2),
    allocatedQty: d(2),
    preparedQty: d(2),
    allocations,
  };
  order.lines = [line];
  let sequence = 1;
  const tx: any = {
    outboundOrderLine: {
      findUnique: vi.fn(async () => line),
      findUniqueOrThrow: vi.fn(async () => line),
    },
    serialNumber: {
      findMany: vi.fn(async ({ where }: any) => serials.filter((row) => where.serialNumber.in.includes(row.serialNumber))),
      update: vi.fn(async ({ where, data }: any) => {
        const serial = serials.find((row) => row.id === where.id)!;
        Object.assign(serial, data);
        return serial;
      }),
    },
    outboundAllocation: {
      findMany: vi.fn(async ({ where }: any) => allocations.filter((row) =>
        row.serialNumberId && where.serialNumberId.in.includes(row.serialNumberId),
      )),
      delete: vi.fn(async ({ where }: any) => {
        return allocations.find((row) => row.id === where.id);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const allocation = allocations.find((row) => row.id === where.id)!;
        Object.assign(allocation, data);
        return allocation;
      }),
      create: vi.fn(async ({ data }: any) => {
        const serial = serials.find((row) => row.id === data.serialNumberId)!;
        const created = { id: `allocation-${allocations.length + 1}`, ...data, location, serialNumber: serial, dispatchedAt: null, createdAt: at };
        allocations.push(created);
        return created;
      }),
    },
    user: { findFirst: vi.fn(async () => ({ id: "user-1", active: true })) },
    auditLog: { create: vi.fn(async () => ({})) },
    outboundOrder: {
      findUniqueOrThrow: vi.fn(async () => order),
      update: vi.fn(async ({ data }: any) => (Object.assign(order, data), order)),
    },
    pickupSequence: {
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({ nextValue: ++sequence })),
    },
    pickupBatch: {
      upsert: vi.fn(async ({ create }: any) => ({ id: "pickup-1", ...create })),
      update: vi.fn(async () => ({})),
    },
  };
  const prisma: any = { $transaction: (work: any) => work(tx) };
  return { prisma, order, allocations };
}

describe("SN commit lifecycle", () => {
  it("keeps a partial assignment SN-pending and automatically readies the order on the final commit", async () => {
    const fixture = bulkSerialPrisma();
    const service = new BulkSerialService(fixture.prisma);
    const partial = await service.commit({ orderId: "order-1", lineId: "line-1", serialNumbers: ["SN-1"] });
    expect(partial.orderStatus).toBe("Prepared");
    expect(fixture.order.status).toBe("Prepared");
    expect(fixture.allocations.filter((row) => row.serialNumberId)).toHaveLength(1);

    const complete = await service.commit({ orderId: "order-1", lineId: "line-1", serialNumbers: ["SN-2"] });
    expect(evaluateOutboundReadiness(fixture.order)).toMatchObject({ ready: true });
    expect(complete.orderStatus).toBe("Ready_for_Pickup");
    expect(fixture.order).toMatchObject({ status: "Ready_for_Pickup", pickupCode: "SYD-00001" });
    expect(fixture.allocations.filter((row) => row.serialNumberId)).toHaveLength(2);
  });
});

function dispatchPrisma({ complete = true } = {}) {
  const product = { id: "product-1", sku: "SKU-1", itemType: "Product", serialTrackingRequired: true };
  const serial = {
    id: "serial-1", serialNumber: "SN-ASSIGNED-1", productId: product.id,
    condition: "New", status: "Prepared", currentWarehouseId: "warehouse-syd", currentLocationId: "location-1",
  };
  const allocation: any = {
    id: "allocation-1", locationId: "location-1", containerId: null,
    serialNumberId: complete ? serial.id : null, serialNumber: complete ? serial : null,
    quantity: d(1), preparedAt: at, dispatchedAt: null, location: { id: "location-1", code: "FLEX-01" },
  };
  const order: any = {
    id: "order-1", shNo: "SH-DISPATCH-1", warehouseId: "warehouse-syd", warehouse: { id: "warehouse-syd", code: "SYD" },
    status: "Ready_for_Pickup", pickupBatchId: "pickup-1",
    lines: [{
      id: "line-1", productId: product.id, product, requiredCondition: "New",
      requiredQty: d(1), allocatedQty: d(1), preparedQty: d(1), allocations: [allocation],
    }],
  };
  const balance: any = { id: "balance-1", physicalQty: d(1), frozenQty: d(1), inTransitQty: d(0) };
  const tx: any = {
    user: { findUnique: vi.fn(async () => ({ id: "user-1", active: true, displayName: "Demo", role: { name: "Warehouse Supervisor" } })) },
    outboundOrder: {
      findUnique: vi.fn(async () => order),
      update: vi.fn(async ({ data }: any) => (Object.assign(order, data), order)),
      count: vi.fn(async () => 0),
    },
    inventoryBalance: {
      findFirst: vi.fn(async () => balance),
      create: vi.fn(),
      update: vi.fn(async ({ data }: any) => (Object.assign(balance, data), balance)),
    },
    serialNumber: { update: vi.fn(async ({ data }: any) => (Object.assign(serial, data), serial)) },
    outboundAllocation: { update: vi.fn(async ({ data }: any) => (Object.assign(allocation, data), allocation)) },
    stockTransaction: { create: vi.fn(async ({ data }: any) => data) },
    outboundOrderLine: { update: vi.fn(async () => ({})) },
    pickupBatch: { update: vi.fn(async () => ({})) },
    eRPSyncJob: { create: vi.fn(async ({ data }: any) => data) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { prisma: { $transaction: (work: any) => work(tx) } as any, tx, order, balance, serial };
}

describe("dispatch lifecycle", () => {
  it("reuses preparation-assigned SNs, posts inventory evidence and queues ERP write-back", async () => {
    const fixture = dispatchPrisma();
    const service = new WmsApplicationService(fixture.prisma, {} as never);
    await service.execute({ type: "dispatchOutbound", orderId: "order-1" });
    expect(fixture.tx.serialNumber.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "serial-1" },
      data: expect.objectContaining({ status: "Outbound" }),
    }));
    expect(fixture.balance.physicalQty.toNumber()).toBe(0);
    expect(fixture.balance.frozenQty.toNumber()).toBe(0);
    expect(fixture.order.status).toBe("Outbound");
    expect(fixture.tx.eRPSyncJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          lines: [{ sku: "SKU-1", qty: 1, serialNumbers: ["SN-ASSIGNED-1"] }],
        }),
      }),
    }));
  });

  it("blocks dispatch when assigned SN evidence is incomplete", async () => {
    const fixture = dispatchPrisma({ complete: false });
    const service = new WmsApplicationService(fixture.prisma, {} as never);
    await expect(service.execute({ type: "dispatchOutbound", orderId: "order-1" }))
      .rejects.toThrow("Authoritative preparation or serial evidence changed");
    expect(fixture.tx.stockTransaction.create).not.toHaveBeenCalled();
  });
});
