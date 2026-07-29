# Shadow Import

## Source priority

Explicit WMS business rules win over the workbook. The workbook explains real Sydney examples and remains read-only. Conflicts are recorded in `docs/ASSUMPTIONS.md`.

## Semantic mapping and validation

The server reader accepts only `.xlsx` up to 20 MB and computes SHA-256 before mapping. It locates Product, Location, ledger and Current Stock sheets by semantic names. A scored bilingual alias map resolves fields by header text, not Excel letters, so longer fields such as `Outbound_Date` cannot be mistaken for `Date`. Missing required headers fail clearly.

Whitespace, SKU, SN, location, booleans, dates, item types and conditions are normalized. Unknown master data, invalid types/conditions/quantities, locationless Prepared, Outbound without actual dispatch date and faulty returns without SN are reported. Qty-99 rows explicitly marked as occupancy displays are excluded.

## Modes

- `DRY_RUN`: produces mapped rows, current-view and ledger-derived projections, active workflow projections, issues and reconciliation. It has no inventory writes.
- `SHADOW_SEED`: requires non-production and `SHADOW_IMPORT_ENABLED=true`. It imports valid entities independently, retains invalid rows as diagnostics and uses the current snapshot as Opening evidence rather than replayed history. Replacing existing Preview operational data additionally requires an explicit UI selection and `SHADOW_IMPORT_REPLACE_ENABLED=true`.

The checksum + mode + cutover key is deterministic. The database unique constraint makes a repeated seed identifiable without adding stock twice. `Migration_Excluded_Rows` is reference evidence only and never becomes inventory or a rejected-row count.

## Active work

Prepared without location becomes Pending Allocation. Product unit rows aggregate into one WMS order line while retaining SN assignments. Shared Pickup Code creates one batch and label groups remain SKU + Model + ERP Warehouse. Known repair SNs are preserved; legacy Repair_Good adjustments never fabricate native RepairJobs.

## Time and pilot boundary

Operators select the cutover using Sydney warehouse business time; the API stores the resulting instant safely. During the shadow pilot, daily warehouse work remains in the workbook, WMS is mirrored/reconciled, discrepancies are reviewed, and neither ERP nor workbook write-back is enabled. Production authority transfer needs separate approval.
