import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  aggregateInventoryReport,
  applyInventoryReportFilters,
  buildInventoryReportCsv,
  sortInventoryReportRows,
  type InventoryReportAggregateInput,
  type InventoryReportRow,
} from "@/domain/inventory-report";
import type { ItemType, StockCondition } from "@/domain/types";
import { PHYSICALLY_PRESENT_SERIAL_STATUSES } from "@/domain/serial-policy";
import { getPrisma } from "@/lib/prisma";

const number = (value: Prisma.Decimal | null | undefined) => value?.toNumber() ?? 0;
const pageBounds = (page = 1, pageSize = 50) => ({
  page: Math.max(1, Math.trunc(page) || 1),
  pageSize: Math.min(250, Math.max(1, Math.trunc(pageSize) || 50)),
});

export interface InventoryReportQuery {
  page?: number;
  pageSize?: number;
  warehouse?: string;
  query?: string;
  itemType?: ItemType | "All";
  condition?: StockCondition;
  location?: string;
  availableOnly?: boolean;
  frozenOnly?: boolean;
  legacyOnly?: boolean;
  sort?: "sku" | "physical" | "available" | "frozen" | "inTransit";
  order?: "asc" | "desc";
}

export class InventoryReportService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  private where(input: InventoryReportQuery): Prisma.InventoryBalanceWhereInput {
    const query = input.query?.trim();
    return {
      productId: { not: null },
      warehouse: input.warehouse ? { code: input.warehouse } : undefined,
      location: input.location
        ? { code: { contains: input.location.trim(), mode: "insensitive" } }
        : undefined,
      itemType: input.itemType && input.itemType !== "All" ? input.itemType : undefined,
      condition: input.condition,
      legacySerialGap: input.legacyOnly ? true : undefined,
      product: query
        ? {
            OR: [
              { sku: { contains: query, mode: "insensitive" } },
              { model: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      OR: [
        { physicalQty: { not: 0 } },
        { frozenQty: { not: 0 } },
        { inTransitQty: { not: 0 } },
      ],
    };
  }

  private async aggregate(input: InventoryReportQuery) {
    const groups = await this.prisma.inventoryBalance.groupBy({
      by: ["warehouseId", "productId", "locationId", "itemType", "condition", "legacySerialGap"],
      where: this.where(input),
      _sum: { physicalQty: true, frozenQty: true, inTransitQty: true },
    });
    const productIds = [...new Set(groups.flatMap((row) => row.productId ? [row.productId] : []))];
    const warehouseIds = [...new Set(groups.map((row) => row.warehouseId))];
    const [products, warehouses] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } } }),
      this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } }),
    ]);
    const productById = new Map(products.map((row) => [row.id, row]));
    const warehouseById = new Map(warehouses.map((row) => [row.id, row]));
    const inputs: InventoryReportAggregateInput[] = groups.flatMap((row) => {
      if (!row.productId) return [];
      const product = productById.get(row.productId);
      const warehouse = warehouseById.get(row.warehouseId);
      if (!product || !warehouse) return [];
      return [{
        warehouseCode: warehouse.code,
        productId: product.id,
        sku: product.sku,
        model: product.model,
        itemType: row.itemType as ItemType,
        serialTrackingRequired: product.serialTrackingRequired,
        condition: row.condition as StockCondition,
        locationId: row.locationId,
        physicalQty: number(row._sum.physicalQty),
        frozenQty: number(row._sum.frozenQty),
        inTransitQty: number(row._sum.inTransitQty),
        legacySerialGap: row.legacySerialGap,
      }];
    });
    return applyInventoryReportFilters(aggregateInventoryReport(inputs), {
      query: input.query,
      itemType: input.itemType,
      availableOnly: input.availableOnly,
      frozenOnly: input.frozenOnly,
      legacyOnly: input.legacyOnly,
    });
  }

  private async serialCounts(rows: InventoryReportRow[], condition?: StockCondition) {
    if (!rows.length) return new Map<string, number>();
    const pairs = rows.map((row) => ({
      productId: row.productId,
      currentWarehouse: { code: row.warehouseCode },
    }));
    const groups = await this.prisma.serialNumber.groupBy({
      by: ["productId", "currentWarehouseId"],
      where: {
        OR: pairs,
        status: { in: [...PHYSICALLY_PRESENT_SERIAL_STATUSES] },
        condition,
        currentWarehouseId: { not: null },
      },
      _count: { _all: true },
    });
    const warehouseIds = [...new Set(groups.flatMap((row) => row.currentWarehouseId ? [row.currentWarehouseId] : []))];
    const warehouses = await this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } });
    const warehouseById = new Map(warehouses.map((row) => [row.id, row.code]));
    return new Map(groups.flatMap((row) => {
      const code = row.currentWarehouseId ? warehouseById.get(row.currentWarehouseId) : undefined;
      return code ? [[`${code}:${row.productId}`, row._count._all] as const] : [];
    }));
  }

  async report(input: InventoryReportQuery, exportAll = false) {
    const allRows = sortInventoryReportRows(
      await this.aggregate(input),
      input.sort ?? "physical",
      input.order ?? "desc",
    );
    const summary = allRows.reduce((result, row) => ({
      physicalQty: result.physicalQty + row.physicalQty,
      availableQty: result.availableQty + row.availableQty,
      frozenQty: result.frozenQty + row.frozenQty,
      inTransitQty: result.inTransitQty + row.inTransitQty,
      newQty: result.newQty + row.newQty,
      repairGoodQty: result.repairGoodQty + row.repairGoodQty,
      repairQty: result.repairQty + row.repairQty,
    }), {
      physicalQty: 0, availableQty: 0, frozenQty: 0, inTransitQty: 0,
      newQty: 0, repairGoodQty: 0, repairQty: 0,
    });
    const bounds = pageBounds(input.page, input.pageSize);
    const pageRows = exportAll
      ? allRows.slice(0, 10_000)
      : allRows.slice((bounds.page - 1) * bounds.pageSize, bounds.page * bounds.pageSize);
    const serialCounts = await this.serialCounts(pageRows, input.condition);
    const rows = pageRows.map((row) => {
      const knownSerialCount = serialCounts.get(`${row.warehouseCode}:${row.productId}`) ?? 0;
      return {
        ...row,
        knownSerialCount,
        serialCoverageGap: row.serialTrackingRequired ? Math.max(0, row.physicalQty - knownSerialCount) : 0,
      };
    });
    return {
      page: bounds.page,
      pageSize: bounds.pageSize,
      total: allRows.length,
      totalPages: Math.max(1, Math.ceil(allRows.length / bounds.pageSize)),
      summary,
      rows,
    };
  }

  async csv(input: InventoryReportQuery) {
    const result = await this.report(input, true);
    return buildInventoryReportCsv(result.rows);
  }

  async locations(sku: string, warehouseCode: string, condition?: StockCondition) {
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findUnique({ where: { sku } }),
      this.prisma.warehouse.findUnique({ where: { code: warehouseCode } }),
    ]);
    if (!product || !warehouse) return null;
    const groups = await this.prisma.inventoryBalance.groupBy({
      by: ["locationId", "condition", "itemType", "legacySerialGap"],
      where: {
        productId: product.id,
        warehouseId: warehouse.id,
        condition,
        OR: [
          { physicalQty: { not: 0 } },
          { frozenQty: { not: 0 } },
          { inTransitQty: { not: 0 } },
        ],
      },
      _sum: { physicalQty: true, frozenQty: true, inTransitQty: true },
    });
    const locationIds = [...new Set(groups.map((row) => row.locationId))];
    const [locations, serialGroups] = await Promise.all([
      this.prisma.location.findMany({ where: { id: { in: locationIds } } }),
      this.prisma.serialNumber.groupBy({
        by: ["currentLocationId"],
        where: {
          productId: product.id,
          currentWarehouseId: warehouse.id,
          currentLocationId: { in: locationIds },
          status: { in: [...PHYSICALLY_PRESENT_SERIAL_STATUSES] },
          condition,
        },
        _count: { _all: true },
      }),
    ]);
    const locationById = new Map(locations.map((row) => [row.id, row]));
    const serialsByLocation = new Map(serialGroups.flatMap((row) =>
      row.currentLocationId ? [[row.currentLocationId, row._count._all] as const] : []
    ));
    const aggregateInputs: InventoryReportAggregateInput[] = groups.map((row) => ({
      warehouseCode,
      productId: product.id,
      sku: product.sku,
      model: product.model,
      itemType: row.itemType as ItemType,
      serialTrackingRequired: product.serialTrackingRequired,
      condition: row.condition as StockCondition,
      locationId: row.locationId,
      physicalQty: number(row._sum.physicalQty),
      frozenQty: number(row._sum.frozenQty),
      inTransitQty: number(row._sum.inTransitQty),
      legacySerialGap: row.legacySerialGap,
    }));
    const total = aggregateInventoryReport(aggregateInputs)[0] ?? {
      warehouseCode, productId: product.id, sku: product.sku, model: product.model,
      itemType: product.itemType as ItemType, serialTrackingRequired: product.serialTrackingRequired,
      physicalQty: 0, frozenQty: 0, availableQty: 0,
      inTransitQty: 0, newQty: 0, repairGoodQty: 0, repairQty: 0, scrapQty: 0,
      materialQty: 0, locationCount: 0, knownSerialCount: 0, legacySerialGap: false,
      serialCoverageGap: 0,
    };
    const knownSerialCount = [...serialsByLocation.values()].reduce((sum, count) => sum + count, 0);
    const locationRows = locationIds.map((locationId) => {
      const location = locationById.get(locationId);
      const row = aggregateInventoryReport(
        aggregateInputs.filter((candidate) => candidate.locationId === locationId),
      )[0];
      return row && location ? {
        locationCode: location.code,
        zone: location.zone,
        physicalQty: row.physicalQty,
        frozenQty: row.frozenQty,
        availableQty: row.availableQty,
        inTransitQty: row.inTransitQty,
        newQty: row.newQty,
        repairGoodQty: row.repairGoodQty,
        repairQty: row.repairQty,
        scrapQty: row.scrapQty,
        knownSerialCount: serialsByLocation.get(locationId) ?? 0,
        legacySerialGap: row.legacySerialGap,
      } : null;
    }).filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.physicalQty - a.physicalQty || a.locationCode.localeCompare(b.locationCode));
    return {
      product: {
        sku: product.sku,
        model: product.model,
        itemType: product.itemType,
        serialTrackingRequired: product.serialTrackingRequired,
      },
      warehouse: { code: warehouse.code, name: warehouse.name },
      totals: {
        ...total,
        knownSerialCount,
        serialCoverageGap: product.serialTrackingRequired ? Math.max(0, total.physicalQty - knownSerialCount) : 0,
      },
      locations: locationRows,
    };
  }
}
