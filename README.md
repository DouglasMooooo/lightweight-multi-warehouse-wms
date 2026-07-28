# Lightweight Multi-Warehouse WMS Preview

The Domain Stabilisation release is a PostgreSQL-backed Next.js WMS Preview for SYD, MEL and BNE. PostgreSQL is authoritative; the Sydney workbook is read-only operational evidence. Inventory-changing commands run through Route Handlers, application services, domain validation, Prisma transactions and the ERP adapter.

The outbound lifecycle is deliberately staged:

`ERP import -> Pending Allocation -> Allocated -> Prepared/Frozen -> Ready for Pickup -> Outbound -> ERP sync`

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

`ERP_ADAPTER=mock` keeps ERP calls server-side with deterministic Preview fixtures. The operational workbook at `reference/SYD_WMS_current_reference.xlsx` is never modified or imported by the runtime. During shadow mode, reconciliation maps exported ledger values by semantic fields and reports differences without posting adjustments.

See [Architecture](docs/ARCHITECTURE.md), [Data Model](docs/DATA_MODEL.md), [Business Rules](docs/BUSINESS_RULES.md), [Workflows](docs/WORKFLOWS.md), [Reconciliation](docs/RECONCILIATION.md), [Cutover Plan](docs/CUTOVER_PLAN.md), and [Assumptions](docs/ASSUMPTIONS.md).
