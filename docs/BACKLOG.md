# Backlog

## Recommended Sprint 2

- Real authentication and warehouse/role authorization.
- Kingdee production adapter, credential management, retry worker and sync review UI.
- PostgreSQL integration test environment in CI, including concurrent pickup and balance mutation tests.
- Transfer-level in-transit inventory ledger replacing the Preview source-balance field.
- Full serial completeness enforcement after production opening balances are reconciled.
- Controlled repair completion that closes `RepairReturn.active` and creates Repair_Good stock.
- Split the large Preview component into domain page components without visual redesign.

Advanced reporting, offline mode, hardware SDKs, microservices and complex approval chains remain intentionally out of scope.
