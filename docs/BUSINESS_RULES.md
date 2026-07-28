# Business Rules

- Prepared leaves Physical unchanged, increases Frozen and decreases calculated Available.
- Dispatch consumes the exact allocation locations, decreases Physical and Frozen, and requires all serial-tracked units.
- Outbound SN validation checks SKU, condition, warehouse, allocated location, eligible status and other active allocations.
- A faulty SN already in Repair or linked to an active RepairReturn is rejected.
- Move is atomic, same-warehouse, source-to-destination, and cannot consume Frozen stock.
- A serial-tracked Product Move requires the exact SN list; aggregate-only movement is rejected.
- Adjustment is not Move. Product requires SKU. No-SKU stock is limited to Material with reason `Unmonitored material`.
- Transfer requires different warehouses. Transfer Out changes SN to In_Transit; Transfer In changes it to In_Stock at the destination.
- Historical stock transactions are append-only in application workflows.
- ERP warehouse classification never replaces physical warehouse/location.
