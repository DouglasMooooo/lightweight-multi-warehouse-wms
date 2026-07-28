# Data Model

The stabilised model includes:

- explicit operational dates on outbound, transfer, repair and stock transactions;
- `PickupBatch` as the one-code/many-SH pickup aggregate;
- `RepairJob` for native Repair to Repair_Good/Scrap traceability;
- Product `reportMachine` and `reportGroup` metadata;
- immutable confirmed `OperationalSnapshot` rows.

`OutboundOrderLine.erpWarehouse` is the authoritative ERP classification for mixed orders. ERP warehouse, physical warehouse, physical location and condition are separate relational concepts.

`InventoryBalance` is grouped by warehouse, physical location, optional container, optional product, item type and condition. Migration `20260727000000_init` enforces one logical row with an expression unique index over:

`warehouseId, locationId, COALESCE(containerId, ''), COALESCE(productId, ''), itemType, condition`

Database checks prevent negative physical/frozen/in-transit values and Frozen greater than Physical. Available is calculated as `physicalQty - frozenQty`; it is not stored. Quantities use PostgreSQL `Decimal(18,3)`.

`OutboundOrderLine` has many allocations. Each records physical source, quantity, optional container/SN, preparation time and dispatch time. Outbound lifecycle evidence is `importedAt`, `allocatedAt`, `preparedAt`, `readyForPickupAt` and `outboundAt`; fields are nullable for legacy completeness.

`RepairReturn.active` plus a partial unique index prevents duplicate active receipt for one SN. `RepairJob.repairStartedAt` records entry to active repair. `SerialNumber` remains first-class.

`RepairJob.returnedToStockAt` is narrower than completion time: it is populated only when Repair_Good becomes usable `In_Stock`. Scrap and Returned_Unrepaired leave it null.

`StockTransaction.sourceCondition`, `targetCondition` and `repairOutcome` make Repair_Completed reclassification explicit alongside its source/target locations, SN, business reference, actor, operation ID and effective time.

`InventoryBalance.legacySerialGap` explicitly marks known pre-cutover aggregate balances whose incomplete SN coverage is informational. It does not relax registration capacity or current transaction rules.

`PickupBatch.status` is `Draft`, `Ready`, `Picked_Up` or `Cancelled`. `readyAt` and `pickedUpAt` are distinct; carrier, customer, collector and remark are optional evidence. Pickup Code is unique.

`PickupSequence` is incremented atomically and the issued value comes from the returned row. It never uses `MAX(code) + 1`.
