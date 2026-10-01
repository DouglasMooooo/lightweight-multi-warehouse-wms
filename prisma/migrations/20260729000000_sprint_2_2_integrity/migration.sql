-- Sprint 2.2 integrity evidence and explicit legacy serial coverage classification.
ALTER TABLE "InventoryBalance"
  ADD COLUMN "legacySerialGap" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StockTransaction"
  ADD COLUMN "sourceCondition" "StockCondition",
  ADD COLUMN "targetCondition" "StockCondition",
  ADD COLUMN "repairOutcome" "RepairOutcome";

UPDATE "StockTransaction"
SET
  "sourceCondition" = 'Repair',
  "targetCondition" = "condition",
  "repairOutcome" = CASE
    WHEN "reason" IN ('Repair_Good', 'Scrap', 'Returned_Unrepaired')
      THEN "reason"::"RepairOutcome"
    ELSE NULL
  END
WHERE "transactionType" = 'Repair_Completed';
