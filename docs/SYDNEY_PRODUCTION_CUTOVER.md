# Sydney Production Cutover

## Scope

This is an explicit, one-time PostgreSQL opening migration. It imports the reconciled Current Stock view as `Opening` balances and imports the two authoritative SN snapshot tabs as current `SerialNumber` state. It does not replay the spreadsheet ledger, run on Vercel build, modify Google Sheets, reset a database or replace existing SYD stock.

Stable business reference: `SYD-CUTOVER-20260811`.

The application runtime is already Prisma/PostgreSQL-backed. `InMemoryWmsRepository` is retained only as a test/demo artifact and is not constructed by production API routes. Browser local storage contains uncommitted scan-review drafts only; it is not inventory persistence.

## Status semantics

| Source SN status | WMS status | Physical contribution | Frozen contribution |
| --- | --- | ---: | ---: |
| blank / Normal | `In_Stock` | 1 | 0 |
| Prepared | `Prepared` | 1 | 1 |
| Outbound | `Outbound` | 0 | 0 |

SN identity is the final segment of `SKU/middle/machine-SN`. The first segment is the SKU. The middle segment is not treated as machine SN identity.

Opening quantities come from Current Stock. SNs validate serial coverage and state; they are not added again as a second inventory quantity source. Mixed-pallet container codes remain on balances and transactions, but are not part of SN identity.

## Commands

The private SN workbook must be exported read-only to two CSV files. These input files contain operational identifiers and must remain outside Git; the repository ignores `/.cutover-input/`.

```powershell
pnpm migrate:sydney --dry-run `
  --good-sn-csv=.cutover-input/good.csv `
  --new-sn-csv=.cutover-input/new.csv
```

Database inspection is also read-only:

```powershell
pnpm migrate:sydney --dry-run --database-check `
  --good-sn-csv=.cutover-input/good.csv `
  --new-sn-csv=.cutover-input/new.csv
```

The one-time apply is deliberately gated:

```powershell
$env:APP_ENV="production"
$env:DATABASE_ENV="production"
$env:ALLOW_SYDNEY_CUTOVER="true"
pnpm migrate:sydney `
  --good-sn-csv=.cutover-input/good.csv `
  --new-sn-csv=.cutover-input/new.csv
```

The production database must already contain an active audit user and must have no non-zero SYD operational inventory. Apply takes a PostgreSQL advisory lock and runs at Serializable isolation. A previously committed business reference returns an idempotent no-op. Any critical validation exception aborts before database connection/write.

## Current authoritative-source Dry Run

Run on 2026-08-12 against the supplied Google Sheets exports:

| Metric | Result |
| --- | ---: |
| Products | 94 |
| Locations | 136 |
| Containers | 7 |
| Opening balance grains | 76 |
| SN rows accepted | 326 |
| In Stock SN | 323 |
| Prepared SN | 2 |
| Outbound historical SN | 1 |
| Opening Physical Qty | 1,968 |
| Opening Frozen Qty | 4 |
| Reliably rebuildable Prepared orders | 2 |
| Exceptions | 108 |
| Critical exceptions | 5 |

Source checksum: `9A3BF56D4E5B2F03A496EF562A0F206274AFE56BEB7898389BE3B5DD98EBBFDF`.

No database write was attempted. The five blocking conflicts are:

1. SN `60HG602R57MD009` belongs to SKU `30-132-60225-B0`, while Product Master explicitly classifies that SKU as `Material` and not reportable machine stock.
2. `FLEX-01 / 97-229-00021-00 / New` has Physical 7 but only 6 physically present SNs in the snapshot.
3. The same grain has Frozen 1 but zero Prepared SNs.
4. `FLEX-01 / 30-132-50225-B0 / Repair_Good` has Physical 5 but only 4 physically present SNs.
5. The same grain has Frozen 1 but zero Prepared SNs.

These are source conflicts, not values the migration is allowed to guess. Production cutover remains blocked until warehouse/BA owners correct or explicitly reconcile the authoritative sheets, after which a new Dry Run must report zero critical exceptions.

## Production deployment sequence

1. Create a dedicated Production PostgreSQL database with backup/PITR policy.
2. Configure Vercel Production-only variables: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `APP_ENV=production`, `DATABASE_ENV=production`, `NEXT_PUBLIC_APP_ENV=production`, `NEXT_PUBLIC_DEMO_MODE=false`, `DEMO_MODE=false`, `ERP_ADAPTER=mock`.
3. Keep Preview credentials scoped to Preview and pointing only to a non-production database.
4. Run `prisma migrate deploy` against Production.
5. Provision at least one active audit user/role through the approved access-control process.
6. Re-export the authoritative tabs and run Dry Run plus database inspection.
7. Obtain business sign-off on zero critical exceptions and checksum.
8. Run the cutover once with `ALLOW_SYDNEY_CUTOVER=true`.
9. Deploy Production and smoke-test inventory totals, SN lookup, Prepared, outbound and atomic Move.
10. Refresh/redeploy and verify the same PostgreSQL evidence remains.

Do not promote the current source snapshot or label the system Production Ready while the five critical exceptions remain.
