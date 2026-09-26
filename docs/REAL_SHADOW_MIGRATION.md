# Real Shadow Migration

## Executed batch

The cleaned Sydney workbook was seeded into the dedicated Vercel Preview Neon PostgreSQL database on 2026-07-29. Production was not targeted.

| Evidence | Value |
| --- | --- |
| Source file | `SYD仓库库存管理表_20260729_WMS迁移清洗版.xlsx` |
| SHA-256 | `E54E90578A1AA8C01C90CE0B7AB9BB39F05993533A85F7369806329BB7B409B9` |
| Cutover | `2026-07-29T12:30:00.000Z` / 22:30 Sydney |
| Import batch | `cms62f4o2000104l3mw9d8wpd` |
| Audit reference | `SHADOW:cms62f4o2000104l3mw9d8wpd` |
| Deployment commit | `7b9f949346b9636d00acf072ca538a6f08d3bcd8` |

The source workbook was read only. Its Open XML namespace prefixes were normalized in memory for ExcelJS compatibility; the original bytes and checksum were not changed.

## Database counts

The controlled Preview replacement removed the small demo operational dataset and imported valid workbook entities. Users, roles and warehouse identities were retained.

| Entity | Before | After |
| --- | ---: | ---: |
| Product | 8 | 96 |
| Location | 11 | 136 |
| InventoryBalance | 4 | 76 |
| Opening StockTransaction | 0 | 76 |
| SerialNumber | 5 | 20 |
| OutboundOrder | 2 | 13 |
| OutboundOrderLine | 3 | 14 |
| PickupBatch | 1 | 13 |
| RepairJob | 0 | 2 |

The Preview UI independently showed 96 product rows, 136 location rows, 12 active SH plus one confirmed Outbound SH, and two Pending Repair jobs. Current Stock displays 49 positive stock grains; the database also retains zero-quantity cutover grains needed for reconciliation, for 76 total balances.

Both cleaned Material master rows migrated:

- `10-105-00346-00`
- `98-012-10639-03`

## Partial migration and excluded evidence

`Migration_Excluded_Rows` contained 46 adjudicated reference rows. They were not written to balances, transactions, serials or repair jobs and were not counted as migration rejections.

Valid entity rows continued even when other ledger rows had issues. The retained diagnostics are:

| Code | Count | Treatment |
| --- | ---: | --- |
| `INVALID_ITEM_TYPE` | 6 | Row not imported; High diagnostic |
| `OUTBOUND_WITHOUT_OUTBOUND_DATE` | 17 | Evidence retained; no timestamp invented |
| `PREPARED_WITHOUT_LOCATION` | 1 | Imported as Pending Allocation |

## Post-seed reconciliation

The same workbook was uploaded again in `DRY_RUN` after the seed.

| Comparison | Result |
| --- | --- |
| Current Stock semantic grains | 76 MATCH / 76, 100% |
| Ledger projection | 76 MATCH / 77; one zero-quantity ledger-only grain |
| Known serials | 20 MATCH / 20, 100% |
| Product serial coverage | 4 exact-count grains; 47 explicit legacy shortages |
| Overall MATCH rows | 176 |
| Critical | 0 |
| High | 6 |
| Medium | 23 |
| Low legacy gaps | 47 |

The one ledger-only difference is SKU `97-229-00018-00`, location `R2-1-5-L`, New, projected quantity zero. Current Stock remains the cutover inventory authority, so no zero-value inventory was reconstructed from historical ledger replay.

## Workflow verification

The real multi-line order `SH-2607-00175722` is present with two independently selectable lines:

- `97-229-00020-00` / CQ6-M: required, allocated and prepared 1; one SN.
- `97-229-00021-00` / CQ6-S: required, allocated and prepared 3; three SNs.

Dispatch eligibility is calculated across every order line. Confirm Outbound remains one business action and the server creates one ERP Sync Job payload containing all lines and serial arrays.

## Bulk SN

Bulk inventory registration now validates the whole batch, registration capacity, duplicates, master data and serial-tracking rules, then revalidates in one Serializable transaction. Registration creates identities only and does not change Physical Qty. Unknown outbound SN can be explicitly selected for Register and Assign when one physical allocated location and capacity are available.

Automated evidence covers 30/30 accepted, 31/30 rejected, 28 existing plus 2 accepted, 28 existing plus 3 rejected, input duplicates and existing duplicates. No synthetic SN was inserted into the real Sydney Shadow dataset because the workbook did not provide unused real serial identities and warehouse rules prohibit fabrication.

## Safety

- `SHADOW_IMPORT_ENABLED`, `SHADOW_IMPORT_REPLACE_ENABLED` and the admin UI gates are Preview-only.
- Production never receives automatic Shadow seed or replacement.
- Demo Reset was disabled after migration so it cannot overwrite the real Shadow dataset.
- Repeating the exact checksum, mode and cutover returns the existing batch and cannot create duplicate Opening inventory.

