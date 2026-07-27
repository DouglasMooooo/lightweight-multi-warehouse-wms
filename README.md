# Lightweight Multi-Warehouse WMS Preview

A task-oriented warehouse execution Preview for Sydney operations, shaped for future PostgreSQL-backed multi-warehouse deployment and ERP integration.

The Preview includes working browser-based demo workflows for current stock, Prepared/Frozen outbound, pickup labels, SN scanning and dispatch, faulty returns, atomic Move, controlled Adjustment, SN traceability, SYD → MEL transfer, stocktake counts, audit and exceptions. Demo changes persist in the browser and can be reset from the header.

## Quick start — no database required

Requirements: Node.js 20.9+ and pnpm.

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:3000/dashboard`.

There is no password in Preview demo mode. The active identity is `Demo Supervisor` with role `Warehouse_Supervisor`.

Useful demo values:

- Faulty ERP lookup SN: `60E5M4805C3F242`
- Prepared outbound: `SH-2607-00175008`
- Outbound scan SNs: `EQ48S260700001`, `EQ48S260700002`
- Basic transfer: `TR-SYD-MEL-00018`

## PostgreSQL setup

Create an empty PostgreSQL database locally, in Neon, or in Supabase. Then:

```powershell
Copy-Item .env.example .env
# Edit DATABASE_URL in .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The browser Preview currently uses the in-memory demo repository even when a database is configured. The Prisma schema, migration, seed, repository boundary and transactional domain services are ready for the next sprint’s server-action wiring.

## Validation

```powershell
pnpm db:validate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Deployment

The application is compatible with Vercel’s Next.js runtime. Configure `DATABASE_URL`, `ERP_ADAPTER`, and `NEXT_PUBLIC_DEMO_MODE` in the Vercel project. Use a pooled PostgreSQL connection string suitable for serverless execution and a direct connection for migrations if the provider recommends one. Do not commit `.env`.

## Architecture

The repository separates:

`UI → application services → domain operations → repository → integration adapters`

See the documents in `docs/` for rules, workflows, schema decisions, ERP behaviour, assumptions and backlog.

The validated spreadsheet is preserved read-only at `reference/SYD_WMS_current_reference.xlsx`. Development code must never write to it.
