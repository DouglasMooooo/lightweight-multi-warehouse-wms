# Lightweight Multi-Warehouse WMS Preview

Sprint 1 is a PostgreSQL-backed Next.js WMS Preview for SYD, MEL and BNE. PostgreSQL is the authoritative store; browser state is used only for filters and forms. Inventory-changing commands run through Route Handlers, application services, domain validation, Prisma transactions and the ERP adapter.

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

For a deployment, run migrations non-interactively:

```powershell
pnpm prisma migrate deploy
```

## Demo reset

Reset is available only when both `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_MODE=true`, and it is rejected when `NODE_ENV=production`. It clears and recreates the demo database through the server seed; it never uses localStorage.

## Validation

```powershell
pnpm db:validate
pnpm db:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`ERP_ADAPTER=mock` keeps ERP calls server-side with deterministic Preview fixtures. The operational workbook at `reference/SYD_WMS_current_reference.xlsx` is read-only business evidence and is never imported by the runtime.

See [Architecture](docs/ARCHITECTURE.md), [Data Model](docs/DATA_MODEL.md), [Business Rules](docs/BUSINESS_RULES.md), [Workflows](docs/WORKFLOWS.md), and [Assumptions](docs/ASSUMPTIONS.md).
