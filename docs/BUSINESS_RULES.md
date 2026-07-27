# Business rules

## Inventory quantities

- Physical Qty is stock physically present.
- Frozen Qty is stock reserved by Prepared outbound.
- Available Qty is `Physical Qty - Frozen Qty`.
- In Transit Qty is stock dispatched from one warehouse but not received by another.
- Operators never overwrite a balance.
- New and Repair_Good are separately allocatable conditions.
- Repair and Scrap are not normal allocatable stock.

## Ledger

`StockTransaction` is immutable. Opening, Inbound, Outbound, Prepared, Move, Adjustment_In, Adjustment_Out, Return_to_Repair, Transfer_Out and Transfer_In are supported. A correction is a new compensating transaction.

Prepared records the reservation quantity with zero physical delta and a positive frozen delta. Final outbound applies a negative physical delta and releases frozen quantity.

## Outbound

- ERP Replacement Unit Information supplies replacement SKU and Qty.
- Faulty Unit Information must never become the replacement allocation by accident.
- Allocation cannot exceed Available Qty and must match warehouse, location, SKU and condition.
- Product Qty N requires N SN allocations when the Product master requires serial tracking.
- Dispatch requires a physical location and all required SNs.
- Pickup generation and label generation have no inventory effect.

## Locations and movement

- Physical location is the source of truth for stock placement.
- ERP warehouse is a configurable classification used to derive required condition.
- One physical location can contain several SKUs or optional container inventory.
- Mixed containers keep one relational balance/transaction per SKU.
- Move is one atomic operation inside one warehouse; warehouse total remains unchanged.
- Cross-warehouse movement is Transfer, not Move.

## Adjustments and receiving

- Adjustment requires a reason and remark.
- Blank SKU is invalid for Product.
- Blank SKU is allowed for Material only with the controlled reason `Unmonitored material`.
- Faulty return normally enters SYD `REPAIR-01`, condition Repair, SN status Repair.
- Repair completion can later become an explicit Repair → Repair_Good operation; Preview can use a controlled Repair Completion Adjustment_In.

## ERP resilience

A confirmed physical operation is committed before ERP write-back. Pending or failed write-back remains in the sync queue and exception list.
