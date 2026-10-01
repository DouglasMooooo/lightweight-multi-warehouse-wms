import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import {
  calculateOperationalKpis,
  calendarMonth,
  mondayToSunday,
  operationalMovementMetrics,
  operationalOrderMetrics,
  reconstructClosingPhysicalByCondition,
} from "@/domain/reporting";
import { getPrisma } from "@/lib/prisma";

export class OperationalReportingService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async weekly(warehouseId: string, containing: Date) {
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    const period = mondayToSunday(containing, warehouse.timezone);
    return this.period(warehouseId, period.from, period.to);
  }

  async monthly(warehouseId: string, year: number, zeroBasedMonth: number) {
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    const period = calendarMonth(year, zeroBasedMonth, warehouse.timezone);
    return this.period(warehouseId, period.from, period.to);
  }

  async reports(input: {
    mode: "Weekly" | "Monthly";
    warehouseCode: string;
    containing: Date;
  }) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        active: true,
        code: input.warehouseCode === "ALL" ? undefined : input.warehouseCode,
      },
      orderBy: { code: "asc" },
    });
    if (!warehouses.length)
      throw new DomainError("No active warehouse matches this report filter.", "WAREHOUSE_NOT_FOUND");
    const reports = await Promise.all(warehouses.map((warehouse) =>
      input.mode === "Weekly"
        ? this.weekly(warehouse.id, input.containing)
        : this.monthly(
            warehouse.id,
            input.containing.getUTCFullYear(),
            input.containing.getUTCMonth(),
          ),
    ));
    return { mode: input.mode, warehouseFilter: input.warehouseCode, reports };
  }

  async period(warehouseId: string, from: Date, to: Date) {
    const [
      warehouse,
      orders,
      returns,
      repairJobs,
      balances,
      movements,
      postPeriodDeltas,
      openingBaselineBeforePeriod,
      postPeriodConditionMovements,
      openExceptions,
    ] = await Promise.all([
      this.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } }),
      this.prisma.outboundOrder.findMany({
        where: {
          warehouseId,
          OR: [
            { preparedAt: { gte: from, lte: to } },
            { outboundAt: { gte: from, lte: to } },
            { outboundAt: { not: null } },
          ],
        },
        include: { lines: { include: { product: true } } },
      }),
      this.prisma.repairReturn.findMany({
        where: { location: { warehouseId } },
      }),
      this.prisma.repairJob.findMany({
        where: {
          warehouseId,
          OR: [
            { receivedAt: { gte: from, lte: to } },
            { repairCompletedAt: { gte: from, lte: to } },
            { status: { in: ["Received", "Pending_Repair", "In_Repair", "Repair_Completed"] } },
          ],
        },
      }),
      this.prisma.inventoryBalance.findMany({ where: { warehouseId } }),
      this.prisma.stockTransaction.findMany({
        where: { warehouseId, effectiveAt: { gte: from, lte: to } },
      }),
      this.prisma.stockTransaction.aggregate({
        where: { warehouseId, effectiveAt: { gt: to } },
        _sum: { physicalDelta: true, frozenDelta: true, inTransitDelta: true },
      }),
      this.prisma.stockTransaction.count({
        where: { warehouseId, transactionType: "Opening", effectiveAt: { lte: from } },
      }),
      this.prisma.stockTransaction.findMany({
        where: { warehouseId, effectiveAt: { gt: to } },
        select: {
          transactionType: true,
          condition: true,
          sourceCondition: true,
          targetCondition: true,
          quantity: true,
          physicalDelta: true,
        },
      }),
      this.prisma.exception.count({ where: { warehouseId, status: { not: "Resolved" } } }),
    ]);
    const outbound = operationalOrderMetrics(
      orders.map((order) => ({
        shNo: order.shNo,
        preparedAt: order.preparedAt?.toISOString(),
        outboundAt: order.outboundAt?.toISOString(),
        lines: order.lines.map((line) => ({
          model: line.product.model,
          reportMachine: line.product.reportMachine,
          reportGroup: line.product.reportGroup ?? undefined,
          quantity: Number(line.requiredQty),
        })),
      })),
      returns.map((row) => ({
        relatedShNo: row.relatedShNo ?? undefined,
        receivedAt: row.receivedAt.toISOString(),
      })),
      from,
      to,
    );
    const movement = operationalMovementMetrics(
      movements.map((row) => ({
        transactionType: row.transactionType,
        condition: row.condition,
        quantity: Number(row.quantity),
        effectiveAt: row.effectiveAt.toISOString(),
      })),
      from,
      to,
    );
    const currentPhysicalByCondition = Object.fromEntries(
      ["New", "Repair_Good", "Repair", "Scrap", "Material"].map((condition) => [
        condition,
        balances
          .filter((row) => row.condition === condition)
          .reduce((sum, row) => sum + Number(row.physicalQty), 0),
      ]),
    );
    const currentPhysical = balances.reduce((sum, row) => sum + Number(row.physicalQty), 0);
    const currentFrozen = balances.reduce((sum, row) => sum + Number(row.frozenQty), 0);
    const currentInTransit = balances.reduce((sum, row) => sum + Number(row.inTransitQty), 0);
    const closingPhysical = currentPhysical - Number(postPeriodDeltas._sum.physicalDelta ?? 0);
    const closingFrozen = currentFrozen - Number(postPeriodDeltas._sum.frozenDelta ?? 0);
    const closingInTransit = currentInTransit - Number(postPeriodDeltas._sum.inTransitDelta ?? 0);
    const periodPhysicalDelta = movements.reduce((sum, row) => sum + Number(row.physicalDelta), 0);
    const openingPhysical = closingPhysical - periodPhysicalDelta;
    const historyAvailable = openingBaselineBeforePeriod > 0;
    const closingPhysicalByCondition = historyAvailable
      ? reconstructClosingPhysicalByCondition(
          currentPhysicalByCondition,
          postPeriodConditionMovements.map((row) => ({
            transactionType: row.transactionType,
            condition: row.condition,
            sourceCondition: row.sourceCondition,
            targetCondition: row.targetCondition,
            quantity: Number(row.quantity),
            physicalDelta: Number(row.physicalDelta),
          })),
        )
      : undefined;
    const periodDays = Math.max(1, Math.round((to.getTime() - from.getTime() + 1) / 86_400_000));
    const kpis = calculateOperationalKpis({
      openingPhysical: historyAvailable ? openingPhysical : undefined,
      closingPhysical: historyAvailable ? closingPhysical : undefined,
      outboundQty: movement.outboundQty,
      periodDays,
      floorAreaSqm: warehouse.floorAreaSqm ? Number(warehouse.floorAreaSqm) : undefined,
    });
    return {
      warehouse: {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        timezone: warehouse.timezone,
        floorAreaSqm: warehouse.floorAreaSqm ? Number(warehouse.floorAreaSqm) : undefined,
        operationalAreaSqm: warehouse.operationalAreaSqm ? Number(warehouse.operationalAreaSqm) : undefined,
      },
      period: { from: from.toISOString(), to: to.toISOString() },
      ...outbound,
      ...movement,
      afterSalesReturns: movement.faultyReturns,
      repairScrap: repairJobs.filter(
        (row) =>
          row.outcome === "Scrap" &&
          row.repairCompletedAt &&
          row.repairCompletedAt >= from &&
          row.repairCompletedAt <= to,
      ).length,
      pendingRepair: repairJobs.filter((row) =>
        ["Received", "Pending_Repair", "In_Repair"].includes(row.status),
      ).length,
      repairInventory: closingPhysicalByCondition?.Repair,
      newInventory: closingPhysicalByCondition?.New,
      repairGoodInventory: closingPhysicalByCondition?.Repair_Good,
      openingPhysical: historyAvailable ? openingPhysical : undefined,
      closingPhysical: historyAvailable ? closingPhysical : undefined,
      averagePhysical: kpis.averagePhysical,
      frozenAwaitingPickup: historyAvailable ? closingFrozen : undefined,
      inTransit: historyAvailable ? closingInTransit : undefined,
      physicalByCondition: closingPhysicalByCondition,
      operationalTurnover: kpis.operationalTurnover,
      inventoryDays: kpis.inventoryDays,
      outboundDensity: kpis.outboundDensity,
      inventoryDensity: kpis.inventoryDensity,
      areaConfigured: kpis.areaConfigured,
      historyAvailable,
      historyUnavailableReason: historyAvailable ? undefined : "HISTORICAL_BASELINE_INSUFFICIENT",
      openOperationalExceptions: openExceptions,
    };
  }

  async confirmSnapshot(input: {
    periodType: "Weekly" | "Monthly";
    periodStart: Date;
    periodEnd: Date;
    warehouseId: string;
    confirmedBy: string;
    metrics: Record<string, unknown>;
  }) {
    const existing = await this.prisma.operationalSnapshot.findUnique({
      where: {
        periodType_periodStart_periodEnd_warehouseId: {
          periodType: input.periodType,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          warehouseId: input.warehouseId,
        },
      },
    });
    if (existing)
      throw new DomainError("A confirmed operational snapshot is immutable and already exists for this period.");
    return this.prisma.operationalSnapshot.create({
      data: {
        ...input,
        metrics: input.metrics as Prisma.InputJsonValue,
        confirmedAt: new Date(),
      },
    });
  }
}
