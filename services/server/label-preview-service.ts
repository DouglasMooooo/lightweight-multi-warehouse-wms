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
}
