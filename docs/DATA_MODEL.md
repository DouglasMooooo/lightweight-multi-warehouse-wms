# Data Model

`InventoryBalance` is grouped by warehouse, physical location, optional container, optional product, item type and condition. PostgreSQL migration `20260727000000_init` enforces one logical row with an expression unique index:

`warehouseId, locationId, COALESCE(containerId, ''), COALESCE(productId, ''), itemType, condition`

This is relational null-normalization, not a concatenated business key. Database checks prevent negative physical/frozen/in-transit values and frozen quantity greater than physical.

`OutboundOrderLine` has many `OutboundAllocation` rows. Each allocation records location, quantity, optional container, optional serial, prepared time and dispatched time. A partial unique index prevents one serial from belonging to multiple undispatched allocations.

`RepairReturn.active` plus a partial unique index on `serialNumberId` prevents duplicate active repair receipt. `SerialNumber` remains a first-class ledger entity.

Available quantity is calculated as `physicalQty - frozenQty`; it is not stored. Quantities use PostgreSQL `Decimal(18,3)` and Prisma Decimal.

`PickupSequence` is updated atomically and the issued value is derived from the returned incremented row. It never uses `MAX(code) + 1`.
