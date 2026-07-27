# Architecture

## Shape

The Preview is a modular Next.js App Router application:

1. `app/` and `components/` render task-oriented operator workflows.
2. `services/` exposes warehouse use cases.
3. `domain/` owns invariants and state transitions.
4. `repositories/` defines persistence boundaries.
5. `prisma/` models PostgreSQL persistence and migrations.
6. `integrations/` contains the ERP abstraction and Mock ERP fixtures.
7. `validation/` contains input schemas.

The browser demo uses `InMemoryWmsRepository` semantics and `localStorage` persistence so acceptance scenarios can be demonstrated without infrastructure. The production seam is the `WmsRepository` transaction boundary. Server actions/API handlers should call services within a Prisma `$transaction`; React components must not calculate inventory deltas.

## Write transaction pattern

Every warehouse write follows:

1. Validate role, master data and operation input.
2. Lock or compare the relevant balance version.
3. Validate available quantity and SN state.
4. Insert the immutable `StockTransaction`.
5. Update `InventoryBalance`.
6. Update `SerialNumber`, order or transfer status.
7. Insert `AuditLog`.
8. Create `ERPSyncJob` where required.
9. Commit.

ERP write-back runs after the physical operation commits. A failed sync becomes a visible exception and never rolls back a confirmed physical movement.

## Deployment

The target is Vercel plus PostgreSQL. No WMS rule depends on a specific database host or ERP vendor. PWA metadata is present; offline mutation queues are intentionally deferred.
