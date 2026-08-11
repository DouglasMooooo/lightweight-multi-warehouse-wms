-- Existing unscoped exceptions remain nullable because their warehouse cannot be
-- inferred safely. New operational exceptions must carry an explicit warehouse.
ALTER TABLE "Exception"
  ADD COLUMN "warehouseId" TEXT;

CREATE INDEX "Exception_warehouseId_status_idx"
  ON "Exception"("warehouseId", "status");

ALTER TABLE "Exception"
  ADD CONSTRAINT "Exception_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
