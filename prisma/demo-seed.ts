import { PrismaClient } from "../generated/prisma/client";

export async function seedDemo(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.exception.deleteMany(),
    prisma.eRPSyncJob.deleteMany(),
    prisma.eRPDocument.deleteMany(),
    prisma.stockTransaction.deleteMany(),
    prisma.transferSerial.deleteMany(),
    prisma.transferOrderLine.deleteMany(),
    prisma.transferOrder.deleteMany(),
    prisma.repairReturn.deleteMany(),
    prisma.repairJob.deleteMany(),
    prisma.outboundAllocation.deleteMany(),
    prisma.outboundOrderLine.deleteMany(),
    prisma.outboundOrder.deleteMany(),
    prisma.pickupBatch.deleteMany(),
    prisma.operationalSnapshot.deleteMany(),
    prisma.repairWeeklyMetrics.deleteMany(),
    prisma.serialNumber.deleteMany(),
    prisma.inventoryBalance.deleteMany(),
    prisma.pickupSequence.deleteMany(),
    prisma.eRPWarehouseMapping.deleteMany(),
    prisma.container.deleteMany(),
    prisma.location.deleteMany(),
    prisma.product.deleteMany(),
    prisma.user.deleteMany(),
    prisma.role.deleteMany(),
    prisma.warehouse.deleteMany(),
  ]);

  const supervisorRole = await prisma.role.create({
    data: {
      name: "Warehouse_Supervisor",
      permissions: ["inventory:read", "warehouse:operate", "adjustment:create", "stocktake:approve"],
    },
  });
  await prisma.role.createMany({
    data: [
      { name: "Warehouse_Operator", permissions: ["inventory:read", "warehouse:operate"] },
      { name: "Admin", permissions: ["*"] },
      { name: "Viewer", permissions: ["inventory:read", "audit:read"] },
    ],
  });
  const user = await prisma.user.create({
    data: {
      email: "demo.supervisor@example.invalid",
      displayName: "Demo Supervisor",
      roleId: supervisorRole.id,
    },
  });

  const warehouseRows = await Promise.all(
    [
      ["SYD", "Sydney Service Warehouse", "Australia/Sydney"],
      ["MEL", "Melbourne Warehouse", "Australia/Melbourne"],
      ["BNE", "Brisbane Warehouse", "Australia/Brisbane"],
    ].map(([code, name, timezone]) => prisma.warehouse.create({ data: { code, name, timezone } })),
  );
  const warehouses = Object.fromEntries(warehouseRows.map((row) => [row.code, row]));

  const locationRows = await Promise.all(
    [
      ["SYD", "FLEX-01", "FLEX", true],
      ["SYD", "REPAIR-01", "REPAIR", true],
      ["SYD", "DISPATCH-01", "DISPATCH", true],
      ["SYD", "RETURN-01", "RETURN", true],
      ["SYD", "R1-4-2-L", "R1", false],
      ["SYD", "R1-4-2-R", "R1", false],
      ["SYD", "R2-1-4-R", "R2", false],
      ["SYD", "R1-4-3-L", "R1", false],
      ["MEL", "RECEIVING-01", "RECEIVING", true],
      ["MEL", "M1-1-1-L", "M1", false],
      ["BNE", "RECEIVING-01", "RECEIVING", true],
    ].map(([warehouseCode, code, zone, serviceZone]) =>
      prisma.location.create({
        data: {
          warehouseId: warehouses[String(warehouseCode)].id,
          code: String(code),
          zone: String(zone),
          serviceZone: Boolean(serviceZone),
        },
      }),
    ),
  );
  const locations = Object.fromEntries(
    locationRows.map((row) => [`${warehouseRows.find((warehouse) => warehouse.id === row.warehouseId)?.code}:${row.code}`, row]),
  );

  const productRows = await Promise.all(
    [
      ["97-223-00107-00", "EQ4800-S", "Product", "Battery", true],
      ["97-223-00108-00", "EQ4800-M", "Product", "Battery", true],
      ["97-229-00012-00", "CQ6-M", "Product", "Battery", true],
      ["97-229-00020-00", "CQ6-M", "Product", "Battery", true],
      ["97-229-00021-00", "CQ6-S", "Product", "Battery", true],
      ["30-137-12310-00", "H3-12.0-E", "Material", "Inverter", false],
      ["10-105-00346-00", "Battery service cable", "Material", "Cable/Connector", false],
      ["20-012-10219-08", "PCBA H1-G2 power board", "Material", "PCBA", false],
    ].map(([sku, model, itemType, category, serialTrackingRequired]) =>
      prisma.product.create({
        data: {
          sku: String(sku),
          model: String(model),
          itemType: itemType as "Product" | "Material",
          category: String(category),
          serialTrackingRequired: Boolean(serialTrackingRequired),
          reportMachine: itemType === "Product" || sku === "30-137-12310-00",
          reportGroup:
            itemType === "Product" || sku === "30-137-12310-00" ? String(category) : null,
        },
      }),
    ),
  );
  const products = Object.fromEntries(productRows.map((row) => [row.sku, row]));

  await prisma.eRPWarehouseMapping.createMany({
    data: [
      { warehouseId: warehouses.SYD.id, erpWarehouse: "Sydney Material Warehouse", condition: "New" },
      { warehouseId: warehouses.SYD.id, erpWarehouse: "Sydney Good Product Warehouse", condition: "Repair_Good" },
    ],
  });
  await prisma.pickupSequence.createMany({
    data: warehouseRows.map((warehouse) => ({
      warehouseId: warehouse.id,
      nextValue: warehouse.code === "SYD" ? 266 : 1,
    })),
  });

  const balances = await Promise.all([
    prisma.inventoryBalance.create({
      data: {
        warehouseId: warehouses.SYD.id,
        locationId: locations["SYD:FLEX-01"].id,
        productId: products["97-223-00107-00"].id,
        itemType: "Product",
        condition: "New",
        physicalQty: 32,
        frozenQty: 2,
      },
    }),
    prisma.inventoryBalance.create({
      data: {
        warehouseId: warehouses.SYD.id,
        locationId: locations["SYD:R2-1-4-R"].id,
        productId: products["97-223-00107-00"].id,
        itemType: "Product",
        condition: "New",
        physicalQty: 8,
      },
    }),
    prisma.inventoryBalance.create({
      data: {
        warehouseId: warehouses.SYD.id,
        locationId: locations["SYD:R1-4-2-L"].id,
        productId: products["10-105-00346-00"].id,
        itemType: "Material",
        condition: "Material",
        physicalQty: 30,
      },
    }),
    prisma.inventoryBalance.create({
      data: {
        warehouseId: warehouses.SYD.id,
        locationId: locations["SYD:FLEX-01"].id,
        productId: products["97-229-00012-00"].id,
        itemType: "Product",
        condition: "Repair_Good",
        physicalQty: 4,
      },
    }),
  ]);

  const outboundSerials = await Promise.all(
    ["SN-EQ4800-NEW-001", "SN-EQ4800-NEW-002", "SN-EQ4800-NEW-003"].map((serialNumber, index) =>
      prisma.serialNumber.create({
        data: {
          serialNumber,
          productId: products["97-223-00107-00"].id,
          currentWarehouseId: warehouses.SYD.id,
          currentLocationId: index < 2 ? locations["SYD:FLEX-01"].id : locations["SYD:R2-1-4-R"].id,
          condition: "New",
          status: "In_Stock",
        },
      }),
    ),
  );
  await prisma.serialNumber.create({
    data: {
      serialNumber: "SN-CQ6-REPAIR-GOOD-001",
      productId: products["97-229-00012-00"].id,
      currentWarehouseId: warehouses.SYD.id,
      currentLocationId: locations["SYD:FLEX-01"].id,
      condition: "Repair_Good",
      status: "In_Stock",
    },
  });
  await prisma.serialNumber.create({
    data: {
      serialNumber: "60E5M4805C3F242",
      productId: products["97-223-00107-00"].id,
      condition: "New",
      status: "Outbound",
      sourceDocument: "SH-2607-00165610",
    },
  });

  const seededPickup = await prisma.pickupBatch.create({
    data: {
      code: "SYD-00265",
      warehouseId: warehouses.SYD.id,
      readyAt: new Date("2026-07-27T23:00:00.000Z"),
      status: "Ready",
    },
  });
  const order = await prisma.outboundOrder.create({
    data: {
      shNo: "SH-2607-00175008",
      pickupCode: "SYD-00265",
      pickupBatchId: seededPickup.id,
      erpWarehouse: "Sydney Material Warehouse",
      warehouseId: warehouses.SYD.id,
      status: "Ready_for_Pickup",
      customerLabel: "Service replacement",
      allocatedAt: new Date("2026-07-27T22:30:00.000Z"),
      preparedAt: new Date("2026-07-27T22:45:00.000Z"),
      readyForPickupAt: new Date("2026-07-27T23:00:00.000Z"),
      lines: {
        create: {
          productId: products["97-223-00107-00"].id,
          requiredQty: 2,
          requiredCondition: "New",
          erpWarehouse: "Sydney Material Warehouse",
          allocatedQty: 2,
          preparedQty: 2,
        },
      },
    },
    include: { lines: true },
  });
  await prisma.outboundAllocation.create({
    data: {
      outboundOrderLineId: order.lines[0].id,
      locationId: locations["SYD:FLEX-01"].id,
      quantity: 2,
      preparedAt: new Date(),
    },
  });
  await prisma.stockTransaction.create({
    data: {
      transactionType: "Prepared",
      warehouseId: warehouses.SYD.id,
      sourceLocationId: locations["SYD:FLEX-01"].id,
      productId: products["97-223-00107-00"].id,
      itemType: "Product",
      condition: "New",
      quantity: 2,
      frozenDelta: 2,
      businessReference: order.shNo,
      operationId: "seed-prepared-sh-2607-00175008",
      remark: "Seeded prepared reservation; physical quantity unchanged.",
      createdById: user.id,
    },
  });
  await prisma.outboundOrder.create({
    data: {
      shNo: "SH-DEMO-PENDING-001",
      erpWarehouse: "Mixed ERP warehouses",
      warehouseId: warehouses.SYD.id,
      status: "Pending_Allocation",
      importedAt: new Date("2026-07-28T00:00:00.000Z"),
      customerLabel: "Imported Replacement Unit Information",
      lines: {
        create: [
          {
            productId: products["97-229-00020-00"].id,
            requiredQty: 1,
            requiredCondition: "New",
            erpWarehouse: "Sydney Material Warehouse",
          },
          {
            productId: products["97-229-00021-00"].id,
            requiredQty: 3,
            requiredCondition: "Repair_Good",
            erpWarehouse: "Sydney Good Product Warehouse",
          },
        ],
      },
    },
  });

  const transferSerial = outboundSerials[2];
  const transfer = await prisma.transferOrder.create({
    data: {
      transferNo: "TR-SYD-MEL-0001",
      sourceWarehouseId: warehouses.SYD.id,
      destinationWarehouseId: warehouses.MEL.id,
      status: "Draft",
      lines: {
        create: {
          productId: products["97-223-00107-00"].id,
          condition: "New",
          quantity: 1,
          serials: { create: { serialNumberId: transferSerial.id } },
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      operation: "Seeded PostgreSQL Preview",
      entityType: "OutboundOrder",
      entityId: order.id,
      businessReference: order.shNo,
      remark: "Authoritative database seed includes prepared stock, serials, transfer and master data.",
    },
  });
  await prisma.exception.create({
    data: {
      type: "Serial reconciliation preview",
      severity: "Low",
      entityReference: balances[0].id,
      message: "Preview aggregate balances intentionally include only a partial illustrative SN population.",
    },
  });
  await prisma.eRPDocument.create({
    data: {
      documentType: "OutboundOrder",
      externalNumber: order.shNo,
      payload: { source: "MockERPAdapter", shNo: order.shNo },
      outboundOrderId: order.id,
    },
  });
  await prisma.eRPSyncJob.create({
    data: {
      operationType: "Transfer",
      entityType: "TransferOrder",
      entityId: transfer.id,
      payload: { transferNo: transfer.transferNo },
      transferOrderId: transfer.id,
      status: "Pending",
    },
  });
}
