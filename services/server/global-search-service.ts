import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";

export class GlobalSearchService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async search(query: string, warehouseCode?: string) {
    const q = query.trim();
    if (q.length < 2) return { rows: [] };
    const upper = q.toUpperCase();
    const warehouseFilter = warehouseCode ? { code: warehouseCode } : undefined;
    const [serials, orders, products, locations] = await Promise.all([
      this.prisma.serialNumber.findMany({
        where: {
          serialNumber: { startsWith: upper },
          currentWarehouse: warehouseFilter,
        },
        include: { product: true, currentLocation: true },
        take: 6,
      }),
      this.prisma.outboundOrder.findMany({
        where: {
          OR: [
            { shNo: { contains: q, mode: "insensitive" } },
            { pickupCode: { contains: q, mode: "insensitive" } },
          ],
          warehouse: warehouseFilter,
        },
        take: 6,
      }),
      this.prisma.product.findMany({
        where: {
          active: true,
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 6,
      }),
      this.prisma.location.findMany({
        where: {
          active: true,
          code: { contains: q, mode: "insensitive" },
          warehouse: warehouseFilter,
        },
        include: { warehouse: true },
        take: 6,
      }),
    ]);
    return {
      rows: [
        ...serials.map((row) => ({
          type: "SN",
          primary: row.serialNumber,
          secondary: `${row.product.sku} · ${row.currentLocation?.code ?? "—"}`,
          href: `/sn-search?query=${encodeURIComponent(row.serialNumber)}`,
        })),
        ...orders.map((row) => ({
          type: "SH",
          primary: row.shNo,
          secondary: `${row.status} · ${row.pickupCode ?? "—"}`,
          href: `/outbound/${row.id}`,
        })),
        ...products.map((row) => ({
          type: "SKU",
          primary: row.sku,
          secondary: row.model,
          href: `/reports/inventory?q=${encodeURIComponent(row.sku)}`,
        })),
        ...locations.map((row) => ({
          type: "Location",
          primary: row.code,
          secondary: `${row.warehouse.code} · ${row.zone}`,
          href: `/warehouse-map?q=${encodeURIComponent(row.code)}`,
        })),
      ].slice(0, 18),
    };
  }
}
