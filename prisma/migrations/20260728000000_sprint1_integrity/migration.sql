ALTER TABLE "OutboundAllocation" ADD COLUMN "containerId" TEXT;
ALTER TABLE "RepairReturn" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RepairReturn" ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "OutboundAllocation"
  ADD CONSTRAINT "OutboundAllocation_containerId_fkey"
  FOREIGN KEY ("containerId") REFERENCES "Container"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "OutboundAllocation_containerId_idx"
  ON "OutboundAllocation"("containerId");

-- A serial may belong to only one undispatched outbound allocation.
CREATE UNIQUE INDEX "OutboundAllocation_active_serial_key"
  ON "OutboundAllocation"("serialNumberId")
  WHERE "serialNumberId" IS NOT NULL AND "dispatchedAt" IS NULL;

-- A physical faulty unit may have only one active repair receipt.
CREATE UNIQUE INDEX "RepairReturn_active_serial_key"
  ON "RepairReturn"("serialNumberId")
  WHERE "active" = true;

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_physicalQty_nonnegative"
  CHECK ("physicalQty" >= 0);

ALTER TABLE "OutboundAllocation"
  ADD CONSTRAINT "OutboundAllocation_quantity_positive"
  CHECK ("quantity" > 0);
