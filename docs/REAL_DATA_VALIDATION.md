# Real Data Validation

Validated 2026-07-29 against the cleaned Sydney migration workbook and the seeded Vercel Preview PostgreSQL database.

## Source

- File: `SYD仓库库存管理表_20260729_WMS迁移清洗版.xlsx`
- SHA-256: `E54E90578A1AA8C01C90CE0B7AB9BB39F05993533A85F7369806329BB7B409B9`
- Cutover: `2026-07-29T12:30:00.000Z`
- Migration batch: `cms62f4o2000104l3mw9d8wpd`
- Excluded evidence rows: 46

The analyzer found 164 accepted ledger rows, 96 products, 136 locations, 76 Current Stock grains, 20 known SN, 13 outbound orders, 13 pickup batches and two repair items.

## Actual post-seed parity

| Measure | Evidence |
| --- | --- |
| Product master | 96 database/UI rows |
| Added Material SKUs | Both present |
| Location master | 136 database/UI rows |
| Current Stock | 76/76 MATCH |
| Known SN | 20/20 MATCH |
| Active workflow | 12 active SH and 1 Outbound SH |
| Pickup batches | 13 |
| Repair queue | 2 |
| Legacy serial gaps | 47 stock grains, explicitly classified |

The post-seed reconciliation produced 176 MATCH, 0 Critical, 6 High, 23 Medium and 47 Low rows. The six High rows are source rows with blank Item Type and were retained as diagnostics rather than blocking valid entities.

## UI verification

Real Sydney values were inspected in Current Stock, Product master, Location master, Outbound and Repair. `SH-2607-00175722` displays two independent SKU lines and four real serial allocations. Routine bulk assignment refreshes only the selected order detail; it no longer reloads the application.

## Remaining validation boundary

Bulk registration was transactionally and capacity-tested with synthetic automated fixtures. It was not exercised by adding fabricated SN to the real Shadow database. A warehouse-provided batch of unused physical SN is required for that production-like operational acceptance step.

Full evidence and counts are in `docs/REAL_SHADOW_MIGRATION.md`.
