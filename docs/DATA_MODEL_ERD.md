# Data Model ERD

`InventoryBalance` is the controlled current quantity projection. `StockTransaction` is immutable movement evidence. `SerialNumber` holds unit identity and lifecycle.

```mermaid
erDiagram
    Warehouse ||--o{ Location : contains
    Warehouse ||--o{ InventoryBalance : owns
    Warehouse ||--o{ StockTransaction : records
    Warehouse ||--o{ SerialNumber : currently_holds
    Warehouse ||--o{ OutboundOrder : executes
    Warehouse ||--o{ RepairJob : services
    Warehouse ||--o{ Exception : scopes
    Location ||--o{ InventoryBalance : stores
    Location ||--o{ SerialNumber : locates
    Location ||--o{ OutboundAllocation : allocates_from
    Product ||--o{ InventoryBalance : quantifies
    Product ||--o{ StockTransaction : moves
    Product ||--o{ SerialNumber : identifies
    Product ||--o{ OutboundOrderLine : requested_as
    Product ||--o{ TransferOrderLine : transferred_as
    Product ||--o{ RepairJob : repaired_as
    OutboundOrder ||--|{ OutboundOrderLine : contains
    OutboundOrderLine ||--o{ OutboundAllocation : allocated_by
    SerialNumber ||--o{ OutboundAllocation : assigned_to
    TransferOrder ||--|{ TransferOrderLine : contains
    TransferOrderLine ||--|{ TransferSerial : carries
    SerialNumber ||--o{ TransferSerial : participates
    Warehouse ||--o{ TransferOrder : source_or_destination
    SerialNumber ||--o{ RepairReturn : returned_as
    SerialNumber ||--o{ RepairJob : serviced_by
    RepairReturn o|--o| RepairJob : creates
    User ||--o{ StockTransaction : records
    User ||--o{ AuditLog : performs
    ShadowImportBatch ||--o{ StockTransaction : opening_evidence

    Warehouse {
      string id PK
      string code UK
      string timezone
      decimal floorAreaSqm nullable
    }
    InventoryBalance {
      string id PK
      string warehouseId FK
      string locationId FK
      string productId FK nullable
      enum itemType
      enum condition
      decimal physicalQty
      decimal frozenQty
      decimal inTransitQty
      int version
    }
    StockTransaction {
      string id PK
      string warehouseId FK
      enum transactionType
      enum condition
      enum sourceCondition nullable
      enum targetCondition nullable
      decimal physicalDelta
      decimal frozenDelta
      decimal inTransitDelta
      datetime effectiveAt
      string operationId
    }
    SerialNumber {
      string id PK
      string serialNumber UK
      string productId FK
      string currentWarehouseId FK nullable
      string currentLocationId FK nullable
      enum condition
      enum status
    }
    Exception {
      string id PK
      string warehouseId FK nullable
      string entityReference
      enum severity
      enum status
    }
```

## Quantity invariants

- Physical, Frozen and In Transit cannot be negative; Frozen cannot exceed Physical.
- Prepared changes Frozen only. Dispatch reduces the exact allocation's Physical and Frozen.
- Move is same-warehouse and atomic. Transfer is cross-warehouse and has its own lifecycle.
- Registering a serial never changes InventoryBalance quantity.
- Historical transactions are corrected by new transactions, never silently edited.

## Compatibility and historical projection

`Exception.warehouseId` is nullable only for legacy compatibility. Unscoped rows are excluded from warehouse totals because their owner cannot be safely inferred.

Historical period-end inventory is available only when an Opening ledger baseline exists before the period. The service starts from current balances and reverses later transactions. Repair completion uses `sourceCondition` and `targetCondition`, so a Repair-to-Repair_Good transition is reconstructed explicitly.
