# Architecture

Sprint 2 policy boundaries:

- `ERPAdapter` owns replacement-order lookups and ERP write-back.
- outbound application services separate import, allocation, preparation and dispatch transactions.
- repair completion is a transactional inventory reclassification with audit evidence.
- label aggregation, semantic reporting and reconciliation are pure domain policies and do not mutate inventory.
- current balances remain controlled projections reconciled to the append-only transaction ledger.

The Preview uses one consistent command path:

`Next.js client UI → Route Handler → WmsApplicationService → domain rules → Prisma repository/transaction → PostgreSQL`

Reads use `GET /api/wms`. Commands use `POST /api/wms` with a discriminated command DTO. Faulty ERP lookup uses `GET /api/wms/faulty-lookup`; the adapter is never imported by browser code.

`InventoryRepository.applyDelta()` is the shared Decimal balance mutation mechanism. Multi-entity operations use Serializable Prisma transactions with bounded conflict retries. Audit text is constructed from validated server data and receives a server-resolved actor (`Demo Supervisor` for this Sprint).

The UI preserves the v0.1 layout. Its `WmsState` is a read DTO refreshed after commands, not an authoritative store. No normal execution path reads or writes warehouse data in localStorage.

ERP write-back is represented by durable `ERPSyncJob` rows. A confirmed warehouse transaction is not rolled back if a later external write fails.
