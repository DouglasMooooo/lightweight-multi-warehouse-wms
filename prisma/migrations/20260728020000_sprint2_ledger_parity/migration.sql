-- Sprint 2: operational workflow, repair lifecycle, pickup batches and reporting semantics.
-- Existing enum values remain for historical rows; application workflows use the new states.
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'Repair_Completed';
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'RepairGood_Adjustment_In';
ALTER TYPE "OutboundStatus" ADD VALUE IF NOT EXISTS 'Imported';
ALTER TYPE "OutboundStatus" ADD VALUE IF NOT EXISTS 'Pending_Allocation';
ALTER TYPE "OutboundStatus" ADD VALUE IF NOT EXISTS 'Allocated';
ALTER TYPE "OutboundStatus" ADD VALUE IF NOT EXISTS 'ERP_Synced';

CREATE TYPE "RepairStatus" AS ENUM (
  'Received', 'Pending_Repair', 'In_Repair', 'Repair_Completed',
  'Repair_Good', 'Scrap_Pending', 'Scrapped'
);
CREATE TYPE "RepairOutcome" AS ENUM ('Repair_Good', 'Scrap', 'Returned_Unrepaired');
CREATE TYPE "RepairSource" AS ENUM ('Native_Return', 'Legacy_Manual');
CREATE TYPE "LabelType" AS ENUM ('Batch_Label', 'Unit_SN_Label');
CREATE TYPE "ReportingPeriodType" AS ENUM ('Weekly', 'Monthly');

ALTER TABLE "Product" RENAME COLUMN "reportCategory" TO "reportGroup";
ALTER TABLE "Product" ADD COLUMN "reportMachine" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StockTransaction" RENAME COLUMN "occurredAt" TO "recordedAt";
ALTER TABLE "StockTransaction" ADD COLUMN "effectiveAt" TIMESTAMP(3);
UPDATE "StockTransaction" SET "effectiveAt" = "recordedAt" WHERE "effectiveAt" IS NULL;
ALTER TABLE "StockTransaction" ALTER COLUMN "effectiveAt" SET NOT NULL;
ALTER TABLE "StockTransaction" ALTER COLUMN "effectiveAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER INDEX "StockTransaction_occurredAt_idx" RENAME TO "StockTransaction_recordedAt_idx";
DROP INDEX IF EXISTS "StockTransaction_warehouseId_occurredAt_idx";
DROP INDEX IF EXISTS "StockTransaction_productId_occurredAt_idx";
CREATE INDEX "StockTransaction_warehouseId_effectiveAt_idx" ON "StockTransaction"("warehouseId", "effectiveAt");
CREATE INDEX "StockTransaction_productId_effectiveAt_idx" ON "StockTransaction"("productId", "effectiveAt");

ALTER TABLE "OutboundOrder" DROP CONSTRAINT IF EXISTS "OutboundOrder_pickupCode_key";
DROP INDEX IF EXISTS "OutboundOrder_pickupCode_key";
ALTER TABLE "OutboundOrder"
  ADD COLUMN "pickupBatchId" TEXT,
  ADD COLUMN "preparedAt" TIMESTAMP(3),
  ADD COLUMN "readyForPickupAt" TIMESTAMP(3),
  ADD COLUMN "outboundAt" TIMESTAMP(3);
CREATE INDEX "OutboundOrder_pickupCode_idx" ON "OutboundOrder"("pickupCode");
CREATE INDEX "OutboundOrder_outboundAt_idx" ON "OutboundOrder"("outboundAt");

ALTER TABLE "OutboundOrderLine" ADD COLUMN "erpWarehouse" TEXT;
UPDATE "OutboundOrderLine" line
SET "erpWarehouse" = orders."erpWarehouse"
FROM "OutboundOrder" orders
WHERE line."outboundOrderId" = orders."id";
ALTER TABLE "OutboundOrderLine" ALTER COLUMN "erpWarehouse" SET NOT NULL;

ALTER TABLE "OutboundAllocation"
  ADD COLUMN "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "TransferOrder"
  ADD COLUMN "preparedAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "receivedAt" TIMESTAMP(3);
UPDATE "TransferOrder" SET "dispatchedAt" = "updatedAt" WHERE "status" IN ('Dispatched', 'In_Transit', 'Partially_Received', 'Received');
UPDATE "TransferOrder" SET "receivedAt" = "updatedAt" WHERE "status" = 'Received';

CREATE TABLE "PickupBatch" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "labelType" "LabelType" NOT NULL DEFAULT 'Batch_Label',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),
  CONSTRAINT "PickupBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PickupBatch_code_key" ON "PickupBatch"("code");
CREATE INDEX "PickupBatch_warehouseId_createdAt_idx" ON "PickupBatch"("warehouseId", "createdAt");
ALTER TABLE "PickupBatch" ADD CONSTRAINT "PickupBatch_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboundOrder" ADD CONSTRAINT "OutboundOrder_pickupBatchId_fkey"
  FOREIGN KEY ("pickupBatchId") REFERENCES "PickupBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing pickup codes by creating one batch per legacy order.
INSERT INTO "PickupBatch" ("id", "code", "warehouseId", "readyAt")
SELECT 'legacy-pickup-' || "id", "pickupCode", "warehouseId", "updatedAt"
FROM "OutboundOrder"
WHERE "pickupCode" IS NOT NULL
ON CONFLICT ("code") DO NOTHING;
UPDATE "OutboundOrder" orders
SET "pickupBatchId" = batches."id"
FROM "PickupBatch" batches
WHERE orders."pickupCode" = batches."code";

CREATE TABLE "RepairJob" (
  "id" TEXT NOT NULL,
  "serialNumberId" TEXT,
  "warehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "receivedLocationId" TEXT NOT NULL,
  "currentLocationId" TEXT NOT NULL,
  "originalShNo" TEXT,
  "status" "RepairStatus" NOT NULL,
  "outcome" "RepairOutcome",
  "source" "RepairSource" NOT NULL DEFAULT 'Native_Return',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repairCompletedAt" TIMESTAMP(3),
  "returnedToStockAt" TIMESTAMP(3),
  "remark" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RepairJob_warehouseId_status_idx" ON "RepairJob"("warehouseId", "status");
CREATE INDEX "RepairJob_serialNumberId_idx" ON "RepairJob"("serialNumberId");
CREATE INDEX "RepairJob_originalShNo_idx" ON "RepairJob"("originalShNo");
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_serialNumberId_fkey"
  FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_receivedLocationId_fkey"
  FOREIGN KEY ("receivedLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairJob" ADD CONSTRAINT "RepairJob_currentLocationId_fkey"
  FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RepairReturn" ADD COLUMN "repairJobId" TEXT;
CREATE UNIQUE INDEX "RepairReturn_repairJobId_key" ON "RepairReturn"("repairJobId");
ALTER TABLE "RepairReturn" ADD CONSTRAINT "RepairReturn_repairJobId_fkey"
  FOREIGN KEY ("repairJobId") REFERENCES "RepairJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill active native returns into explicit repair jobs while retaining the original return record.
INSERT INTO "RepairJob" (
  "id", "serialNumberId", "warehouseId", "productId", "receivedLocationId",
  "currentLocationId", "originalShNo", "status", "source", "receivedAt", "remark", "updatedAt"
)
SELECT
  'legacy-repair-' || returns."id", returns."serialNumberId", locations."warehouseId",
  returns."productId", returns."locationId", returns."locationId", returns."relatedShNo",
  'Pending_Repair', 'Native_Return', returns."receivedAt",
  'Migrated from active RepairReturn during Sprint 2.', CURRENT_TIMESTAMP
FROM "RepairReturn" returns
JOIN "Location" locations ON locations."id" = returns."locationId"
WHERE returns."active" = true;
UPDATE "RepairReturn" returns
SET "repairJobId" = 'legacy-repair-' || returns."id"
WHERE returns."active" = true;

CREATE TABLE "OperationalSnapshot" (
  "id" TEXT NOT NULL,
  "periodType" "ReportingPeriodType" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "metrics" JSONB NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL,
  "confirmedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OperationalSnapshot_periodType_periodStart_periodEnd_warehouseId_key"
  ON "OperationalSnapshot"("periodType", "periodStart", "periodEnd", "warehouseId");
CREATE INDEX "OperationalSnapshot_warehouseId_periodEnd_idx"
  ON "OperationalSnapshot"("warehouseId", "periodEnd");
ALTER TABLE "OperationalSnapshot" ADD CONSTRAINT "OperationalSnapshot_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RepairWeeklyMetrics" (
  "id" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "repairCompleted" INTEGER,
  "repairScrap" INTEGER,
  "scrapOutbound" INTEGER,
  "pendingScrap" INTEGER,
  "repairGoodInbound" INTEGER,
  "pendingRepair" INTEGER,
  "repairInventory" INTEGER,
  "remark" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepairWeeklyMetrics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RepairWeeklyMetrics_weekStart_warehouseId_key"
  ON "RepairWeeklyMetrics"("weekStart", "warehouseId");
ALTER TABLE "RepairWeeklyMetrics" ADD CONSTRAINT "RepairWeeklyMetrics_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
