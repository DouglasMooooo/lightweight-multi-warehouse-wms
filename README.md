# Lightweight Multi-Warehouse WMS Preview

The Sprint 5 Preview is a PostgreSQL-backed Next.js WMS for SYD, MEL and BNE. PostgreSQL is authoritative; the Sydney workbook is read-only operational evidence. It adds an industrial warehouse-operations UI, bounded global search, environment-safe ERP order preview/confirmation, and a data-driven visual warehouse map while preserving the validated inventory rules.

The outbound lifecycle is deliberately staged:

`ERP import -> Pending Allocation -> Allocated -> Prepared/Frozen -> Ready for Pickup -> Outbound -> ERP sync`

The operator UI supports English and Simplified Chinese without changing routes or persisted domain codes. The top-right language preference is stored only in browser localStorage; warehouse state remains PostgreSQL-backed.

The release includes native repair start/completion, one-code/many-SH pickup labels, product-driven reporting, explicit business timestamps, structured validation codes and read-only balance/SN reconciliation.

## Requirements

- Node.js 24+
- pnpm 11+
- PostgreSQL 15+

## Local setup

```powershell
Copy-Item .env.example .env
```

Create a PostgreSQL database named `wms`, then set `DATABASE_URL` in `.env`.

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000/dashboard`.

Set deployment identity explicitly. Vercel Preview must use a Preview/Staging database and Production must use the production database:

```text
APP_ENV=preview
DATABASE_ENV=preview
NEXT_PUBLIC_APP_ENV=preview
```

Unsafe Preview application + Production database combinations fail before Prisma connects.

Open `/reconciliation` to upload an `.xlsx` snapshot in `DRY_RUN` mode. `SHADOW_SEED` is only available outside production when `SHADOW_IMPORT_ENABLED=true`. Controlled replacement additionally requires `SHADOW_IMPORT_REPLACE_ENABLED=true` and an explicit operator selection. Valid rows migrate independently while invalid rows remain diagnostics. The same checksum, mode and cutover timestamp is idempotent.

To inspect a workbook without a database:

```powershell
pnpm shadow:analyze reference/SYD_WMS_current_reference.xlsx 2026-07-29T00:00:00+10:00
```

For deployment, run migrations non-interactively:

```powershell
pnpm prisma migrate deploy
```

## Demo reset

Reset is available only when both `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_MODE=true`, and is rejected when `NODE_ENV=production`. It clears and recreates demo data through the server seed; it never uses localStorage.

## Validation

```powershell
pnpm db:validate
pnpm db:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`ERP_ADAPTER=mock` keeps ERP calls server-side with deterministic local/demo fixtures. Preview/staging without an explicitly configured adapter reports that ERP is not configured, and Production rejects Mock. Workbook parsing is server-side, accepts `.xlsx` up to 20 MB, uses cached formula values only, and never executes macros or writes the source. Reconciliation never posts adjustments.

See [Sprint 5.1 Report](docs/SPRINT5_1_PRODUCT_UX_INVENTORY_REPORT.md), [Sprint 5 Report](docs/SPRINT5_WAREHOUSE_UX_ERP_MAP.md), [Sprint 4 Report](docs/SPRINT4_OPERATIONAL_HARDENING.md), [Performance](docs/PERFORMANCE.md), [i18n](docs/I18N.md), [UX Guidelines](docs/UX_GUIDELINES.md), [Deployment Environments](docs/DEPLOYMENT_ENVIRONMENTS.md), [Shadow Import](docs/SHADOW_IMPORT.md), [Architecture](docs/ARCHITECTURE.md), [Data Model](docs/DATA_MODEL.md), [Business Rules](docs/BUSINESS_RULES.md), [Workflows](docs/WORKFLOWS.md), [Reconciliation](docs/RECONCILIATION.md), [Cutover Plan](docs/CUTOVER_PLAN.md), and [Assumptions](docs/ASSUMPTIONS.md).
