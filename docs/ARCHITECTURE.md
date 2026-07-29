# Architecture

Domain policy boundaries:

- `ERPAdapter` owns replacement/faulty lookups and ERP write-back.
- Application services separate outbound import, allocation, preparation and dispatch transactions.
- Repair start/completion is a transactional, audited lifecycle.
- Label aggregation, semantic reporting and reconciliation are pure policies that do not mutate inventory.
- Current balances are controlled projections reconciled to the append-only transaction ledger.

The command path is:

`Next.js client UI -> Route Handler -> WmsApplicationService -> domain rules -> Prisma transaction -> PostgreSQL`

Reads use `GET /api/wms`. Commands use `POST /api/wms` with a discriminated DTO. Faulty ERP lookup uses `GET /api/wms/faulty-lookup`; adapters are never imported by browser code.

`InventoryRepository.applyDelta()` is the shared Decimal balance mutation mechanism. Multi-entity operations use Serializable Prisma transactions with bounded conflict retries. All important state changes receive a server-resolved actor and audit record.

The UI preserves the Preview layout. `WmsState` is a read DTO refreshed after commands, not an authoritative store. No normal path reads or writes warehouse data in localStorage.

ERP write-back is represented by durable `ERPSyncJob` rows. A confirmed physical transaction is not rolled back if later external write-back fails.

Lifecycle timestamps belong to their domain records: `importedAt`, `allocatedAt`, `preparedAt`, `readyForPickupAt`, `outboundAt`, `receivedAt`, `repairStartedAt` and `repairCompletedAt`. `StockTransaction.recordedAt` is immutable system evidence; `effectiveAt` is the business operation time used by movement reports.

Validation failures cross the HTTP boundary as stable error codes plus operator-readable messages. UI components render state and submit commands; they do not decide stock eligibility, reconciliation classification, label grouping or reporting scope.

Shadow import follows a separate path:

`/reconciliation -> POST /api/reconciliation -> safe workbook reader -> semantic mapper/normalizer -> projection -> reconciliation`

The workbook buffer never enters client business logic. `DRY_RUN` reads WMS reference data without mutations. Guarded `SHADOW_SEED` creates an import batch, opening balances, immutable Opening transactions, serial identities and audit evidence in one Serializable database transaction. It does not replay dirty spreadsheet history.

## Presentation architecture

`I18nProvider` owns the client locale preference and resolves semantic keys from `i18n/messages/en.json` or `zh-CN.json`. Domain DTOs are unchanged. Layout, Dashboard, Inventory, Reconciliation and shared UI primitives are separate component boundaries; domain services remain outside React.

Status presentation uses one shared semantic tone function and translated display label. Scanner interaction state and warehouse-time conversion are pure helpers with focused tests.

`getPrisma()` validates `APP_ENV`/`VERCEL_ENV` against `DATABASE_ENV` before creating a client. This is a runtime safety boundary, not merely a deployment convention.
