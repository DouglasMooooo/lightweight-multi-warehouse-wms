-- Indexes justified by bounded inventory filters and batched serial allocation validation.
CREATE INDEX "InventoryBalance_warehouseId_locationId_productId_condition_idx"
ON "InventoryBalance"("warehouseId", "locationId", "productId", "condition");

CREATE INDEX "OutboundAllocation_serialNumberId_idx"
ON "OutboundAllocation"("serialNumberId");
