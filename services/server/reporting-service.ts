import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/domain/errors";
import {
  calendarMonth,
  mondayToSunday,
  operationalMovementMetrics,
  operationalOrderMetrics,
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

  async period(warehouseId: string, from: Date, to: Date) {
    const [orders, returns, repairJobs, balances, movements, openExceptions] = await Promise.all([
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
      this.prisma.exception.count({ where: { status: { not: "Resolved" } } }),
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
    const repairInventory = balances
      .filter((row) => row.condition === "Repair")
      .reduce((sum, row) => sum + Number(row.physicalQty), 0);
    const newInventory = balances
      .filter((row) => row.condition === "New")
      .reduce((sum, row) => sum + Number(row.physicalQty), 0);
    return {
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
      repairInventory,
      newInventory,
      repairGoodInventory: balances
        .filter((row) => row.condition === "Repair_Good")
        .reduce((sum, row) => sum + Number(row.physicalQty), 0),
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
