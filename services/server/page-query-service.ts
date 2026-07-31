import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { currentWarehouseWallClock, warehouseWallClockToUtc } from "@/lib/warehouse-time";

const number = (value: Prisma.Decimal) => value.toNumber();
const boundedPage = (page?: number, pageSize?: number) => ({
  page: Math.max(1, Math.trunc(page || 1)),
  pageSize: Math.min(100, Math.max(1, Math.trunc(pageSize || 50))),
});

export class PageQueryService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async bootstrap() {
    const [user, warehouses] = await Promise.all([
      this.prisma.user.findFirst({ where: { active: true }, include: { role: true }, orderBy: { createdAt: "asc" } }),
      this.prisma.warehouse.findMany({ orderBy: { code: "asc" } }),
    ]);
    return {
      currentUser: user ? { displayName: user.displayName, role: user.role.name, permissions: user.role.permissions } : undefined,
      warehouses: warehouses.map((row) => ({
        id: row.id, code: row.code, name: row.name, timezone: row.timezone,
        floorAreaSqm: row.floorAreaSqm ? number(row.floorAreaSqm) : undefined,
        operationalAreaSqm: row.operationalAreaSqm ? number(row.operationalAreaSqm) : undefined,
        active: row.active,
      })),
      locations: [], products: [], inventory: [], serials: [], outboundOrders: [], transfers: [],
      repairJobs: [], pickupBatches: [], transactions: [], audit: [], exceptions: [],
      pickupSequence: { SYD: 0, MEL: 0, BNE: 0 }, faultyReceivedCount: 0,
    };
  }

  async dashboard(warehouseCode: string) {
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { code: warehouseCode } });
    const now = new Date();
    const todayStart = warehouseWallClockToUtc(
      `${currentWarehouseWallClock(warehouse.timezone, now).slice(0, 10)}T00:00`,
      warehouse.timezone,
    );
    const statuses = await this.prisma.outboundOrder.groupBy({
      by: ["status"],
      where: { warehouseId: warehouse.id },
      _count: { _all: true },
    });
    const count = (values: string[]) =>
      statuses.filter((row) => values.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
    const [outboundToday, inboundToday, repairToday, faultyReturns, repairQueue, transfersInTransit, exceptions, erpSyncFailures, available, recentAudit] =
      await Promise.all([
        this.prisma.outboundOrder.count({ where: { warehouseId: warehouse.id, outboundAt: { gte: todayStart } } }),
        this.prisma.stockTransaction.aggregate({
          where: { warehouseId: warehouse.id, transactionType: "Inbound", effectiveAt: { gte: todayStart } },
          _sum: { quantity: true },
        }),
        this.prisma.repairJob.count({ where: { warehouseId: warehouse.id, repairCompletedAt: { gte: todayStart } } }),
        this.prisma.repairReturn.count({ where: { active: true, location: { warehouseId: warehouse.id } } }),
        this.prisma.repairJob.count({ where: { warehouseId: warehouse.id, status: { in: ["Received", "Pending_Repair", "In_Repair"] } } }),
        this.prisma.transferOrder.count({ where: { OR: [{ sourceWarehouseId: warehouse.id }, { destinationWarehouseId: warehouse.id }], status: { in: ["Dispatched", "In_Transit", "Partially_Received"] } } }),
        this.prisma.exception.count({ where: { status: { not: "Resolved" } } }),
        this.prisma.eRPSyncJob.count({ where: { status: { in: ["Failed", "Manual_Review"] }, outboundOrder: { warehouseId: warehouse.id } } }),
        this.prisma.inventoryBalance.aggregate({
          where: { warehouseId: warehouse.id, itemType: "Product", condition: { in: ["New", "Repair_Good"] } },
          _sum: { physicalQty: true, frozenQty: true },
        }),
        this.prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 6 }),
      ]);
    return {
      warehouse: { code: warehouse.code, timezone: warehouse.timezone },
      tasks: {
        needsAllocation: count(["Imported", "Pending_Allocation"]),
        allocated: count(["Allocated"]),
        prepared: count(["Prepared", "Partially_Prepared"]),
        readyForPickup: count(["Ready_for_Pickup"]),
        toPrepare: count(["Imported", "Pending_Allocation", "Allocated"]),
        awaitingPickup: count(["Prepared", "Ready_for_Pickup"]),
        outboundToday,
        faultyReturns,
        repairQueue,
        transfersInTransit,
        exceptions,
        erpSyncFailures,
      },
      availableUnits:
        number(available._sum.physicalQty ?? new Prisma.Decimal(0)) -
        number(available._sum.frozenQty ?? new Prisma.Decimal(0)),
      inboundToday: number(inboundToday._sum.quantity ?? new Prisma.Decimal(0)),
      repairToday,
      recentAudit: recentAudit.map((row) => ({
        id: row.id,
        operation: row.operation,
        businessReference: row.businessReference,
        entityType: row.entityType,
        at: row.createdAt.toISOString(),
        actor: row.user.displayName,
      })),
    };
  }

  async inventory(input: {
    page?: number; pageSize?: number; warehouse?: string; location?: string; sku?: string;
    model?: string; condition?: string; itemType?: string; positiveOnly?: boolean; anomaliesOnly?: boolean;
    excludeRepair?: boolean;
  }) {
    const { page, pageSize } = boundedPage(input.page, input.pageSize);
    const where: Prisma.InventoryBalanceWhereInput = {
      warehouse: input.warehouse ? { code: input.warehouse } : undefined,
      location: input.location ? { code: { contains: input.location, mode: "insensitive" } } : undefined,
      product: input.sku || input.model ? {
        sku: input.sku ? { contains: input.sku, mode: "insensitive" } : undefined,
        model: input.model ? { contains: input.model, mode: "insensitive" } : undefined,
      } : undefined,
      condition: input.condition
        ? input.condition as Prisma.InventoryBalanceWhereInput["condition"]
        : input.excludeRepair
          ? { not: "Repair" }
          : undefined,
      itemType: input.itemType as Prisma.InventoryBalanceWhereInput["itemType"],
      physicalQty: input.positiveOnly ? { gt: 0 } : undefined,
      OR: input.anomaliesOnly
        ? [{ physicalQty: { lt: 0 } }, { frozenQty: { lt: 0 } }, { legacySerialGap: true }]
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.inventoryBalance.count({ where }),
      this.prisma.inventoryBalance.findMany({
        where,
        include: { warehouse: true, location: true, container: true, product: true },
        orderBy: [{ location: { code: "asc" } }, { product: { sku: "asc" } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      page, pageSize, total, totalPages: Math.ceil(total / pageSize),
      rows: rows.map((row) => ({
        id: row.id, warehouseCode: row.warehouse.code, locationCode: row.location.code,
        containerCode: row.container?.code, sku: row.product?.sku, model: row.product?.model ?? "Unmonitored material",
        itemType: row.itemType, condition: row.condition, physicalQty: number(row.physicalQty),
        frozenQty: number(row.frozenQty), inTransitQty: number(row.inTransitQty),
        availableQty: number(row.physicalQty.minus(row.frozenQty)), legacySerialGap: row.legacySerialGap,
      })),
    };
  }

  async serialSearch(query: string, limit = 25) {
    const q = query.trim().toUpperCase();
    if (!q) return { rows: [] };
    const rows = await this.prisma.serialNumber.findMany({
      where: { OR: [{ serialNumber: { startsWith: q } }, { product: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }] } }] },
      include: { product: true, currentWarehouse: true, currentLocation: true },
      orderBy: { serialNumber: "asc" }, take: Math.min(50, Math.max(1, limit)),
    });
    return { rows: rows.map((row) => ({
      id: row.id, serialNumber: row.serialNumber, sku: row.product.sku, model: row.product.model,
      warehouseCode: row.currentWarehouse?.code, locationCode: row.currentLocation?.code,
      condition: row.condition, status: row.status,
    })) };
  }

  async repairQueue(input: {
    page?: number; pageSize?: number; warehouse?: string; status?: string;
    query?: string; serialNumber?: string; receivedFrom?: Date; receivedTo?: Date;
  }) {
    const { page, pageSize } = boundedPage(input.page, input.pageSize);
    const where: Prisma.RepairJobWhereInput = {
      warehouse: input.warehouse ? { code: input.warehouse } : undefined,
      status: input.status ? input.status as Prisma.RepairJobWhereInput["status"] : undefined,
      receivedAt: input.receivedFrom || input.receivedTo
        ? { gte: input.receivedFrom, lte: input.receivedTo }
        : undefined,
      serialNumber: input.serialNumber
        ? { serialNumber: { contains: input.serialNumber.trim().toUpperCase() } }
        : undefined,
      product: input.query
        ? { OR: [
            { sku: { contains: input.query, mode: "insensitive" } },
            { model: { contains: input.query, mode: "insensitive" } },
          ] }
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.repairJob.count({ where }),
      this.prisma.repairJob.findMany({
        where,
        include: { product: true, serialNumber: true, warehouse: true, currentLocation: true },
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      page, pageSize, total, totalPages: Math.ceil(total / pageSize),
      rows: rows.map((row) => ({
        id: row.id, serialNumber: row.serialNumber?.serialNumber, sku: row.product.sku,
        model: row.product.model, warehouseCode: row.warehouse.code,
        currentLocation: row.currentLocation.code, originalShNo: row.originalShNo ?? undefined,
        status: row.status, outcome: row.outcome ?? undefined, source: row.source,
        receivedAt: row.receivedAt.toISOString(), repairStartedAt: row.repairStartedAt?.toISOString(),
        repairCompletedAt: row.repairCompletedAt?.toISOString(),
        returnedToStockAt: row.returnedToStockAt?.toISOString(), remark: row.remark,
      })),
    };
  }

  async outbound(input: { page?: number; pageSize?: number; warehouse?: string; status?: string; history?: boolean }) {
    const { page, pageSize } = boundedPage(input.page, input.pageSize);
    const active = ["Imported", "Pending_Allocation", "Allocated", "Prepared", "Partially_Prepared", "Ready_for_Pickup"];
    const queueStatuses =
      input.status === "To_Prepare" ? ["Draft", "Ready", "Imported", "Pending_Allocation", "Allocated"] :
      input.status === "Partially_Prepared" ? ["Partially_Prepared"] :
      input.status === "Awaiting_Pickup" ? ["Prepared", "Ready_for_Pickup"] :
      input.status === "Outbound" ? ["Outbound", "ERP_Synced"] :
      undefined;
    const where: Prisma.OutboundOrderWhereInput = {
      warehouse: input.warehouse ? { code: input.warehouse } : undefined,
      erpSyncStatus: input.status === "ERP_Issues" ? { in: ["Failed", "Manual_Review", "Retrying"] } : undefined,
      status: queueStatuses
        ? { in: queueStatuses as never[] }
        : input.status === "ERP_Issues"
          ? undefined
          : input.status
            ? input.status as Prisma.OutboundOrderWhereInput["status"]
          : input.history
            ? { in: ["Outbound", "ERP_Synced", "Cancelled"] }
            : { in: active as never[] },
    };
    const [total, rows] = await Promise.all([
      this.prisma.outboundOrder.count({ where }),
      this.prisma.outboundOrder.findMany({
        where, include: { warehouse: true, lines: { include: { product: true } } },
        orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return { page, pageSize, total, totalPages: Math.ceil(total / pageSize), rows: rows.map((order) => ({
      id: order.id, shNo: order.shNo, pickupCode: order.pickupCode, warehouseCode: order.warehouse.code,
      status: order.status, erpSyncStatus: order.erpSyncStatus, createdAt: order.createdAt.toISOString(),
      outboundAt: order.outboundAt?.toISOString(), customerLabel: order.customerLabel,
      erpWarehouse: order.erpWarehouse,
      lines: order.lines.map((line) => ({
        id: line.id, sku: line.product.sku, model: line.product.model,
        requiredQty: number(line.requiredQty), requiredCondition: line.requiredCondition,
        erpWarehouse: line.erpWarehouse, allocatedQty: number(line.allocatedQty),
        preparedQty: number(line.preparedQty), dispatchedQty: number(line.dispatchedQty),
        allocations: [], scannedSerials: [],
      })),
      lineCount: order.lines.length,
      totalQty: order.lines.reduce((sum, line) => sum + number(line.requiredQty), 0),
    })) };
  }

  async outboundDetail(id: string) {
    const order = await this.prisma.outboundOrder.findUnique({
      where: { id },
      include: {
        warehouse: true,
        lines: {
          include: {
            product: true,
            allocations: { include: { location: true, container: true, serialNumber: true } },
          },
        },
      },
    });
    if (!order) return null;
    const productIds = order.lines.map((line) => line.productId);
    const [bootstrap, balances] = await Promise.all([
      this.bootstrap(),
      this.prisma.inventoryBalance.findMany({
        where: {
          warehouseId: order.warehouseId,
          productId: { in: productIds },
          physicalQty: { gt: 0 },
        },
        include: { warehouse: true, location: true, container: true, product: true },
        orderBy: { location: { code: "asc" } },
        take: 200,
      }),
    ]);
    return {
      ...bootstrap,
      products: order.lines.map((line) => ({
        id: line.product.id, sku: line.product.sku, model: line.product.model,
        itemType: line.product.itemType, category: line.product.category ?? "",
        serialTrackingRequired: line.product.serialTrackingRequired, reportMachine: line.product.reportMachine,
        reportGroup: line.product.reportGroup ?? undefined, active: line.product.active,
      })),
      inventory: balances.map((row) => ({
        id: row.id, warehouseCode: row.warehouse.code, locationCode: row.location.code,
        containerCode: row.container?.code, sku: row.product?.sku, model: row.product?.model ?? "Unmonitored material",
        itemType: row.itemType, condition: row.condition, physicalQty: number(row.physicalQty),
        frozenQty: number(row.frozenQty), inTransitQty: number(row.inTransitQty),
        availableQty: number(row.physicalQty.minus(row.frozenQty)),
      })),
      outboundOrders: [{
        id: order.id, shNo: order.shNo, pickupCode: order.pickupCode ?? undefined,
        erpWarehouse: order.erpWarehouse, warehouseCode: order.warehouse.code, status: order.status,
        createdAt: order.createdAt.toISOString(), importedAt: order.importedAt?.toISOString(),
        allocatedAt: order.allocatedAt?.toISOString(), preparedAt: order.preparedAt?.toISOString(),
        readyForPickupAt: order.readyForPickupAt?.toISOString(), outboundAt: order.outboundAt?.toISOString(),
        customerLabel: order.customerLabel ?? undefined, erpSyncStatus: order.erpSyncStatus,
        lines: order.lines.map((line) => {
          const allocations = line.allocations.map((allocation) => ({
            id: allocation.id, locationCode: allocation.location.code, containerCode: allocation.container?.code,
            quantity: number(allocation.quantity), serialNumber: allocation.serialNumber?.serialNumber,
            allocatedAt: allocation.allocatedAt.toISOString(), preparedAt: allocation.preparedAt?.toISOString(),
            dispatchedAt: allocation.dispatchedAt?.toISOString(),
          }));
          return {
            id: line.id, sku: line.product.sku, model: line.product.model,
            requiredQty: number(line.requiredQty), requiredCondition: line.requiredCondition,
            erpWarehouse: line.erpWarehouse, allocatedQty: number(line.allocatedQty),
            preparedQty: number(line.preparedQty), dispatchedQty: number(line.dispatchedQty),
            allocationLocation: [...new Set(allocations.map((row) => row.locationCode))].join(", ") || undefined,
            allocations,
            scannedSerials: allocations.flatMap((row) => row.serialNumber ? [row.serialNumber] : []),
          };
        }),
      }],
    };
  }

  async operations(section: string, warehouseCode: string) {
    const base = await this.bootstrap();
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { code: warehouseCode } });
    const locationRows = async (allWarehouses = false) =>
      (await this.prisma.location.findMany({
        where: allWarehouses ? { active: true } : { warehouseId: warehouse.id, active: true },
        include: { warehouse: true },
        orderBy: { code: "asc" },
        take: 500,
      })).map((row) => ({
        id: row.id, warehouseCode: row.warehouse.code, code: row.code, zone: row.zone,
        serviceZone: row.serviceZone, active: row.active,
      }));
    const productRows = async () =>
      (await this.prisma.product.findMany({ where: { active: true }, orderBy: { sku: "asc" }, take: 500 }))
        .map((row) => ({
          id: row.id, sku: row.sku, model: row.model, itemType: row.itemType,
          category: row.category ?? "", serialTrackingRequired: row.serialTrackingRequired,
          reportMachine: row.reportMachine, reportGroup: row.reportGroup ?? undefined, active: row.active,
        }));
    if (section === "receiving")
      return { ...base, locations: await locationRows(), products: await productRows() };
    if (section === "repair") {
      const [locations, jobs] = await Promise.all([
        locationRows(),
        this.prisma.repairJob.findMany({
          where: { warehouseId: warehouse.id },
          include: { product: true, serialNumber: true, warehouse: true, currentLocation: true },
          orderBy: { receivedAt: "desc" },
          take: 100,
        }),
      ]);
      return {
        ...base,
        locations,
        repairJobs: jobs.map((row) => ({
          id: row.id, serialNumber: row.serialNumber?.serialNumber, sku: row.product.sku,
          model: row.product.model, warehouseCode: row.warehouse.code,
          currentLocation: row.currentLocation.code, originalShNo: row.originalShNo ?? undefined,
          status: row.status, outcome: row.outcome ?? undefined, source: row.source,
          receivedAt: row.receivedAt.toISOString(), repairStartedAt: row.repairStartedAt?.toISOString(),
          repairCompletedAt: row.repairCompletedAt?.toISOString(),
          returnedToStockAt: row.returnedToStockAt?.toISOString(), remark: row.remark,
        })),
      };
    }
    if (section === "move" || section === "adjustment" || section === "stocktake") {
      const [locations, products, inventory] = await Promise.all([
        locationRows(),
        productRows(),
        this.inventory({ warehouse: warehouseCode, page: 1, pageSize: 100, positiveOnly: true }),
      ]);
      return { ...base, locations, products, inventory: inventory.rows };
    }
    if (section === "transfers") {
      const rows = await this.prisma.transferOrder.findMany({
        where: { OR: [{ sourceWarehouseId: warehouse.id }, { destinationWarehouseId: warehouse.id }] },
        include: {
          sourceWarehouse: true, destinationWarehouse: true, destinationLocation: true,
          lines: { include: { product: true, serials: { include: { serialNumber: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      const sourceTransactions = await this.prisma.stockTransaction.findMany({
        where: {
          transactionType: "Transfer_Out",
          businessReference: { in: rows.map((row) => row.transferNo) },
        },
        select: { businessReference: true, productId: true, sourceLocation: { select: { code: true } } },
      });
      return {
        ...base,
        transfers: rows.flatMap((order) => order.lines.map((line) => ({
          id: order.id, transferNo: order.transferNo, sourceWarehouse: order.sourceWarehouse.code,
          destinationWarehouse: order.destinationWarehouse.code,
          status: order.status === "Dispatched" ? "In_Transit" : order.status === "Cancelled" ? "Exception" : order.status,
          sku: line.product.sku, model: line.product.model, qty: number(line.quantity),
          condition: line.condition,
          serials: line.serials.map((item) => item.serialNumber.serialNumber),
          sourceLocation: sourceTransactions.find((transaction) =>
            transaction.businessReference === order.transferNo && transaction.productId === line.productId
          )?.sourceLocation?.code,
          destinationLocation: order.destinationLocation?.code,
          createdAt: order.createdAt.toISOString(), preparedAt: order.preparedAt?.toISOString(),
          dispatchedAt: order.dispatchedAt?.toISOString(), receivedAt: order.receivedAt?.toISOString(),
        }))),
      };
    }
    if (section === "exceptions") {
      const rows = await this.prisma.exception.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
      return {
        ...base,
        exceptions: rows.map((row) => ({
          id: row.id, type: row.type, severity: row.severity, entityReference: row.entityReference,
          message: row.message, status: row.status, createdAt: row.createdAt.toISOString(),
        })),
      };
    }
    if (section === "admin") {
      const [locations, products] = await Promise.all([locationRows(true), productRows()]);
      return { ...base, locations, products };
    }
    throw new Error(`Unsupported bounded operations page: ${section}`);
  }

  async audit(input: { page?: number; pageSize?: number; operation?: string; businessReference?: string }) {
    const { page, pageSize } = boundedPage(input.page, input.pageSize);
    const where: Prisma.AuditLogWhereInput = {
      operation: input.operation ? { contains: input.operation, mode: "insensitive" } : undefined,
      businessReference: input.businessReference ? { contains: input.businessReference, mode: "insensitive" } : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { page, pageSize, total, totalPages: Math.ceil(total / pageSize), rows: rows.map((row) => ({
      id: row.id, at: row.createdAt.toISOString(), actor: row.user.displayName, operation: row.operation,
      entityType: row.entityType, entityId: row.entityId, businessReference: row.businessReference, remark: row.remark,
    })) };
  }

  async transactions(input: { page?: number; pageSize?: number; operation?: string; businessReference?: string; sku?: string; sn?: string }) {
    const { page, pageSize } = boundedPage(input.page, input.pageSize);
    const where: Prisma.StockTransactionWhereInput = {
      transactionType: input.operation as Prisma.StockTransactionWhereInput["transactionType"],
      businessReference: input.businessReference ? { contains: input.businessReference, mode: "insensitive" } : undefined,
      product: input.sku ? { sku: { contains: input.sku, mode: "insensitive" } } : undefined,
      serialNumber: input.sn ? { serialNumber: { contains: input.sn, mode: "insensitive" } } : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.stockTransaction.count({ where }),
      this.prisma.stockTransaction.findMany({ where, include: { warehouse: true, product: true, serialNumber: true, sourceLocation: true, targetLocation: true }, orderBy: { effectiveAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { page, pageSize, total, totalPages: Math.ceil(total / pageSize), rows: rows.map((row) => ({
      id: row.id, effectiveAt: row.effectiveAt.toISOString(), operation: row.transactionType,
      warehouse: row.warehouse.code, sku: row.product?.sku, serialNumber: row.serialNumber?.serialNumber,
      quantity: number(row.quantity), condition: row.condition, fromLocation: row.sourceLocation?.code,
      toLocation: row.targetLocation?.code, businessReference: row.businessReference, remark: row.remark,
    })) };
  }
}
