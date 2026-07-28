-- Domain stabilisation from the latest Sydney workbook semantics.
CREATE TYPE "PickupStatus" AS ENUM ('Draft', 'Ready', 'Picked_Up', 'Cancelled');

ALTER TABLE "OutboundOrder"
  ADD COLUMN "importedAt" TIMESTAMP(3),
  ADD COLUMN "allocatedAt" TIMESTAMP(3);
UPDATE "OutboundOrder"
SET "importedAt" = "createdAt"
WHERE "status" IN ('Imported', 'Pending_Allocation', 'Allocated');
UPDATE "OutboundOrder"
SET "allocatedAt" = "updatedAt"
WHERE "status" IN ('Allocated', 'Prepared', 'Partially_Prepared', 'Ready_for_Pickup', 'Outbound', 'ERP_Synced');

ALTER TABLE "RepairJob" ADD COLUMN "repairStartedAt" TIMESTAMP(3);
UPDATE "RepairJob"
SET "repairStartedAt" = "updatedAt"
WHERE "status" IN ('In_Repair', 'Repair_Completed', 'Repair_Good', 'Scrap_Pending', 'Scrapped');

ALTER TABLE "PickupBatch"
  ADD COLUMN "status" "PickupStatus" NOT NULL DEFAULT 'Draft',
  ADD COLUMN "pickedUpAt" TIMESTAMP(3),
  ADD COLUMN "carrier" TEXT,
  ADD COLUMN "customer" TEXT,
  ADD COLUMN "collector" TEXT,
  ADD COLUMN "remark" TEXT;
UPDATE "PickupBatch" SET "status" = 'Ready' WHERE "readyAt" IS NOT NULL;
