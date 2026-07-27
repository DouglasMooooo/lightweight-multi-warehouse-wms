-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('Product', 'Material');

-- CreateEnum
CREATE TYPE "StockCondition" AS ENUM ('New', 'Repair_Good', 'Repair', 'Scrap', 'Material');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('Opening', 'Inbound', 'Outbound', 'Prepared', 'Move', 'Adjustment_In', 'Adjustment_Out', 'Return_to_Repair', 'Transfer_Out', 'Transfer_In');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('In_Stock', 'Prepared', 'Outbound', 'In_Transit', 'Repair', 'Scrapped');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('Draft', 'Ready', 'Prepared', 'Partially_Prepared', 'Ready_for_Pickup', 'Outbound', 'Cancelled', 'Exception');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('Draft', 'Prepared', 'Dispatched', 'In_Transit', 'Partially_Received', 'Received', 'Cancelled', 'Exception');

-- CreateEnum
CREATE TYPE "ERPStatus" AS ENUM ('Pending', 'Synced', 'Failed', 'Retrying', 'Manual_Review');

-- CreateEnum
CREATE TYPE "ExceptionSeverity" AS ENUM ('Low', 'Medium', 'High', 'Critical');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('Open', 'Investigating', 'Resolved');

-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('Draft', 'Counting', 'Review', 'Approved', 'Posted', 'Cancelled');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "rack" TEXT,
    "row" INTEGER,
    "bay" INTEGER,
    "side" TEXT,
    "serviceZone" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "category" TEXT,
    "serialTrackingRequired" BOOLEAN NOT NULL DEFAULT false,
    "reportCategory" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "containerId" TEXT,
    "productId" TEXT,
    "itemType" "ItemType" NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "physicalQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "frozenQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "inTransitQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "transactionType" "StockTransactionType" NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "sourceLocationId" TEXT,
    "targetLocationId" TEXT,
    "containerId" TEXT,
    "productId" TEXT,
    "serialNumberId" TEXT,
    "itemType" "ItemType" NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "physicalDelta" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "frozenDelta" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "inTransitDelta" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "businessReference" TEXT,
    "operationId" TEXT NOT NULL,
    "reason" TEXT,
    "remark" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialNumber" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currentWarehouseId" TEXT,
    "currentLocationId" TEXT,
    "condition" "StockCondition" NOT NULL,
    "status" "SerialStatus" NOT NULL,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerialNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundOrder" (
    "id" TEXT NOT NULL,
    "shNo" TEXT NOT NULL,
    "pickupCode" TEXT,
    "erpWarehouse" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "OutboundStatus" NOT NULL,
    "erpSyncStatus" "ERPStatus" NOT NULL DEFAULT 'Pending',
    "customerLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundOrderLine" (
    "id" TEXT NOT NULL,
    "outboundOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requiredQty" DECIMAL(18,3) NOT NULL,
    "requiredCondition" "StockCondition" NOT NULL,
    "allocatedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "preparedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "dispatchedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "OutboundOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundAllocation" (
    "id" TEXT NOT NULL,
    "outboundOrderLineId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "serialNumberId" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "preparedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairReturn" (
    "id" TEXT NOT NULL,
    "serialNumberId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "relatedShNo" TEXT,
    "erpMatched" BOOLEAN NOT NULL DEFAULT false,
    "manualReview" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT NOT NULL,

    CONSTRAINT "RepairReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupSequence" (
    "warehouseId" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupSequence_pkey" PRIMARY KEY ("warehouseId")
);

-- CreateTable
CREATE TABLE "ERPWarehouseMapping" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "erpWarehouse" TEXT NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ERPWarehouseMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ERPDocument" (
    "id" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "externalNumber" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "syncStatus" "ERPStatus" NOT NULL DEFAULT 'Pending',
    "outboundOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ERPDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ERPSyncJob" (
    "id" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ERPStatus" NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "outboundOrderId" TEXT,
    "transferOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ERPSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferOrder" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "destinationLocationId" TEXT,
    "status" "TransferStatus" NOT NULL,
    "erpSyncStatus" "ERPStatus" NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferOrderLine" (
    "id" TEXT NOT NULL,
    "transferOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "receivedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "TransferOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferSerial" (
    "id" TEXT NOT NULL,
    "transferOrderLineId" TEXT NOT NULL,
    "serialNumberId" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "TransferSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL,
    "stocktakeNo" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "status" "StocktakeStatus" NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeLine" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "productId" TEXT,
    "locationCode" TEXT NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "expectedQty" DECIMAL(18,3) NOT NULL,
    "frozenQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "countedQty" DECIMAL(18,3),
    "serials" TEXT[],
    "remark" TEXT,

    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "businessReference" TEXT,
    "remark" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "ExceptionSeverity" NOT NULL,
    "entityReference" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Location_warehouseId_active_idx" ON "Location"("warehouseId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Location_warehouseId_code_key" ON "Location"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_model_idx" ON "Product"("model");

-- CreateIndex
CREATE INDEX "Product_itemType_active_idx" ON "Product"("itemType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Container_warehouseId_code_key" ON "Container"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "InventoryBalance_warehouseId_locationId_idx" ON "InventoryBalance"("warehouseId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryBalance_productId_condition_idx" ON "InventoryBalance"("productId", "condition");

-- CreateIndex
CREATE INDEX "StockTransaction_occurredAt_idx" ON "StockTransaction"("occurredAt");

-- CreateIndex
CREATE INDEX "StockTransaction_warehouseId_occurredAt_idx" ON "StockTransaction"("warehouseId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockTransaction_productId_occurredAt_idx" ON "StockTransaction"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockTransaction_businessReference_idx" ON "StockTransaction"("businessReference");

-- CreateIndex
CREATE INDEX "StockTransaction_operationId_idx" ON "StockTransaction"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialNumber_serialNumber_key" ON "SerialNumber"("serialNumber");

-- CreateIndex
CREATE INDEX "SerialNumber_productId_status_idx" ON "SerialNumber"("productId", "status");

-- CreateIndex
CREATE INDEX "SerialNumber_currentWarehouseId_currentLocationId_idx" ON "SerialNumber"("currentWarehouseId", "currentLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundOrder_shNo_key" ON "OutboundOrder"("shNo");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundOrder_pickupCode_key" ON "OutboundOrder"("pickupCode");

-- CreateIndex
CREATE INDEX "OutboundOrder_warehouseId_status_idx" ON "OutboundOrder"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "OutboundOrder_createdAt_idx" ON "OutboundOrder"("createdAt");

-- CreateIndex
CREATE INDEX "OutboundOrderLine_outboundOrderId_idx" ON "OutboundOrderLine"("outboundOrderId");

-- CreateIndex
CREATE INDEX "OutboundAllocation_outboundOrderLineId_idx" ON "OutboundAllocation"("outboundOrderLineId");

-- CreateIndex
CREATE INDEX "OutboundAllocation_locationId_idx" ON "OutboundAllocation"("locationId");

-- CreateIndex
CREATE INDEX "RepairReturn_relatedShNo_idx" ON "RepairReturn"("relatedShNo");

-- CreateIndex
CREATE INDEX "RepairReturn_receivedAt_idx" ON "RepairReturn"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ERPWarehouseMapping_warehouseId_erpWarehouse_key" ON "ERPWarehouseMapping"("warehouseId", "erpWarehouse");

-- CreateIndex
CREATE UNIQUE INDEX "ERPDocument_documentType_externalNumber_key" ON "ERPDocument"("documentType", "externalNumber");

-- CreateIndex
CREATE INDEX "ERPSyncJob_status_nextAttemptAt_idx" ON "ERPSyncJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransferOrder_transferNo_key" ON "TransferOrder"("transferNo");

-- CreateIndex
CREATE INDEX "TransferOrder_sourceWarehouseId_status_idx" ON "TransferOrder"("sourceWarehouseId", "status");

-- CreateIndex
CREATE INDEX "TransferOrder_destinationWarehouseId_status_idx" ON "TransferOrder"("destinationWarehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransferSerial_transferOrderLineId_serialNumberId_key" ON "TransferSerial"("transferOrderLineId", "serialNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_stocktakeNo_key" ON "Stocktake"("stocktakeNo");

-- CreateIndex
CREATE INDEX "Stocktake_warehouseId_status_idx" ON "Stocktake"("warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_businessReference_idx" ON "AuditLog"("businessReference");

-- CreateIndex
CREATE INDEX "Exception_status_severity_idx" ON "Exception"("status", "severity");

-- CreateIndex
CREATE INDEX "Exception_createdAt_idx" ON "Exception"("createdAt");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_currentWarehouseId_fkey" FOREIGN KEY ("currentWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundOrder" ADD CONSTRAINT "OutboundOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundOrderLine" ADD CONSTRAINT "OutboundOrderLine_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "OutboundOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundOrderLine" ADD CONSTRAINT "OutboundOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundAllocation" ADD CONSTRAINT "OutboundAllocation_outboundOrderLineId_fkey" FOREIGN KEY ("outboundOrderLineId") REFERENCES "OutboundOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundAllocation" ADD CONSTRAINT "OutboundAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundAllocation" ADD CONSTRAINT "OutboundAllocation_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairReturn" ADD CONSTRAINT "RepairReturn_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairReturn" ADD CONSTRAINT "RepairReturn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairReturn" ADD CONSTRAINT "RepairReturn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSequence" ADD CONSTRAINT "PickupSequence_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERPWarehouseMapping" ADD CONSTRAINT "ERPWarehouseMapping_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERPDocument" ADD CONSTRAINT "ERPDocument_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "OutboundOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERPSyncJob" ADD CONSTRAINT "ERPSyncJob_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "OutboundOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERPSyncJob" ADD CONSTRAINT "ERPSyncJob_transferOrderId_fkey" FOREIGN KEY ("transferOrderId") REFERENCES "TransferOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrderLine" ADD CONSTRAINT "TransferOrderLine_transferOrderId_fkey" FOREIGN KEY ("transferOrderId") REFERENCES "TransferOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrderLine" ADD CONSTRAINT "TransferOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferSerial" ADD CONSTRAINT "TransferSerial_transferOrderLineId_fkey" FOREIGN KEY ("transferOrderLineId") REFERENCES "TransferOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferSerial" ADD CONSTRAINT "TransferSerial_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nullable business dimensions need NULL-normalized uniqueness in PostgreSQL.
-- This is a relational expression index, not a concatenated inventory key.
CREATE UNIQUE INDEX "InventoryBalance_relational_grain_key"
ON "InventoryBalance" (
  "warehouseId",
  "locationId",
  COALESCE("containerId", ''),
  COALESCE("productId", ''),
  "itemType",
  "condition"
);

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_frozenQty_nonnegative" CHECK ("frozenQty" >= 0),
  ADD CONSTRAINT "InventoryBalance_inTransitQty_nonnegative" CHECK ("inTransitQty" >= 0),
  ADD CONSTRAINT "InventoryBalance_frozen_within_physical" CHECK ("frozenQty" <= "physicalQty");

ALTER TABLE "StockTransaction"
  ADD CONSTRAINT "StockTransaction_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "StockTransaction_move_distinct_locations"
    CHECK ("transactionType" <> 'Move' OR "sourceLocationId" IS DISTINCT FROM "targetLocationId");

ALTER TABLE "OutboundOrderLine"
  ADD CONSTRAINT "OutboundOrderLine_quantities_nonnegative"
    CHECK (
      "requiredQty" > 0
      AND "allocatedQty" >= 0
      AND "preparedQty" >= 0
      AND "dispatchedQty" >= 0
      AND "allocatedQty" <= "requiredQty"
      AND "preparedQty" <= "requiredQty"
      AND "dispatchedQty" <= "requiredQty"
    );

ALTER TABLE "TransferOrder"
  ADD CONSTRAINT "TransferOrder_distinct_warehouses"
    CHECK ("sourceWarehouseId" <> "destinationWarehouseId");
