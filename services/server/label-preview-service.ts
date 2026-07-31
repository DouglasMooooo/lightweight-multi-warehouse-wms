import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { buildPickupBatchLabels, buildUnitSNLabels } from "@/domain/label-policy";
import { getPrisma } from "@/lib/prisma";

export class LabelPreviewService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async preview(orderId: string, mode: "BATCH_LABEL" | "UNIT_SN_LABEL") {
    const selected = await this.prisma.outboundOrder.findUnique({
      where: { id: orderId },
      select: { id: true, shNo: true, pickupCode: true },
    });
    if (!selected) return null;
    const orders = await this.prisma.outboundOrder.findMany({
      where: selected.pickupCode ? { pickupCode: selected.pickupCode } : { id: selected.id },
      include: {
        lines: {
          include: {
            product: true,
            allocations: { include: { serialNumber: true } },
          },
        },
      },
      orderBy: { shNo: "asc" },
    });
    if (mode === "UNIT_SN_LABEL") {
      return {
        mode,
        labels: buildUnitSNLabels(orders.flatMap((order) =>
          order.lines.flatMap((line) =>
            line.allocations.flatMap((allocation) => allocation.serialNumber ? [{
              shNo: order.shNo,
              pickupCode: order.pickupCode ?? undefined,
              serialNumber: allocation.serialNumber.serialNumber,
              sku: line.product.sku,
              model: line.product.model,
              erpWarehouse: line.erpWarehouse,
            }] : []),
          ),
        )),
      };
    }
    return {
      mode,
      labels: buildPickupBatchLabels(orders.map((order) => ({
        shNo: order.shNo,
        pickupCode: order.pickupCode ?? undefined,
        lines: order.lines.map((line) => ({
          sku: line.product.sku,
          model: line.product.model,
          erpWarehouse: line.erpWarehouse,
          qty: Number(line.requiredQty),
        })),
      }))),
    };
  }

  async previewBatch(orderIds: string[]) {
    const selectedIds = [...new Set(orderIds.map((value) => value.trim()).filter(Boolean))];
    if (!selectedIds.length)
      return {
        labelBatch: { mode: "BATCH_LABEL" as const, orderIds: [] },
        labels: [],
        validation: { valid: false, errors: ["Select at least one outbound order."] },
        totals: { selectedOrders: 0, pickupCodes: 0, labelPages: 0, totalUnits: 0 },
      };
    const orders = await this.prisma.outboundOrder.findMany({
      where: { id: { in: selectedIds } },
      include: {
        warehouse: { select: { code: true } },
        lines: { include: { product: true } },
      },
      orderBy: { shNo: "asc" },
    });
    const foundIds = new Set(orders.map((order) => order.id));
    const missing = selectedIds.filter((id) => !foundIds.has(id));
    const ineligible = orders
      .filter((order) => !["Prepared", "Ready_for_Pickup"].includes(order.status))
      .map((order) => order.shNo);
    const warehouses = [...new Set(orders.map((order) => order.warehouse.code))];
    const errors = [
      ...(missing.length ? [`${missing.length} selected order(s) no longer exist.`] : []),
      ...(ineligible.length ? [`Awaiting Pickup is required: ${ineligible.join(", ")}.`] : []),
      ...(warehouses.length > 1 ? ["A label batch cannot mix physical warehouses."] : []),
    ];
    const labels = errors.length
      ? []
      : buildPickupBatchLabels(orders.map((order) => ({
          shNo: order.shNo,
          pickupCode: order.pickupCode ?? undefined,
          lines: order.lines.map((line) => ({
            sku: line.product.sku,
            model: line.product.model,
            erpWarehouse: line.erpWarehouse,
            qty: Number(line.requiredQty),
          })),
        })));
    return {
      labelBatch: {
        mode: "BATCH_LABEL" as const,
        warehouse: warehouses[0],
        orderIds: selectedIds,
        shNos: orders.map((order) => order.shNo),
      },
      labels,
      validation: { valid: errors.length === 0, errors },
      totals: {
        selectedOrders: orders.length,
        pickupCodes: labels.length,
        labelPages: labels.reduce((sum, label) => sum + label.pageCount, 0),
        totalUnits: labels.reduce((sum, label) => sum + label.totalQty, 0),
      },
    };
  }
}
