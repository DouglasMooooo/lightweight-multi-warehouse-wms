import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { deriveWarehouseLocationState } from "@/domain/warehouse-map";
import { getPrisma } from "@/lib/prisma";

const number = (value: Prisma.Decimal) => value.toNumber();

export class WarehouseMapService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async map(warehouseCode: string, query = "") {
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { code: warehouseCode } });
    const locations = await this.prisma.location.findMany({
      where: { warehouseId: warehouse.id, active: true },
      include: {
        balances: {
          where: { physicalQty: { gt: 0 } },
          include: { product: true, container: true },
        },
      },
      orderBy: { code: "asc" },
    });
    const codes = locations.map((location) => location.code);
    const exceptions = codes.length
      ? await this.prisma.exception.findMany({
          where: {
            status: { not: "Resolved" },
            entityReference: { in: codes },
          },
          select: { entityReference: true },
        })
      : [];
    const exceptionCounts = new Map<string, number>();
    for (const row of exceptions)
      exceptionCounts.set(row.entityReference, (exceptionCounts.get(row.entityReference) ?? 0) + 1);

    const rows = locations.map((location) => {
      const skuSet = new Set(location.balances.flatMap((balance) => balance.product?.sku ? [balance.product.sku] : []));
      const conditionSet = new Set(location.balances.map((balance) => balance.condition));
      const containerSet = new Set(location.balances.flatMap((balance) => balance.container?.code ? [balance.container.code] : []));
      const itemTypeSet = new Set(location.balances.map((balance) => balance.itemType));
      const physicalQty = location.balances.reduce((sum, balance) => sum + number(balance.physicalQty), 0);
      const frozenQty = location.balances.reduce((sum, balance) => sum + number(balance.frozenQty), 0);
      const availableQty = physicalQty - frozenQty;
      const exceptionCount = exceptionCounts.get(location.code) ?? 0;
      const topBalance = [...location.balances].sort((a, b) => number(b.physicalQty) - number(a.physicalQty))[0];
      return {
        id: location.id,
        code: location.code,
        zone: location.zone,
        rack: location.rack,
        row: location.row,
        bay: location.bay,
        side: location.side,
        serviceZone: location.serviceZone,
        physicalQty,
        frozenQty,
        availableQty,
        skuCount: skuSet.size,
        conditions: [...conditionSet],
        itemTypes: [...itemTypeSet],
        containerCount: containerSet.size,
        exceptionCount,
        primarySku: topBalance?.product?.sku,
        primaryModel: topBalance?.product?.model,
        state: deriveWarehouseLocationState({
          physicalQty,
          frozenQty,
          skuCount: skuSet.size,
          conditions: [...conditionSet],
          exceptionCount,
        }),
      };
    });

    const q = query.trim();
    let matchingLocationCodes: string[] = [];
    if (q) {
      const upper = q.toUpperCase();
      const direct = rows.filter((row) =>
        row.code.toUpperCase().includes(upper) ||
        row.primarySku?.toUpperCase().includes(upper) ||
        row.primaryModel?.toUpperCase().includes(upper),
      ).map((row) => row.code);
      const balanceMatches = await this.prisma.inventoryBalance.findMany({
        where: {
          warehouseId: warehouse.id,
          physicalQty: { gt: 0 },
          OR: [
            { product: { sku: { contains: q, mode: "insensitive" } } },
            { product: { model: { contains: q, mode: "insensitive" } } },
            { container: { code: { contains: q, mode: "insensitive" } } },
          ],
        },
        include: { location: true },
        take: 100,
      });
      const serialMatches = await this.prisma.serialNumber.findMany({
        where: {
          currentWarehouseId: warehouse.id,
          currentLocationId: { not: null },
          serialNumber: { startsWith: upper },
        },
        include: { currentLocation: true },
        take: 25,
      });
      matchingLocationCodes = [...new Set([
        ...direct,
        ...balanceMatches.map((balance) => balance.location.code),
        ...serialMatches.flatMap((serial) => serial.currentLocation?.code ? [serial.currentLocation.code] : []),
      ])];
    }

    const summary = {
      occupied: rows.filter((row) => row.state !== "Empty").length,
      empty: rows.filter((row) => row.state === "Empty").length,
      mixed: rows.filter((row) => row.state === "Mixed").length,
      repair: rows.filter((row) => row.state === "Repair").length,
      prepared: rows.filter((row) => row.frozenQty > 0).length,
    };
    return {
      warehouse: { code: warehouse.code, name: warehouse.name, timezone: warehouse.timezone },
      summary,
      locations: rows,
      matchingLocationCodes,
    };
  }

  async detail(warehouseCode: string, locationCode: string) {
    const location = await this.prisma.location.findFirst({
      where: { code: locationCode, warehouse: { code: warehouseCode }, active: true },
      include: {
        balances: {
          include: { product: true, container: true },
          orderBy: [{ product: { sku: "asc" } }, { condition: "asc" }],
        },
        warehouse: true,
      },
    });
    if (!location) return null;
    const [serialCount, movements, exceptions] = await Promise.all([
      this.prisma.serialNumber.count({
        where: { currentWarehouseId: location.warehouseId, currentLocationId: location.id },
      }),
      this.prisma.stockTransaction.findMany({
        where: {
          warehouseId: location.warehouseId,
          OR: [{ sourceLocationId: location.id }, { targetLocationId: location.id }],
        },
        include: { product: true, sourceLocation: true, targetLocation: true },
        orderBy: { effectiveAt: "desc" },
        take: 10,
      }),
      this.prisma.exception.findMany({
        where: { entityReference: location.code, status: { not: "Resolved" } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);
    return {
      location: {
        id: location.id,
        code: location.code,
        warehouseCode: location.warehouse.code,
        zone: location.zone,
        rack: location.rack,
        row: location.row,
        bay: location.bay,
        side: location.side,
        serviceZone: location.serviceZone,
      },
      inventory: location.balances.map((balance) => ({
        id: balance.id,
        sku: balance.product?.sku,
        model: balance.product?.model ?? "Unmonitored material",
        itemType: balance.itemType,
        condition: balance.condition,
        physicalQty: number(balance.physicalQty),
        frozenQty: number(balance.frozenQty),
        availableQty: number(balance.physicalQty.minus(balance.frozenQty)),
        containerCode: balance.container?.code,
      })),
      serialCount,
      exceptionCount: exceptions.length,
      movements: movements.map((movement) => ({
        id: movement.id,
        operation: movement.transactionType,
        sku: movement.product?.sku,
        quantity: number(movement.quantity),
        condition: movement.condition,
        fromLocation: movement.sourceLocation?.code,
        toLocation: movement.targetLocation?.code,
        businessReference: movement.businessReference,
        effectiveAt: movement.effectiveAt.toISOString(),
      })),
    };
  }
}
