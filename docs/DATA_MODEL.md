# Data model

## Master data

- `Warehouse` supports SYD, MEL, BNE and future sites without schema change.
- `Location` belongs to a warehouse and stores rack/service-zone metadata.
- `Product` owns SKU, model, Item Type and serial-tracking policy.
- `Container` is optional and lightweight; the Preview does not model a full pallet lifecycle.
- `ERPWarehouseMapping` maps an ERP warehouse label to a WMS stock condition.

## Inventory and traceability

- `InventoryBalance` is the fast current-state table keyed by relational warehouse, location, optional container, optional product and condition fields.
- `StockTransaction` is the audit ledger with explicit physical, frozen and in-transit deltas.
- `operationId` groups the business operation. One Move row carries both source and destination.
- `SerialNumber` is globally unique and stores current warehouse, location, condition and state.

The migration adds an expression unique index using `COALESCE` for optional product/container fields. This avoids PostgreSQL nullable-unique gaps without concatenated business keys.

## Operational documents

- Outbound: `OutboundOrder`, `OutboundOrderLine`, `OutboundAllocation`.
- Repair: `RepairReturn`.
- Transfer: `TransferOrder`, `TransferOrderLine`, `TransferSerial`.
- Stocktake: `Stocktake`, `StocktakeLine`.
- Integration: `ERPDocument`, `ERPSyncJob`.
- Control: `PickupSequence`, `AuditLog`, `Exception`, `User`, `Role`.

Indexes cover SKU, SN, SH, pickup code, order/transfer status, warehouse/location and transaction time.
