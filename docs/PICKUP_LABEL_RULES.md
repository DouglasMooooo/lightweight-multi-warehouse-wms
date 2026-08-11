# Pickup and Label Rules

- One Pickup Code identifies one PickupBatch and may cover several SH documents.
- A batch may contain several SKUs, models and ERP warehouses.
- The batch label is one A4 page. Rows aggregate by SKU + Model + ERP Warehouse only.
- Mixed ERP warehouses remain separate rows on the same label.
- Unit/SN labels are generated only when explicitly requested.
- Ready and Picked Up are separate lifecycle states and timestamps.
- Label rendering and pickup-code issuance never change Physical, Frozen or Available.
- Batch-code uniqueness is enforced in the database; local codes use an atomic sequence.
