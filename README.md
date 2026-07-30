# Lightweight Multi-Warehouse WMS Prototype

## Project

This repository is a working internal WMS prototype for multi-warehouse physical execution. It is based on observed Sydney warehouse workflows and a validated spreadsheet reference.

The release demonstrates:

```text
Business Analysis
+
Target-State System Design
+
Working Application
```

It is an internal Preview / proof of concept, not a production-ready enterprise WMS.

## Purpose

The prototype explores a target state that connects:

```text
ERP demand
-> WMS warehouse execution
-> inventory / SN / location traceability
-> retryable ERP write-back
```

The Sydney workbook remains read-only operational evidence. PostgreSQL-backed balances and relational entities are application authority; spreadsheet formulas, helper columns and display placeholders are not reproduced as database architecture.

## Core Features

- operational Dashboard with To Prepare, Awaiting Pickup, repair, transfer and exception queues;
- ERP order Fetch → Preview → Validate → Confirm Import;
- outbound allocation and Prepared/Frozen inventory;
- combined scanner, paste, CSV and XLSX Outbound Review;
- final-confirmation mutation boundary;
- batch inbound, faulty receipt, Repair Good recognition and SN binding;
- same-warehouse Move and separate cross-warehouse Transfer;
- native faulty return and repair lifecycle;
- Product Inventory Report with Physical, Available, Frozen, In Transit and condition breakdown;
- SVG warehouse floor plan, rack elevation and location detail;
- SN search, reconciliation, labels, audit and exceptions;
- English and Simplified Chinese operator presentation.

## Architecture

The application is a modular monolith:

```text
Next.js / React UI
-> bounded server APIs
-> application and domain services
-> Prisma
-> PostgreSQL
```

ERP integration stays behind `ERPAdapter`. Important physical operations are transactional and audited. Current balance comes from controlled `InventoryBalance` updates and is reconciled to the immutable `StockTransaction` ledger.

## Tech Stack

- Next.js, React and TypeScript
- Next.js server APIs and server-side application/domain services
- PostgreSQL on Neon
- Prisma ORM
- Vercel, functions configured for Sydney `syd1`
- React + SVG warehouse visualisation
- Vitest, TypeScript and ESLint validation

## Local Environment Setup

Requirements:

- Node.js 24+
- pnpm 11+
- PostgreSQL 15+

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
```

Use `pnpm db:seed` only against an intended disposable local/development database.

```powershell
pnpm dev
```

Open `http://localhost:3000/dashboard`.

## Database

The current Vercel Preview reuses the existing Neon Sydney **Internal Preview / Prototype Database**. It contains the useful Sydney prototype dataset.

No new database is created for this release. Normal Vercel deployment runs migrations only and never automatically seeds or resets inventory:

```text
prisma generate
prisma migrate deploy
next build
```

`pnpm db:bootstrap-preview` is an explicit manual tool for a completely empty approved non-production database. It is not part of deployment.

Environment identity is mandatory:

```text
APP_ENV=preview
DATABASE_ENV=preview
NEXT_PUBLIC_APP_ENV=preview
```

Preview/staging cannot connect to a database classified as production.

## ERP

`ERPAdapter` defines replacement-order lookup, faulty-SN lookup, transfer retrieval and write-back.

- `MockERPAdapter`: controlled internal demonstration only.
- `KingdeeERPAdapter`: normalized gateway boundary requiring approved contract and credentials.
- `UnconfiguredERPAdapter`: explicit safe state when integration is unavailable.

The UI exposes adapter status. This release does not claim verified production Kingdee connectivity. Confirmed physical operations survive later ERP write-back failure through retryable `ERPSyncJob` evidence.

## Deployment

Vercel Preview uses the existing `syd-wms-preview` project and functions configured for `syd1`.

```powershell
pnpm db:validate
pnpm db:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The populated Preview must keep demo reset and shadow replacement disabled. Secret `.env*` values are never committed.

## Documents

- [System Design Overview](docs/SYSTEM_DESIGN_OVERVIEW.md)
- [BA Case Study](docs/BA_CASE_STUDY.md)
- [Database and Environments](docs/DATABASE_AND_ENVIRONMENTS.md)
- [Internal Demo Guide](docs/INTERNAL_DEMO_GUIDE.md)
- [Business Rules](docs/BUSINESS_RULES.md)
- [Assumptions and Workbook Conflicts](docs/ASSUMPTIONS.md)
- [Data Model](docs/DATA_MODEL.md)
- [Workflows](docs/WORKFLOWS.md)
- [ERP Integration](docs/ERP_INTEGRATION.md)
- [Pickup and Label Rules](docs/PICKUP_LABEL_RULES.md)
- [Deployment Environments](docs/DEPLOYMENT_ENVIRONMENTS.md)

## Limitations

- Internal prototype data and infrastructure; not official production inventory.
- Real Kingdee connectivity and write-back are not verified.
- Authentication and RBAC are prototype-level.
- Warehouse geometry is not surveyed-to-scale.
- No approved capacity master, so utilisation is not displayed.
- Production monitoring, backup/DR, security review and formal UAT are future work.
- Legacy SN traceability gaps remain explicitly classified.

## Future Roadmap

- dedicated Development, UAT and Production databases;
- Microsoft Entra ID or suitable SSO and enforced RBAC;
- phased real Kingdee integration;
- structured logs, monitoring and ERP sync operations;
- backup, point-in-time recovery and restore testing;
- security and data-classification review;
- formal warehouse/finance UAT;
- controlled one-time production migration and cutover.

The modular-monolith architecture should remain until measured scale or organisational evidence justifies a different platform.
