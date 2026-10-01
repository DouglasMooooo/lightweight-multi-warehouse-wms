import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const orders = await prisma.outboundOrder.findMany({
      where: {
        warehouse: { code: "SYD" },
        status: { in: ["Prepared", "Ready_for_Pickup"] },
      },
      include: {
        lines: {
          include: {
            product: true,
            allocations: {
              where: { dispatchedAt: null },
              include: { serialNumber: true, location: true },
            },
          },
        },
        erpDocuments: { select: { documentType: true, externalNumber: true } },
      },
      orderBy: { shNo: "asc" },
    });

    const rows = orders.flatMap((order) => order.lines.map((line) => {
      const serialRelations = line.allocations.filter((allocation) => allocation.serialNumberId);
      const assignedSerials = new Set(serialRelations.map((allocation) => allocation.serialNumberId));
      return {
        shNo: order.shNo,
        status: order.status,
        importedAt: order.importedAt?.toISOString() ?? null,
        customerLabel: order.customerLabel,
        erpDocumentCount: order.erpDocuments.length,
        sku: line.product.sku,
        serialTracked: line.product.serialTrackingRequired,
        requiredQty: Number(line.requiredQty),
        allocatedQty: Number(line.allocatedQty),
        preparedQty: Number(line.preparedQty),
        assignedSnCount: assignedSerials.size,
        serialRelationCount: serialRelations.length,
        assignedSerials: serialRelations.map((allocation) => allocation.serialNumber?.serialNumber),
        hasAggregateAllocation: line.allocations.some((allocation) => !allocation.serialNumberId),
        locations: [...new Set(line.allocations.map((allocation) => allocation.location.code))],
        legacyOrDemoWithoutSnEvidence:
          line.product.serialTrackingRequired &&
          assignedSerials.size < Number(line.requiredQty) &&
          (order.customerLabel === "Workbook migration evidence" || order.erpDocuments.length === 0),
      };
    }));

    console.log(JSON.stringify({
      orderCount: orders.length,
      serialTrackedLineCount: rows.filter((row) => row.serialTracked).length,
      incompleteSerialLineCount: rows.filter((row) =>
        row.serialTracked && row.assignedSnCount !== row.requiredQty,
      ).length,
      rows,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
