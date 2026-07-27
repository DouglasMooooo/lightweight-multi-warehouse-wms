import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed the WMS database.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const supervisorRole = await prisma.role.upsert({
    where: { name: "Warehouse_Supervisor" },
    update: {},
    create: {
      name: "Warehouse_Supervisor",
      permissions: ["inventory:read", "warehouse:operate", "adjustment:create", "stocktake:approve"],
    },
  });
  for (const role of [
    ["Warehouse_Operator", ["inventory:read", "warehouse:operate"]],
    ["Admin", ["*"]],
    ["Viewer", ["inventory:read", "audit:read"]],
  ] as const) {
    await prisma.role.upsert({
      where: { name: role[0] },
      update: {},
      create: { name: role[0], permissions: [...role[1]] },
    });
  }
  const user = await prisma.user.upsert({
    where: { email: "demo.supervisor@example.invalid" },
    update: {},
    create: {
      email: "demo.supervisor@example.invalid",
      displayName: "Demo Supervisor",
      roleId: supervisorRole.id,
    },
  });

  const warehouses = await Promise.all(
    [
      ["SYD", "Sydney Service Warehouse", "Australia/Sydney"],
      ["MEL", "Melbourne Warehouse", "Australia/Melbourne"],
      ["BNE", "Brisbane Warehouse", "Australia/Brisbane"],
    ].map(([code, name, timezone]) =>
      prisma.warehouse.upsert({
        where: { code },
        update: { name, timezone, active: true },
        create: { code, name, timezone },
      }),
    ),
  );
  const byCode = Object.fromEntries(warehouses.map((row) => [row.code, row]));

  const locations = [
    ["SYD", "FLEX-01", "FLEX", true],
    ["SYD", "REPAIR-01", "REPAIR", true],
    ["SYD", "DISPATCH-01", "DISPATCH", true],
    ["SYD", "RETURN-01", "RETURN", true],
    ["SYD", "R1-4-2-L", "R1", false],
    ["SYD", "R1-4-2-R", "R1", false],
    ["SYD", "R1-3-2-L", "R1", false],
    ["SYD", "R1-3-2-R", "R1", false],
    ["SYD", "R2-1-4-R", "R2", false],
    ["SYD", "R2-3-5-L", "R2", false],
    ["SYD", "R1-4-3-L", "R1", false],
    ["MEL", "RECEIVING-01", "RECEIVING", true],
    ["MEL", "M1-1-1-L", "M1", false],
    ["BNE", "RECEIVING-01", "RECEIVING", true],
  ] as const;
  for (const [warehouseCode, code, zone, serviceZone] of locations) {
    await prisma.location.upsert({
      where: { warehouseId_code: { warehouseId: byCode[warehouseCode].id, code } },
      update: { zone, serviceZone, active: true },
      create: { warehouseId: byCode[warehouseCode].id, code, zone, serviceZone },
    });
  }

  const products = [
    ["97-223-00107-00", "EQ4800-S", "Product", "Battery", true],
    ["97-223-00108-00", "EQ4800-M", "Product", "Battery", true],
    ["97-229-00020-00", "CQ6-M", "Product", "Battery", true],
    ["97-229-00018-00", "CQ6-S", "Product", "Battery", true],
    ["97-229-00012-00", "CQ6-M", "Product", "Battery", true],
    ["10-105-00346-00", "Battery service cable", "Material", "Cable/Connector", false],
    ["20-012-10219-08", "PCBA H1-G2 3–6kW power board", "Material", "PCBA", false],
    ["97-406-00017-00", "KH cable cover", "Material", "Inverter", false],
  ] as const;
  for (const [sku, model, itemType, category, serialTrackingRequired] of products) {
    await prisma.product.upsert({
      where: { sku },
      update: { model, itemType, category, serialTrackingRequired, active: true },
      create: { sku, model, itemType, category, serialTrackingRequired },
    });
  }

  await prisma.pickupSequence.upsert({
    where: { warehouseId: byCode.SYD.id },
    update: {},
    create: { warehouseId: byCode.SYD.id, nextValue: 266 },
  });
  await prisma.eRPWarehouseMapping.upsert({
    where: { warehouseId_erpWarehouse: { warehouseId: byCode.SYD.id, erpWarehouse: "悉尼物料仓" } },
    update: { condition: "New", active: true },
    create: { warehouseId: byCode.SYD.id, erpWarehouse: "悉尼物料仓", condition: "New" },
  });
  await prisma.eRPWarehouseMapping.upsert({
    where: { warehouseId_erpWarehouse: { warehouseId: byCode.SYD.id, erpWarehouse: "悉尼良品仓" } },
    update: { condition: "Repair_Good", active: true },
    create: { warehouseId: byCode.SYD.id, erpWarehouse: "悉尼良品仓", condition: "Repair_Good" },
  });

  const location = await prisma.location.findUniqueOrThrow({
    where: { warehouseId_code: { warehouseId: byCode.SYD.id, code: "FLEX-01" } },
  });
  const product = await prisma.product.findUniqueOrThrow({ where: { sku: "97-223-00107-00" } });
  const existingBalance = await prisma.inventoryBalance.findFirst({
    where: {
      warehouseId: byCode.SYD.id,
      locationId: location.id,
      productId: product.id,
      containerId: null,
      condition: "New",
    },
  });
  if (!existingBalance) {
    await prisma.inventoryBalance.create({
      data: {
        warehouseId: byCode.SYD.id,
        locationId: location.id,
        productId: product.id,
        itemType: "Product",
        condition: "New",
        physicalQty: 32,
        frozenQty: 2,
      },
    });
  }
  const order = await prisma.outboundOrder.upsert({
    where: { shNo: "SH-2607-00175008" },
    update: {},
    create: {
      shNo: "SH-2607-00175008",
      pickupCode: "SYD-00265",
      erpWarehouse: "悉尼物料仓",
      warehouseId: byCode.SYD.id,
      status: "Ready_for_Pickup",
      customerLabel: "Service replacement",
    },
  });
  const existingLine = await prisma.outboundOrderLine.findFirst({
    where: { outboundOrderId: order.id, productId: product.id },
  });
  if (!existingLine) {
    await prisma.outboundOrderLine.create({
      data: {
        outboundOrderId: order.id,
        productId: product.id,
        requiredQty: 2,
        requiredCondition: "New",
        allocatedQty: 2,
        preparedQty: 2,
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      operation: "Seeded Preview data",
      entityType: "OutboundOrder",
      entityId: order.id,
      businessReference: order.shNo,
      remark: "Idempotent demo seed verified.",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
