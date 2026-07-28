import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import {
  assertFaultyReceiptAllowed,
  formatPickupCode,
  validateAdjustment,
  validateMove,
  validateOutboundSerial,
  validatePreparation,
} from "@/domain/rules";
import type { StockCondition, WarehouseCode, WmsCommand, WmsState } from "@/domain/types";
import type { ERPAdapter, ERPSerialLookup } from "@/integrations/erp-adapter";
import { MockERPAdapter } from "@/integrations/mock-erp-adapter";
import { getPrisma } from "@/lib/prisma";
import { InventoryRepository, type BalanceKey } from "@/repositories/inventory-repository";
import { seedDemo } from "@/prisma/demo-seed";

type Tx = Prisma.TransactionClient;
type Actor = { id: string; displayName: string; role: string };

const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
const number = (value: string | number | Prisma.Decimal) => Number(value);
const operationId = () => randomUUID();

async function serializable<T>(prisma: PrismaClient, work: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      ) continue;
      throw error;
    }
  }
  throw new Error("Transaction retry limit exceeded.");
}

async function actor(tx: Tx): Promise<Actor> {
  const user = await tx.user.findUnique({
    where: { email: "demo.supervisor@example.invalid" },
    include: { role: true },
  });
  if (!user || !user.active) throw new DomainError("No active server-side actor is configured.");
  return { id: user.id, displayName: user.displayName, role: user.role.name };
}

async function audit(
  tx: Tx,
  who: Actor,
  input: {
    operation: string;
    entityType: string;
    entityId: string;
    businessReference?: string;
    remark: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({
    data: {
      userId: who.id,
      operation: input.operation,
      entityType: input.entityType,
      entityId: input.entityId,
      businessReference: input.businessReference,
      remark: input.remark,
      before: input.before,
      after: input.after,
    },
  });
}

async function requireWarehouse(tx: Tx, code: string) {
  return tx.warehouse.findFirstOrThrow({ where: { code, active: true } });
}

async function requireLocation(tx: Tx, warehouseId: string, code: string) {
  const location = await tx.location.findFirst({ where: { warehouseId, code, active: true } });
  if (!location) throw new DomainError("Invalid location for the selected warehouse.");
  return location;
}

async function requireProduct(tx: Tx, sku: string) {
  const product = await tx.product.findFirst({ where: { sku, active: true } });
  if (!product) throw new DomainError("Unknown or inactive SKU.");
  return product;
}

async function pickupCode(tx: Tx, warehouse: { id: string; code: string }, who: Actor) {
  await tx.pickupSequence.upsert({
    where: { warehouseId: warehouse.id },
    update: {},
    create: { warehouseId: warehouse.id, nextValue: 1 },
  });
  const updated = await tx.pickupSequence.update({
    where: { warehouseId: warehouse.id },
    data: { nextValue: { increment: 1 } },
  });
  const code = formatPickupCode(warehouse.code as WarehouseCode, updated.nextValue - 1);
  await audit(tx, who, {
    operation: "Generated pickup code",
    entityType: "PickupSequence",
    entityId: warehouse.id,
    businessReference: code,
    remark: `Atomically generated ${code}.`,
  });
  return code;
}

function balanceKey(input: {
  warehouseId: string;
  locationId: string;
  productId?: string | null;
  containerId?: string | null;
  itemType: "Product" | "Material";
  condition: StockCondition;
}): BalanceKey {
  return input;
}

export class WmsApplicationService {
  constructor(
    private readonly prisma = getPrisma(),
    private readonly erp: ERPAdapter = new MockERPAdapter(),
  ) {}

  async snapshot(): Promise<WmsState> {
    const [
      warehouses,
      locations,
      products,
      balances,
      serials,
      orders,
      transfers,
      transactions,
      audits,
      exceptions,
      sequences,
      faultyReceivedCount,
      repairJobs,
      pickupBatches,
    ] = await Promise.all([
      this.prisma.warehouse.findMany({ orderBy: { code: "asc" } }),
      this.prisma.location.findMany({ include: { warehouse: true }, orderBy: { code: "asc" } }),
      this.prisma.product.findMany({ orderBy: { sku: "asc" } }),
      this.prisma.inventoryBalance.findMany({
        include: { warehouse: true, location: true, container: true, product: true },
        orderBy: [{ warehouseId: "asc" }, { locationId: "asc" }],
      }),
      this.prisma.serialNumber.findMany({
        include: {
          product: true,
          currentWarehouse: true,
          currentLocation: true,
          outboundAllocations: { include: { outboundOrderLine: { include: { outboundOrder: true } } } },
          transferSerials: { include: { transferOrderLine: { include: { transferOrder: true } } } },
        },
        orderBy: { serialNumber: "asc" },
      }),
      this.prisma.outboundOrder.findMany({
        include: {
          warehouse: true,
          lines: {
            include: {
              product: true,
              allocations: { include: { location: true, container: true, serialNumber: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.transferOrder.findMany({
        include: {
          sourceWarehouse: true,
          destinationWarehouse: true,
          destinationLocation: true,
          lines: {
            include: {
              product: true,
              serials: { include: { serialNumber: { include: { currentLocation: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.stockTransaction.findMany({
        include: { warehouse: true, sourceLocation: true, targetLocation: true, product: true, serialNumber: true },
        orderBy: { effectiveAt: "desc" },
        take: 500,
      }),
      this.prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 500 }),
      this.prisma.exception.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      this.prisma.pickupSequence.findMany({ include: { warehouse: true } }),
      this.prisma.repairReturn.count(),
      this.prisma.repairJob.findMany({
        include: { serialNumber: true, product: true, warehouse: true, currentLocation: true },
        orderBy: { receivedAt: "desc" },
      }),
      this.prisma.pickupBatch.findMany({
        include: {
          orders: {
            include: { lines: { include: { product: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const pickupSequence = { SYD: 0, MEL: 0, BNE: 0 } as Record<WarehouseCode, number>;
    for (const row of sequences) pickupSequence[row.warehouse.code as WarehouseCode] = row.nextValue;
    const diagnosticExceptions: WmsState["exceptions"] = [];
    const activeSerials = serials.filter((row) => ["In_Stock", "Prepared", "Repair"].includes(row.status));
    for (const serial of activeSerials) {
      const matchingBalance = balances.find(
        (balance) =>
          balance.productId === serial.productId &&
          balance.warehouseId === serial.currentWarehouseId &&
          balance.locationId === serial.currentLocationId &&
          balance.condition === serial.condition &&
          balance.physicalQty.greaterThan(0),
      );
      if (!matchingBalance) {
        diagnosticExceptions.push({
          id: `diagnostic-serial-${serial.id}`,
          type: "Inventory/SN reconciliation",
          severity: "High",
          entityReference: serial.serialNumber,
          message: "Active SN has no matching positive balance at its warehouse, location and condition.",
          status: "Open",
          createdAt: new Date().toISOString(),
        });
      }
    }
    for (const balance of balances.filter(
      (row) => row.product?.serialTrackingRequired && row.physicalQty.greaterThan(0),
    )) {
      const count = activeSerials.filter(
        (serial) =>
          serial.productId === balance.productId &&
          serial.currentWarehouseId === balance.warehouseId &&
          serial.currentLocationId === balance.locationId &&
          serial.condition === balance.condition,
      ).length;
      if (count === 0) {
        diagnosticExceptions.push({
          id: `diagnostic-balance-${balance.id}`,
          type: "Inventory/SN reconciliation",
          severity: "Low",
          entityReference: balance.id,
          message:
            "Serial-tracked balance has no illustrative active SN rows. Preview seeds may be partial; production requires complete reconciliation.",
          status: "Open",
          createdAt: new Date().toISOString(),
        });
      }
    }

    return {
      warehouses: warehouses.map((row) => ({
        id: row.id,
        code: row.code as WarehouseCode,
        name: row.name,
        timezone: row.timezone,
        active: row.active,
      })),
      locations: locations.map((row) => ({
        id: row.id,
        warehouseCode: row.warehouse.code as WarehouseCode,
        code: row.code,
        zone: row.zone,
        serviceZone: row.serviceZone,
        active: row.active,
      })),
      products: products.map((row) => ({
        id: row.id,
        sku: row.sku,
        model: row.model,
        itemType: row.itemType,
        category: row.category ?? "",
        serialTrackingRequired: row.serialTrackingRequired,
        reportMachine: row.reportMachine,
        reportGroup: row.reportGroup ?? undefined,
        active: row.active,
      })),
      inventory: balances.map((row) => ({
        id: row.id,
        warehouseCode: row.warehouse.code as WarehouseCode,
        locationCode: row.location.code,
        containerCode: row.container?.code,
        sku: row.product?.sku,
        model: row.product?.model ?? "Unmonitored material",
        itemType: row.itemType,
        condition: row.condition,
        physicalQty: number(row.physicalQty),
        frozenQty: number(row.frozenQty),
        inTransitQty: number(row.inTransitQty),
        availableQty: number(row.physicalQty.minus(row.frozenQty)),
      })),
      serials: serials.map((row) => ({
        id: row.id,
        serialNumber: row.serialNumber,
        sku: row.product.sku,
        model: row.product.model,
        warehouseCode: row.currentWarehouse?.code as WarehouseCode | undefined,
        locationCode: row.currentLocation?.code,
        condition: row.condition,
        status: row.status,
        relatedShNo: row.outboundAllocations.at(-1)?.outboundOrderLine.outboundOrder.shNo,
        relatedTransferNo: row.transferSerials.at(-1)?.transferOrderLine.transferOrder.transferNo,
      })),
      outboundOrders: orders.map((order) => ({
        id: order.id,
        shNo: order.shNo,
        pickupCode: order.pickupCode ?? undefined,
        erpWarehouse: order.erpWarehouse,
        warehouseCode: order.warehouse.code as WarehouseCode,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        preparedAt: order.preparedAt?.toISOString(),
        readyForPickupAt: order.readyForPickupAt?.toISOString(),
        outboundAt: order.outboundAt?.toISOString(),
        customerLabel: order.customerLabel ?? undefined,
        erpSyncStatus: order.erpSyncStatus,
        lines: order.lines.map((line) => {
          const allocations = line.allocations.map((allocation) => ({
            id: allocation.id,
            locationCode: allocation.location.code,
            containerCode: allocation.container?.code,
            quantity: number(allocation.quantity),
            serialNumber: allocation.serialNumber?.serialNumber,
            preparedAt: allocation.preparedAt?.toISOString(),
            dispatchedAt: allocation.dispatchedAt?.toISOString(),
          }));
          return {
            id: line.id,
            sku: line.product.sku,
            model: line.product.model,
            requiredQty: number(line.requiredQty),
            requiredCondition: line.requiredCondition,
            erpWarehouse: line.erpWarehouse,
            allocatedQty: number(line.allocatedQty),
            preparedQty: number(line.preparedQty),
            dispatchedQty: number(line.dispatchedQty),
            allocationLocation: [...new Set(allocations.map((row) => row.locationCode))].join(", ") || undefined,
            allocations,
            scannedSerials: allocations.flatMap((row) => (row.serialNumber ? [row.serialNumber] : [])),
          };
        }),
      })),
      transfers: transfers.flatMap((transfer) =>
        transfer.lines.map((line) => ({
          id: transfer.id,
          transferNo: transfer.transferNo,
          sourceWarehouse: transfer.sourceWarehouse.code as WarehouseCode,
          destinationWarehouse: transfer.destinationWarehouse.code as WarehouseCode,
          status:
            transfer.status === "Dispatched"
              ? "In_Transit"
              : transfer.status === "Cancelled"
                ? "Exception"
                : transfer.status,
          sku: line.product.sku,
          model: line.product.model,
          qty: number(line.quantity),
          serials: line.serials.map((row) => row.serialNumber.serialNumber),
          sourceLocation:
            line.serials[0]?.serialNumber.currentLocation?.code ??
            transactions.find((row) => row.businessReference === transfer.transferNo)?.sourceLocation?.code ??
            "Source recorded in transaction",
          destinationLocation: transfer.destinationLocation?.code,
        })),
      ),
      transactions: transactions.map((row) => ({
        id: row.id,
        at: row.effectiveAt.toISOString(),
        recordedAt: row.recordedAt.toISOString(),
        effectiveAt: row.effectiveAt.toISOString(),
        type: row.transactionType,
        warehouseCode: row.warehouse.code as WarehouseCode,
        sku: row.product?.sku,
        model: row.product?.model,
        serialNumber: row.serialNumber?.serialNumber,
        qty: number(row.quantity),
        condition: row.condition,
        fromLocation: row.sourceLocation?.code,
        toLocation: row.targetLocation?.code,
        businessReference: row.businessReference ?? undefined,
        remark: row.remark,
      })),
      audit: audits.map((row) => ({
        id: row.id,
        at: row.createdAt.toISOString(),
        actor: row.user.displayName,
        operation: row.operation,
        entityType: row.entityType,
        entityId: row.entityId,
        businessReference: row.businessReference ?? undefined,
        remark: row.remark,
      })),
      exceptions: [
        ...diagnosticExceptions,
        ...exceptions.map((row) => ({
          id: row.id,
          type: row.type,
          severity: row.severity,
          entityReference: row.entityReference,
          message: row.message,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
      ],
      pickupSequence,
      faultyReceivedCount,
      repairJobs: repairJobs.map((job) => ({
        id: job.id,
        serialNumber: job.serialNumber?.serialNumber,
        sku: job.product.sku,
        model: job.product.model,
        warehouseCode: job.warehouse.code as WarehouseCode,
        currentLocation: job.currentLocation.code,
        originalShNo: job.originalShNo ?? undefined,
        status: job.status,
        outcome: job.outcome ?? undefined,
        source: job.source,
        receivedAt: job.receivedAt.toISOString(),
        repairCompletedAt: job.repairCompletedAt?.toISOString(),
        returnedToStockAt: job.returnedToStockAt?.toISOString(),
        remark: job.remark,
      })),
      pickupBatches: pickupBatches.map((batch) => {
        const grouped = new Map<string, { sku: string; model: string; erpWarehouse: string; qty: number }>();
        for (const order of batch.orders) {
          for (const line of order.lines) {
            const key = JSON.stringify([line.product.sku, line.product.model, line.erpWarehouse]);
            const row = grouped.get(key);
            const qty = number(line.requiredQty);
            if (row) row.qty += qty;
            else
              grouped.set(key, {
                sku: line.product.sku,
                model: line.product.model,
                erpWarehouse: line.erpWarehouse,
                qty,
              });
          }
        }
        return {
          id: batch.id,
          code: batch.code,
          labelType: batch.labelType,
          shNos: [...new Set(batch.orders.map((order) => order.shNo))],
          lines: [...grouped.values()],
          readyAt: batch.readyAt?.toISOString(),
        };
      }),
      dashboardTasks: {
        needsAllocation: orders.filter((row) => ["Imported", "Pending_Allocation"].includes(row.status)).length,
        prepared: orders.filter((row) => ["Prepared", "Partially_Prepared"].includes(row.status)).length,
        readyForPickup: orders.filter((row) => row.status === "Ready_for_Pickup").length,
        outboundToday: orders.filter(
          (row) => row.outboundAt && row.outboundAt.toDateString() === new Date().toDateString(),
        ).length,
        faultyReturns: faultyReceivedCount,
        repairQueue: repairJobs.filter((row) => ["Received", "Pending_Repair", "In_Repair"].includes(row.status)).length,
        repairCompletedAwaitingPutaway: repairJobs.filter((row) => row.status === "Repair_Completed").length,
        transfersInTransit: transfers.filter((row) => ["Dispatched", "In_Transit", "Partially_Received"].includes(row.status)).length,
        reconciliationIssues: diagnosticExceptions.length,
        erpSyncFailures: orders.filter((row) => row.erpSyncStatus === "Failed").length,
      },
    };
  }

  async execute(command: WmsCommand): Promise<WmsState> {
    if (command.type === "resetDemo") {
      if (process.env.DEMO_MODE !== "true" || process.env.NODE_ENV === "production")
        throw new DomainError("Demo reset is disabled outside explicit non-production demo mode.");
      await seedDemo(this.prisma);
      return this.snapshot();
    }
    switch (command.type) {
      case "importOutbound":
        await this.importOutbound(command.shNo);
        break;
      case "allocateOutbound":
        await this.allocateOutbound(command);
        break;
      case "prepareOutbound":
        await this.prepareOutbound(command);
        break;
      case "scanOutboundSerial":
        await this.scanOutboundSerial(command);
        break;
      case "dispatchOutbound":
        await this.dispatchOutbound(command.orderId);
        break;
      case "registerSerial":
        await this.registerSerial(command);
        break;
      case "adjustStock":
        await this.adjust(command);
        break;
      case "receiveFaulty":
        await this.receiveFaulty(command.serialNumber);
        break;
      case "completeRepair":
        await this.completeRepair(command);
        break;
      case "legacyRepairGoodIn":
        await this.legacyRepairGoodIn(command);
        break;
      case "moveStock":
        await this.move(command);
        break;
      case "dispatchTransfer":
        await this.dispatchTransfer(command.transferId);
        break;
      case "receiveTransfer":
        await this.receiveTransfer(command.transferId, command.destinationLocation);
        break;
    }
    return this.snapshot();
  }

  async lookupFaulty(serialNumber: string): Promise<ERPSerialLookup> {
    const normalized = serialNumber.trim().toUpperCase();
    const result = await this.erp.findBySerialNumber(normalized);
    if (result) return result;
    await this.prisma.exception.create({
      data: {
        type: "ERP lookup failure",
        severity: "Medium",
        entityReference: normalized,
        message: "ERP record not found. Controlled Manual Review is required before receipt.",
      },
    });
    throw new DomainError("ERP record not found. A Manual Review exception was created.");
  }

  private async importOutbound(shNo: string) {
    const erpOrder = await this.erp.getOutboundOrder(shNo.trim().toUpperCase());
    if (!erpOrder) throw new DomainError("ERP_LOOKUP_FAILED: Replacement Unit Information was not found.");
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const duplicate = await tx.outboundOrder.findUnique({ where: { shNo: erpOrder.shNo } });
      if (duplicate) throw new DomainError("This SH number already exists.");
      const warehouse = await requireWarehouse(tx, erpOrder.physicalWarehouseCode);
      const mappedLines = [];
      for (const erpLine of erpOrder.replacementUnitInformation) {
        const product = await requireProduct(tx, erpLine.sku);
        const mapping = await tx.eRPWarehouseMapping.findUnique({
          where: {
            warehouseId_erpWarehouse: {
              warehouseId: warehouse.id,
              erpWarehouse: erpLine.erpWarehouse,
            },
          },
        });
        if (!mapping) throw new DomainError(`ERP warehouse mapping is missing for ${erpLine.erpWarehouse}.`);
        mappedLines.push({ erpLine, product, condition: mapping.condition });
      }
      if (!mappedLines.length) throw new DomainError("ERP_LOOKUP_FAILED: Replacement Unit Information has no lines.");
      const order = await tx.outboundOrder.create({
        data: {
          shNo: erpOrder.shNo,
          erpWarehouse:
            new Set(mappedLines.map((line) => line.erpLine.erpWarehouse)).size === 1
              ? mappedLines[0].erpLine.erpWarehouse
              : "Mixed ERP warehouses",
          warehouseId: warehouse.id,
          status: "Pending_Allocation",
          customerLabel: erpOrder.customerLabel,
          lines: {
            create: mappedLines.map(({ erpLine, product, condition }) => ({
              productId: product.id,
              requiredQty: erpLine.quantity,
              requiredCondition: condition,
              erpWarehouse: erpLine.erpWarehouse,
            })),
          },
        },
      });
      await tx.eRPDocument.create({
        data: {
          documentType: "OutboundOrder",
          externalNumber: erpOrder.shNo,
          payload: erpOrder as unknown as Prisma.InputJsonValue,
          outboundOrderId: order.id,
        },
      });
      await audit(tx, who, {
        operation: "Imported replacement outbound",
        entityType: "OutboundOrder",
        entityId: order.id,
        businessReference: order.shNo,
        remark: "Read-only Replacement Unit Information imported as Pending Allocation; no balance or frozen quantity changed.",
      });
    });
  }

  private async allocateOutbound(input: Extract<WmsCommand, { type: "allocateOutbound" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const line = await tx.outboundOrderLine.findUnique({
        where: { id: input.lineId },
        include: { product: true, outboundOrder: { include: { warehouse: true } } },
      });
      if (!line || line.outboundOrderId !== input.orderId) throw new DomainError("Outbound order line not found.");
      const location = await requireLocation(tx, line.outboundOrder.warehouseId, input.locationCode);
      const container = input.containerCode
        ? await tx.container.findFirst({
            where: { warehouseId: line.outboundOrder.warehouseId, code: input.containerCode, active: true },
          })
        : null;
      if (input.containerCode && !container) throw new DomainError("Invalid container for the selected warehouse.");
      const key = balanceKey({
        warehouseId: line.outboundOrder.warehouseId,
        locationId: location.id,
        containerId: container?.id,
        productId: line.productId,
        itemType: line.product.itemType,
        condition: line.requiredCondition,
      });
      const inventory = new InventoryRepository(tx);
      const balance = await inventory.getOrCreateBalance(key);
      if (input.qty <= 0 || line.allocatedQty.plus(input.qty).greaterThan(line.requiredQty))
        throw new DomainError("Allocation quantity exceeds the requested quantity.");
      const otherReserved = await tx.outboundAllocation.aggregate({
        where: {
          outboundOrderLine: {
            outboundOrder: { warehouseId: line.outboundOrder.warehouseId, status: { notIn: ["Outbound", "ERP_Synced", "Cancelled"] } },
            productId: line.productId,
            requiredCondition: line.requiredCondition,
          },
          locationId: location.id,
          containerId: container?.id ?? null,
          preparedAt: null,
          dispatchedAt: null,
        },
        _sum: { quantity: true },
      });
      const allocatable = balance.physicalQty
        .minus(balance.frozenQty)
        .minus(otherReserved._sum.quantity ?? 0);
      if (decimal(input.qty).greaterThan(allocatable))
        throw new DomainError("INSUFFICIENT_AVAILABLE_STOCK");
      await tx.outboundAllocation.create({
        data: {
          outboundOrderLineId: line.id,
          locationId: location.id,
          containerId: container?.id,
          quantity: input.qty,
        },
      });
      const allocatedQty = line.allocatedQty.plus(input.qty);
      await tx.outboundOrderLine.update({
        where: { id: line.id },
        data: { allocatedQty },
      });
      const allLines = await tx.outboundOrderLine.findMany({ where: { outboundOrderId: input.orderId } });
      const complete = allLines.every((row) =>
        row.id === line.id ? allocatedQty.equals(row.requiredQty) : row.allocatedQty.equals(row.requiredQty),
      );
      await tx.outboundOrder.update({
        where: { id: input.orderId },
        data: { status: complete ? "Allocated" : "Pending_Allocation" },
      });
      await audit(tx, who, {
        operation: "Allocated outbound",
        entityType: "OutboundOrder",
        entityId: input.orderId,
        businessReference: line.outboundOrder.shNo,
        remark: `Allocated ${input.qty} at ${location.code}; physical and frozen quantities unchanged.`,
      });
    });
  }

  private async prepareOutbound(input: Extract<WmsCommand, { type: "prepareOutbound" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const line = await tx.outboundOrderLine.findUnique({
        where: { id: input.lineId },
        include: {
          product: true,
          outboundOrder: { include: { warehouse: true } },
          allocations: {
            where: { preparedAt: null, dispatchedAt: null },
            include: { location: true },
          },
        },
      });
      if (!line || line.outboundOrderId !== input.orderId) throw new DomainError("Outbound order line not found.");
      const selected = input.allocationIds?.length
        ? line.allocations.filter((row) => input.allocationIds!.includes(row.id))
        : line.allocations;
      if (!selected.length || (input.allocationIds && selected.length !== input.allocationIds.length))
        throw new DomainError("ORDER_NOT_ALLOCATED");
      const inventory = new InventoryRepository(tx);
      const at = new Date();
      let preparedDelta = decimal(0);
      for (const allocation of selected) {
        const key = balanceKey({
          warehouseId: line.outboundOrder.warehouseId,
          locationId: allocation.locationId,
          containerId: allocation.containerId,
          productId: line.productId,
          itemType: line.product.itemType,
          condition: line.requiredCondition,
        });
        const balance = await inventory.getOrCreateBalance(key);
        validatePreparation(
          number(line.requiredQty),
          number(line.preparedQty.plus(preparedDelta)),
          number(balance.physicalQty.minus(balance.frozenQty)),
          number(allocation.quantity),
        );
        await inventory.applyDelta(key, { frozenDelta: allocation.quantity });
        await tx.outboundAllocation.update({ where: { id: allocation.id }, data: { preparedAt: at } });
        if (allocation.serialNumberId)
          await tx.serialNumber.update({
            where: { id: allocation.serialNumberId },
            data: { status: "Prepared" },
          });
        preparedDelta = preparedDelta.plus(allocation.quantity);
        await tx.stockTransaction.create({
          data: {
            transactionType: "Prepared",
            warehouseId: line.outboundOrder.warehouseId,
            sourceLocationId: allocation.locationId,
            containerId: allocation.containerId,
            productId: line.productId,
            itemType: line.product.itemType,
            condition: line.requiredCondition,
            quantity: allocation.quantity,
            frozenDelta: allocation.quantity,
            businessReference: line.outboundOrder.shNo,
            operationId: operationId(),
            effectiveAt: at,
            remark: "Physical preparation confirmed; frozen increased and physical unchanged.",
            createdById: who.id,
          },
        });
      }
      const preparedQty = line.preparedQty.plus(preparedDelta);
      await tx.outboundOrderLine.update({ where: { id: line.id }, data: { preparedQty } });
      const allLines = await tx.outboundOrderLine.findMany({ where: { outboundOrderId: input.orderId } });
      const complete = allLines.every((row) =>
        row.id === line.id ? preparedQty.equals(row.requiredQty) : row.preparedQty.equals(row.requiredQty),
      );
      let code = line.outboundOrder.pickupCode;
      let batchId = line.outboundOrder.pickupBatchId;
      if (complete && !batchId) {
        code = code ?? (await pickupCode(tx, line.outboundOrder.warehouse, who));
        const batch = await tx.pickupBatch.upsert({
          where: { code },
          update: { readyAt: at },
          create: {
            code,
            warehouseId: line.outboundOrder.warehouseId,
            readyAt: at,
          },
        });
        batchId = batch.id;
      }
      await tx.outboundOrder.update({
        where: { id: input.orderId },
        data: {
          pickupCode: code,
          pickupBatchId: batchId,
          status: complete ? "Ready_for_Pickup" : "Prepared",
          preparedAt: line.outboundOrder.preparedAt ?? at,
          readyForPickupAt: complete ? at : null,
        },
      });
      await audit(tx, who, {
        operation: "Prepared outbound",
        entityType: "OutboundOrder",
        entityId: input.orderId,
        businessReference: line.outboundOrder.shNo,
        remark: `Confirmed physical preparation of ${number(preparedDelta)} allocated units; physical quantity unchanged.`,
      });
    });
  }

  private async scanOutboundSerial(input: Extract<WmsCommand, { type: "scanOutboundSerial" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const line = await tx.outboundOrderLine.findUnique({
        where: { id: input.lineId },
        include: {
          product: true,
          outboundOrder: { include: { warehouse: true } },
          allocations: { where: { dispatchedAt: null }, include: { location: true } },
        },
      });
      if (!line || line.outboundOrderId !== input.orderId) throw new DomainError("Outbound order line not found.");
      if (!line.product.serialTrackingRequired) throw new DomainError("This product does not require serial scanning.");
      const serial = await tx.serialNumber.findUnique({
        where: { serialNumber: input.serialNumber.trim().toUpperCase() },
        include: { product: true, currentWarehouse: true, currentLocation: true },
      });
      if (!serial) throw new DomainError("Serial number does not match the requested SKU.");
      const otherAllocation = await tx.outboundAllocation.findFirst({
        where: {
          serialNumberId: serial.id,
          dispatchedAt: null,
          outboundOrderLineId: { not: line.id },
        },
      });
      validateOutboundSerial({
        serialSku: serial.product.sku,
        requiredSku: line.product.sku,
        serialCondition: serial.condition,
        requiredCondition: line.requiredCondition,
        serialWarehouse: serial.currentWarehouse?.code as WarehouseCode | undefined,
        requiredWarehouse: line.outboundOrder.warehouse.code as WarehouseCode,
        serialLocation: serial.currentLocation?.code,
        allocatedLocations: line.allocations.map((row) => row.location.code),
        status: serial.status,
        allocatedToAnotherOrder: Boolean(otherAllocation),
      });
      const aggregate = line.allocations.find(
        (row) => row.locationId === serial.currentLocationId && !row.serialNumberId && row.quantity.greaterThan(0),
      );
      if (!aggregate) throw new DomainError("All allocated units at this location already have serial numbers.");
      if (aggregate.quantity.equals(1)) await tx.outboundAllocation.delete({ where: { id: aggregate.id } });
      else
        await tx.outboundAllocation.update({
          where: { id: aggregate.id },
          data: { quantity: aggregate.quantity.minus(1) },
        });
      await tx.outboundAllocation.create({
        data: {
          outboundOrderLineId: line.id,
          locationId: aggregate.locationId,
          containerId: aggregate.containerId,
          serialNumberId: serial.id,
          quantity: 1,
          preparedAt: aggregate.preparedAt,
        },
      });
      if (aggregate.preparedAt)
        await tx.serialNumber.update({ where: { id: serial.id }, data: { status: "Prepared" } });
      await audit(tx, who, {
        operation: "Allocated outbound serial",
        entityType: "SerialNumber",
        entityId: serial.id,
        businessReference: line.outboundOrder.shNo,
        remark: `${serial.serialNumber} validated for SKU, condition, warehouse and allocated physical location.`,
      });
    });
  }

  private async dispatchOutbound(orderId: string) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const order = await tx.outboundOrder.findUnique({
        where: { id: orderId },
        include: {
          warehouse: true,
          lines: {
            include: {
              product: true,
              allocations: { where: { dispatchedAt: null }, include: { location: true, serialNumber: true } },
            },
          },
        },
      });
      if (!order) throw new DomainError("Outbound order not found.");
      const inventory = new InventoryRepository(tx);
      const op = operationId();
      const outboundAt = new Date();
      for (const line of order.lines) {
        if (!line.preparedQty.equals(line.requiredQty))
          throw new DomainError("All requested stock must be prepared before dispatch.");
        const allocated = line.allocations.reduce((sum, row) => sum.plus(row.quantity), decimal(0));
        if (!allocated.equals(line.requiredQty)) throw new DomainError("Prepared allocations do not match required quantity.");
        if (
          line.product.serialTrackingRequired &&
          (line.allocations.some((row) => !row.serialNumberId || !row.quantity.equals(1)) ||
            line.allocations.length !== number(line.requiredQty))
        )
          throw new DomainError("Product outbound must have all required serial numbers.");
        for (const allocation of line.allocations) {
          const key = balanceKey({
            warehouseId: order.warehouseId,
            locationId: allocation.locationId,
            containerId: allocation.containerId,
            productId: line.productId,
            itemType: line.product.itemType,
            condition: line.requiredCondition,
          });
          await inventory.applyDelta(key, {
            physicalDelta: allocation.quantity.negated(),
            frozenDelta: allocation.quantity.negated(),
          });
          if (allocation.serialNumber) {
            if (allocation.serialNumber.status !== "Prepared")
              throw new DomainError("Serial allocation is no longer eligible for dispatch.");
            await tx.serialNumber.update({
              where: { id: allocation.serialNumber.id },
              data: { status: "Outbound", currentWarehouseId: null, currentLocationId: null },
            });
          }
          await tx.outboundAllocation.update({
            where: { id: allocation.id },
            data: { dispatchedAt: outboundAt },
          });
          await tx.stockTransaction.create({
            data: {
              transactionType: "Outbound",
              warehouseId: order.warehouseId,
              sourceLocationId: allocation.locationId,
              containerId: allocation.containerId,
              productId: line.productId,
              serialNumberId: allocation.serialNumberId,
              itemType: line.product.itemType,
              condition: line.requiredCondition,
              quantity: allocation.quantity,
              physicalDelta: allocation.quantity.negated(),
              frozenDelta: allocation.quantity.negated(),
              businessReference: order.shNo,
              operationId: op,
              effectiveAt: outboundAt,
              remark: "Confirmed physical dispatch; ERP write-back queued.",
              createdById: who.id,
            },
          });
        }
        await tx.outboundOrderLine.update({
          where: { id: line.id },
          data: { dispatchedQty: line.requiredQty },
        });
      }
      await tx.outboundOrder.update({
        where: { id: order.id },
        data: { status: "Outbound", erpSyncStatus: "Pending", outboundAt },
      });
      await tx.eRPSyncJob.create({
        data: {
          operationType: "Outbound",
          entityType: "OutboundOrder",
          entityId: order.id,
          payload: { shNo: order.shNo, warehouse: order.warehouse.code },
          outboundOrderId: order.id,
        },
      });
      await audit(tx, who, {
        operation: "Confirmed outbound",
        entityType: "OutboundOrder",
        entityId: order.id,
        businessReference: order.shNo,
        remark: "Exact allocated balances and serials dispatched; ERP write-back queued independently.",
      });
    });
  }

  private async adjust(input: Extract<WmsCommand, { type: "adjustStock" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const warehouse = await requireWarehouse(tx, input.warehouseCode);
      const location = await requireLocation(tx, warehouse.id, input.locationCode);
      const product = input.sku ? await requireProduct(tx, input.sku) : null;
      if (product && product.itemType !== input.itemType) throw new DomainError("Item type does not match product master.");
      const key = balanceKey({
        warehouseId: warehouse.id,
        locationId: location.id,
        productId: product?.id,
        itemType: input.itemType,
        condition: input.condition,
      });
      const inventory = new InventoryRepository(tx);
      const current = await inventory.getOrCreateBalance(key);
      validateAdjustment({
        direction: input.direction,
        itemType: input.itemType,
        sku: input.sku,
        reason: input.reason,
        qty: input.qty,
        availableQty: number(current.physicalQty.minus(current.frozenQty)),
      });
      const signed = input.direction === "In" ? decimal(input.qty) : decimal(input.qty).negated();
      await inventory.applyDelta(key, { physicalDelta: signed });
      if (input.serialNumber) {
        if (input.direction !== "In" || !product?.serialTrackingRequired || input.qty !== 1)
          throw new DomainError("A serial number may be registered only for one inbound serial-tracked Product.");
        await tx.serialNumber.create({
          data: {
            serialNumber: input.serialNumber.trim().toUpperCase(),
            productId: product.id,
            currentWarehouseId: warehouse.id,
            currentLocationId: location.id,
            condition: input.condition,
            status: "In_Stock",
          },
        });
      }
      await tx.stockTransaction.create({
        data: {
          transactionType: input.direction === "In" ? "Adjustment_In" : "Adjustment_Out",
          warehouseId: warehouse.id,
          sourceLocationId: input.direction === "Out" ? location.id : undefined,
          targetLocationId: input.direction === "In" ? location.id : undefined,
          productId: product?.id,
          itemType: input.itemType,
          condition: input.condition,
          quantity: input.qty,
          physicalDelta: signed,
          operationId: operationId(),
          reason: input.reason,
          remark: input.remark,
          createdById: who.id,
        },
      });
      await audit(tx, who, {
        operation: `Adjustment ${input.direction}`,
        entityType: "InventoryBalance",
        entityId: current.id,
        remark: `${input.reason}: ${input.remark}`,
      });
    });
  }

  private async registerSerial(input: Extract<WmsCommand, { type: "registerSerial" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const warehouse = await requireWarehouse(tx, input.warehouseCode);
      const location = await requireLocation(tx, warehouse.id, input.locationCode);
      const product = await requireProduct(tx, input.sku);
      await tx.serialNumber.create({
        data: {
          serialNumber: input.serialNumber.trim().toUpperCase(),
          productId: product.id,
          currentWarehouseId: warehouse.id,
          currentLocationId: location.id,
          condition: input.condition,
          status: "In_Stock",
        },
      });
      await audit(tx, who, {
        operation: "Registered serial",
        entityType: "SerialNumber",
        entityId: input.serialNumber,
        remark: `${input.serialNumber} registered at ${input.warehouseCode}/${input.locationCode}.`,
      });
    });
  }

  private async receiveFaulty(serialNumber: string) {
    const erp = await this.lookupFaulty(serialNumber);
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const warehouse = await requireWarehouse(tx, "SYD");
      const location = await requireLocation(tx, warehouse.id, "REPAIR-01");
      const product = await requireProduct(tx, erp.sku);
      const normalized = erp.serialNumber.trim().toUpperCase();
      const existing = await tx.serialNumber.findUnique({
        where: { serialNumber: normalized },
        include: { repairReturns: { where: { active: true } } },
      });
      assertFaultyReceiptAllowed(existing?.status, Boolean(existing?.repairReturns.length));
      const serial = existing
        ? await tx.serialNumber.update({
            where: { id: existing.id },
            data: {
              productId: product.id,
              currentWarehouseId: warehouse.id,
              currentLocationId: location.id,
              condition: "Repair",
              status: "Repair",
              sourceDocument: erp.relatedShNo,
            },
          })
        : await tx.serialNumber.create({
            data: {
              serialNumber: normalized,
              productId: product.id,
              currentWarehouseId: warehouse.id,
              currentLocationId: location.id,
              condition: "Repair",
              status: "Repair",
              sourceDocument: erp.relatedShNo,
            },
          });
      const inventory = new InventoryRepository(tx);
      const key = balanceKey({
        warehouseId: warehouse.id,
        locationId: location.id,
        productId: product.id,
        itemType: product.itemType,
        condition: "Repair",
      });
      await inventory.applyDelta(key, { physicalDelta: 1 });
      const repairJob = await tx.repairJob.create({
        data: {
          serialNumberId: serial.id,
          warehouseId: warehouse.id,
          productId: product.id,
          receivedLocationId: location.id,
          currentLocationId: location.id,
          originalShNo: erp.relatedShNo,
          status: "Pending_Repair",
          source: "Native_Return",
          remark: "ERP-matched faulty unit received to REPAIR-01.",
        },
      });
      await tx.repairReturn.create({
        data: {
          serialNumberId: serial.id,
          productId: product.id,
          locationId: location.id,
          relatedShNo: erp.relatedShNo,
          erpMatched: true,
          active: true,
          repairJobId: repairJob.id,
          remark: "ERP-matched faulty unit received to REPAIR-01.",
        },
      });
      await tx.stockTransaction.create({
        data: {
          transactionType: "Return_to_Repair",
          warehouseId: warehouse.id,
          targetLocationId: location.id,
          productId: product.id,
          serialNumberId: serial.id,
          itemType: product.itemType,
          condition: "Repair",
          quantity: 1,
          physicalDelta: 1,
          businessReference: erp.relatedShNo,
          operationId: operationId(),
          remark: "Faulty unit received to repair inventory.",
          createdById: who.id,
        },
      });
      await audit(tx, who, {
        operation: "Received faulty serial",
        entityType: "RepairReturn",
        entityId: repairJob.id,
        businessReference: erp.relatedShNo,
        remark: `${normalized} received once into SYD/REPAIR-01.`,
      });
    });
  }

  private async completeRepair(input: Extract<WmsCommand, { type: "completeRepair" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const job = await tx.repairJob.findUnique({
        where: { id: input.repairJobId },
        include: { product: true, serialNumber: true, warehouse: true, repairReturn: true },
      });
      if (!job || !["Received", "Pending_Repair", "In_Repair"].includes(job.status))
        throw new DomainError("Repair job is not eligible for completion.");
      const target = await requireLocation(tx, job.warehouseId, input.targetLocationCode);
      const targetCondition =
        input.outcome === "Repair_Good" ? "Repair_Good" : input.outcome === "Scrap" ? "Scrap" : "Repair";
      const targetStatus =
        input.outcome === "Repair_Good" ? "Repair_Good" : input.outcome === "Scrap" ? "Scrapped" : "Repair_Completed";
      const serialStatus = input.outcome === "Scrap" ? "Scrapped" : "In_Stock";
      const inventory = new InventoryRepository(tx);
      const sourceKey = balanceKey({
        warehouseId: job.warehouseId,
        locationId: job.currentLocationId,
        productId: job.productId,
        itemType: job.product.itemType,
        condition: "Repair",
      });
      const source = await inventory.getOrCreateBalance(sourceKey);
      if (source.physicalQty.lessThan(1)) throw new DomainError("Repair inventory is inconsistent.");
      const targetKey = balanceKey({
        warehouseId: job.warehouseId,
        locationId: target.id,
        productId: job.productId,
        itemType: job.product.itemType,
        condition: targetCondition,
      });
      await inventory.applyDelta(sourceKey, { physicalDelta: -1 });
      await inventory.applyDelta(targetKey, { physicalDelta: 1 });
      const at = new Date();
      if (job.serialNumberId) {
        await tx.serialNumber.update({
          where: { id: job.serialNumberId },
          data: {
            currentWarehouseId: job.warehouseId,
            currentLocationId: target.id,
            condition: targetCondition,
            status: serialStatus,
          },
        });
      }
      await tx.repairJob.update({
        where: { id: job.id },
        data: {
          currentLocationId: target.id,
          status: targetStatus,
          outcome: input.outcome,
          repairCompletedAt: at,
          returnedToStockAt: at,
          remark: input.remark,
        },
      });
      if (job.repairReturn)
        await tx.repairReturn.update({
          where: { id: job.repairReturn.id },
          data: { active: false, completedAt: at },
        });
      await tx.stockTransaction.create({
        data: {
          transactionType: "Repair_Completed",
          warehouseId: job.warehouseId,
          sourceLocationId: job.currentLocationId,
          targetLocationId: target.id,
          productId: job.productId,
          serialNumberId: job.serialNumberId,
          itemType: job.product.itemType,
          condition: targetCondition,
          quantity: 1,
          physicalDelta: 0,
          businessReference: job.originalShNo,
          operationId: operationId(),
          effectiveAt: at,
          reason: input.outcome,
          remark: input.remark,
          createdById: who.id,
        },
      });
      await audit(tx, who, {
        operation: "Completed repair",
        entityType: "RepairJob",
        entityId: job.id,
        businessReference: job.originalShNo ?? undefined,
        remark: job.serialNumber
          ? `${job.serialNumber.serialNumber} preserved and reclassified to ${targetCondition} at ${target.code}.`
          : `Legacy quantity reclassified to ${targetCondition} at ${target.code}; traceability warning retained.`,
      });
    });
  }

  private async legacyRepairGoodIn(input: Extract<WmsCommand, { type: "legacyRepairGoodIn" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const warehouse = await requireWarehouse(tx, input.warehouseCode);
      const location = await requireLocation(tx, warehouse.id, input.locationCode);
      const product = await requireProduct(tx, input.sku);
      if (product.serialTrackingRequired && input.serialNumber && input.qty !== 1)
        throw new DomainError("A known serial can recognise exactly one legacy unit.");
      let serialId: string | undefined;
      if (input.serialNumber) {
        const normalized = input.serialNumber.trim().toUpperCase();
        const serial = await tx.serialNumber.create({
          data: {
            serialNumber: normalized,
            productId: product.id,
            currentWarehouseId: warehouse.id,
            currentLocationId: location.id,
            condition: "Repair_Good",
            status: "In_Stock",
            sourceDocument: "Legacy / Manual Recognition",
          },
        });
        serialId = serial.id;
      }
      const inventory = new InventoryRepository(tx);
      const key = balanceKey({
        warehouseId: warehouse.id,
        locationId: location.id,
        productId: product.id,
        itemType: product.itemType,
        condition: "Repair_Good",
      });
      await inventory.applyDelta(key, { physicalDelta: input.qty });
      await tx.stockTransaction.create({
        data: {
          transactionType: "RepairGood_Adjustment_In",
          warehouseId: warehouse.id,
          targetLocationId: location.id,
          productId: product.id,
          serialNumberId: serialId,
          itemType: product.itemType,
          condition: "Repair_Good",
          quantity: input.qty,
          physicalDelta: input.qty,
          operationId: operationId(),
          reason: "Legacy / Manual Recognition",
          remark: input.remark,
          createdById: who.id,
        },
      });
      await audit(tx, who, {
        operation: "Recognised legacy Repair_Good",
        entityType: "InventoryBalance",
        entityId: `${warehouse.id}:${location.id}:${product.id}`,
        remark: `${input.qty} recognised from Legacy / Manual source; no fabricated RepairJob was created.`,
      });
    });
  }

  private async move(input: Extract<WmsCommand, { type: "moveStock" }>) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const warehouse = await requireWarehouse(tx, input.warehouseCode);
      const source = await requireLocation(tx, warehouse.id, input.fromLocation);
      const destination = await requireLocation(tx, warehouse.id, input.toLocation);
      const product = await requireProduct(tx, input.sku);
      const key = (locationId: string) =>
        balanceKey({
          warehouseId: warehouse.id,
          locationId,
          productId: product.id,
          itemType: product.itemType,
          condition: input.condition,
        });
      const inventory = new InventoryRepository(tx);
      const sourceBalance = await inventory.getOrCreateBalance(key(source.id));
      validateMove({
        sourceWarehouse: input.warehouseCode,
        destinationWarehouse: input.warehouseCode,
        sourceLocation: source.code,
        destinationLocation: destination.code,
        availableQty: number(sourceBalance.physicalQty.minus(sourceBalance.frozenQty)),
        qty: input.qty,
      });
      if (product.serialTrackingRequired) {
        if (!Number.isInteger(input.qty) || input.serialNumbers?.length !== input.qty)
          throw new DomainError("SN-tracked Product Move requires the exact serial numbers for every moved unit.");
        const serials = await tx.serialNumber.findMany({
          where: { serialNumber: { in: input.serialNumbers }, productId: product.id },
        });
        if (
          serials.length !== input.qty ||
          serials.some(
            (row) =>
              row.currentWarehouseId !== warehouse.id ||
              row.currentLocationId !== source.id ||
              row.condition !== input.condition ||
              row.status !== "In_Stock",
          )
        )
          throw new DomainError("One or more selected serial numbers are not eligible at the source location.");
        await tx.serialNumber.updateMany({
          where: { id: { in: serials.map((row) => row.id) } },
          data: { currentLocationId: destination.id },
        });
      }
      await inventory.applyDelta(key(source.id), { physicalDelta: decimal(input.qty).negated() });
      await inventory.applyDelta(key(destination.id), { physicalDelta: input.qty });
      await tx.stockTransaction.create({
        data: {
          transactionType: "Move",
          warehouseId: warehouse.id,
          sourceLocationId: source.id,
          targetLocationId: destination.id,
          productId: product.id,
          itemType: product.itemType,
          condition: input.condition,
          quantity: input.qty,
          physicalDelta: 0,
          operationId: operationId(),
          remark: input.remark,
          createdById: who.id,
        },
      });
      await audit(tx, who, {
        operation: "Moved stock",
        entityType: "InventoryBalance",
        entityId: sourceBalance.id,
        remark: `${input.qty} moved atomically from ${source.code} to ${destination.code}.`,
      });
    });
  }

  private async dispatchTransfer(transferId: string) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const transfer = await tx.transferOrder.findUnique({
        where: { id: transferId },
        include: {
          sourceWarehouse: true,
          destinationWarehouse: true,
          lines: { include: { product: true, serials: { include: { serialNumber: { include: { currentLocation: true } } } } } },
        },
      });
      if (!transfer || transfer.status !== "Draft") throw new DomainError("Transfer is not ready for Transfer Out.");
      if (transfer.sourceWarehouseId === transfer.destinationWarehouseId)
        throw new DomainError("Transfer source and destination warehouses must differ.");
      const inventory = new InventoryRepository(tx);
      const dispatchedAt = new Date();
      const op = operationId();
      for (const line of transfer.lines) {
        const sourceLocationId = line.serials[0]?.serialNumber.currentLocationId;
        if (!sourceLocationId) throw new DomainError("Transfer source location is missing.");
        const key = balanceKey({
          warehouseId: transfer.sourceWarehouseId,
          locationId: sourceLocationId,
          productId: line.productId,
          itemType: line.product.itemType,
          condition: line.condition,
        });
        const current = await inventory.getOrCreateBalance(key);
        if (current.physicalQty.minus(current.frozenQty).lessThan(line.quantity))
          throw new DomainError("Transfer cannot consume frozen inventory.");
        if (
          line.product.serialTrackingRequired &&
          (line.serials.length !== number(line.quantity) ||
            line.serials.some(
              (row) =>
                row.serialNumber.currentWarehouseId !== transfer.sourceWarehouseId ||
                row.serialNumber.currentLocationId !== sourceLocationId ||
                row.serialNumber.status !== "In_Stock",
            ))
        )
          throw new DomainError("Transfer serial selection is incomplete or invalid.");
        await inventory.applyDelta(key, { physicalDelta: line.quantity.negated(), inTransitDelta: line.quantity });
        for (const link of line.serials) {
          await tx.serialNumber.update({
            where: { id: link.serialNumberId },
            data: { status: "In_Transit", currentLocationId: null },
          });
          await tx.transferSerial.update({ where: { id: link.id }, data: { dispatchedAt } });
        }
        await tx.stockTransaction.create({
          data: {
            transactionType: "Transfer_Out",
            warehouseId: transfer.sourceWarehouseId,
            sourceLocationId,
            productId: line.productId,
            itemType: line.product.itemType,
            condition: line.condition,
            quantity: line.quantity,
            physicalDelta: line.quantity.negated(),
            inTransitDelta: line.quantity,
            businessReference: transfer.transferNo,
            operationId: op,
            remark: "Transfer Out; Preview tracks in-transit quantity on the source balance.",
            createdById: who.id,
          },
        });
      }
      await tx.transferOrder.update({
        where: { id: transfer.id },
        data: { status: "In_Transit", dispatchedAt },
      });
      await audit(tx, who, {
        operation: "Transfer Out",
        entityType: "TransferOrder",
        entityId: transfer.id,
        businessReference: transfer.transferNo,
        remark: `${transfer.sourceWarehouse.code} to ${transfer.destinationWarehouse.code} dispatched.`,
      });
    });
  }

  private async receiveTransfer(transferId: string, destinationCode: string) {
    await serializable(this.prisma, async (tx) => {
      const who = await actor(tx);
      const transfer = await tx.transferOrder.findUnique({
        where: { id: transferId },
        include: {
          sourceWarehouse: true,
          destinationWarehouse: true,
          lines: { include: { product: true, serials: { include: { serialNumber: true } } } },
        },
      });
      if (!transfer || transfer.status !== "In_Transit") throw new DomainError("Transfer is not In Transit.");
      const destination = await requireLocation(tx, transfer.destinationWarehouseId, destinationCode);
      const inventory = new InventoryRepository(tx);
      const receivedAt = new Date();
      const op = operationId();
      for (const line of transfer.lines) {
        const transaction = await tx.stockTransaction.findFirst({
          where: { businessReference: transfer.transferNo, transactionType: "Transfer_Out", productId: line.productId },
        });
        if (!transaction?.sourceLocationId) throw new DomainError("Transfer source transaction is inconsistent.");
        const sourceKey = balanceKey({
          warehouseId: transfer.sourceWarehouseId,
          locationId: transaction.sourceLocationId,
          productId: line.productId,
          itemType: line.product.itemType,
          condition: line.condition,
        });
        const destinationKey = balanceKey({
          warehouseId: transfer.destinationWarehouseId,
          locationId: destination.id,
          productId: line.productId,
          itemType: line.product.itemType,
          condition: line.condition,
        });
        await inventory.applyDelta(sourceKey, { inTransitDelta: line.quantity.negated() });
        await inventory.applyDelta(destinationKey, { physicalDelta: line.quantity });
        for (const link of line.serials) {
          await tx.serialNumber.update({
            where: { id: link.serialNumberId },
            data: {
              status: "In_Stock",
              currentWarehouseId: transfer.destinationWarehouseId,
              currentLocationId: destination.id,
            },
          });
          await tx.transferSerial.update({ where: { id: link.id }, data: { receivedAt } });
        }
        await tx.transferOrderLine.update({ where: { id: line.id }, data: { receivedQty: line.quantity } });
        await tx.stockTransaction.create({
          data: {
            transactionType: "Transfer_In",
            warehouseId: transfer.destinationWarehouseId,
            targetLocationId: destination.id,
            productId: line.productId,
            itemType: line.product.itemType,
            condition: line.condition,
            quantity: line.quantity,
            physicalDelta: line.quantity,
            inTransitDelta: line.quantity.negated(),
            businessReference: transfer.transferNo,
            operationId: op,
            remark: "Transfer received at destination.",
            createdById: who.id,
          },
        });
      }
      await tx.transferOrder.update({
        where: { id: transfer.id },
        data: { status: "Received", destinationLocationId: destination.id, receivedAt },
      });
      await audit(tx, who, {
        operation: "Transfer In",
        entityType: "TransferOrder",
        entityId: transfer.id,
        businessReference: transfer.transferNo,
        remark: `Received at ${transfer.destinationWarehouse.code}/${destination.code}.`,
      });
    });
  }
}
