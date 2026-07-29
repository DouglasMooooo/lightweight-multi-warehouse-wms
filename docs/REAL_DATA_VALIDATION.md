# Real Data Validation

Tested 2026-07-29 in Sydney warehouse time. The source workbook remained read-only and its private test copy is Git ignored.

## Fixture

- Filename: `SYD仓库库存管理表_20260727_ERP更新版.xlsx`
- Private copy: `tests/fixtures/private/syd-live-snapshot.xlsx`
- SHA-256: `84402AAD17583540AC2758DADFFA5AE27E50A50885A5CD141AF456952B8AE293`
- Size: 484,159 bytes
- CLI cutover: `2026-07-29T21:00:00+10:00`
- Business timezone: `Australia/Sydney`; workbook/Google Sheet timezone metadata is not authoritative.

Stock Transaction Log, Current Stock Detail, Product Master, Location Master, Repair Weekly Input, both AI skill sheets, Weekly Report and Monthly Report were inspected structurally and visually. The source was opened read-only and never saved.

## Analyzer Results

| Measure | Count |
| --- | ---: |
| Ledger candidate rows | 216 |
| Accepted ledger rows | 160 |
| Warning rows | 28 |
| Rejected rows | 46 |
| Intentionally ignored display rows | 10 |
| Product master rows | 94 |
| Location master rows | 136 |
| Current Stock projected rows | 74 |
| Ledger projected balance rows | 75 |
| Known Current Stock SN rows | 2 |
| Mapped outbound SH | 13 |
| Pickup batches | 13 |
| Repair items | 2 |

The workbook has larger formatted/formula used ranges (992 ledger rows and 1,000 Current Stock rows). Analyzer counts represent semantic data rows, not formatted blanks/helpers.

## PostgreSQL DRY_RUN

The real workbook ran in Compare Only mode against the dedicated Vercel Preview PostgreSQL reference. No inventory was seeded or changed.

### Current Stock

| Result | Count |
| --- | ---: |
| MATCH | 1 |
| MISSING_IN_WMS | 71 |
| MISSING_IN_LEDGER | 1 |
| QTY_DIFFERENCE | 2 |
| CONDITION_DIFFERENCE | 0 |
| LOCATION_DIFFERENCE | 0 |

The result set contains 74 workbook rows plus one WMS-only row.

### Ledger projection

| Result | Count |
| --- | ---: |
| MATCH | 1 |
| MISSING_IN_WMS | 72 |
| MISSING_IN_LEDGER | 1 |
| QTY_DIFFERENCE | 2 |

### Serial numbers

| Result | Count |
| --- | ---: |
| Known serial rows | 2 |
| SN matches | 0 |
| Missing in WMS | 2 |
| Wrong location | 0 |
| Wrong condition | 0 |
| Status mismatch | 0 |
| Serial count match | 2 |
| Serial count shortage | 49 |
| Serial count excess | 0 |

Overall Preview reconciliation: 4 Match, 0 Critical, 74 High, 414 Medium and 0 Low. Major categories include 87 unknown SKU, 128 unknown location, 46 invalid item type, 17 Outbound without Outbound Date, 49 serial-count shortage, 6 report-metadata mismatch and 1 model mismatch. These reflect the small Preview/demo reference and were not coerced.

## Workflow Findings

| Pattern | Count |
| --- | ---: |
| Active SH | 12 |
| Pending Allocation | 1 |
| Prepared | 11 |
| Outbound with actual date | 1 |
| Repair items | 2 |
| Repair_Good legacy recognition | 0 |
| Scrap | 0 |
| Active transfers | 0 |
| Product rows with SN | 21 |
| Product rows without SN | 79 |
| SH with multiple SN rows | 4 |
| Repeated SKU under same SH | 3 |
| Prepared Product rows with SN | 18 |
| Outbound Product rows with SN | 1 |
| Repair Product rows with SN | 2 |

Allocated and Ready for Pickup are not independently reconstructable from this workbook snapshot; Prepared/pickup-code evidence is preserved instead.

## Rejected and Downgraded Patterns

| Source/pattern | Business meaning | Treatment | Classification |
| --- | --- | --- | --- |
| `Item type not found` (39) | Formula/lookup could not identify Product or Material | Rejected; WMS does not invent type | Invalid workbook data |
| Blank Item Type after display exclusions (7) | Business row lacks required type | Rejected | Incomplete workbook data |
| Outbound without `Outbound_Date` (17) | Actual physical time absent | Kept as reference; no time invented | Workflow warning |
| Prepared without source location (1) | Physical allocation unknown | `Pending_Allocation` | Supported workflow |
| Qty 99 display occupancy (10) | Layout helper, not stock truth | Intentionally ignored | Spreadsheet-only pattern |

No evidence showed a new legitimate stock movement that the domain cannot represent. Most parity gaps are absent Preview master/stock data, not mapper defects. Parsing was not relaxed to improve match rate.

## Shadow Seed Decision

`SHADOW_SEED` was not executed. Preview seed is disabled and the workbook has 46 High rejections, so a seed is unsafe and correctly refused. A future seed requires corrected item types, an explicitly enabled non-production environment, empty shadow inventory and a clean analysis.

## Known Legacy Gaps

- Only two positive Current Stock rows carry SN evidence; 49 product grains show serial-count shortage.
- Many live SKUs/locations are absent from the small Preview database.
- Historical Outbound without actual date cannot establish dispatch time.
- Weekly/monthly sheets are reporting evidence, not inventory authority.
- Date-only values follow Sydney business rules; observed `America/Los_Angeles` Google Sheet metadata is ignored.

Recommended corrections are to fix missing/invalid Item Type at source, populate Outbound Date only from confirmed evidence, stage validated masters before seed, and preserve legacy SN shortages as explicit traceability gaps.
