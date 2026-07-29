# Assumptions and Workbook Conflicts

The validated Sydney workbook was inspected as read-only business evidence. The repository copy is the 2026-07-28 user-provided workbook with SHA-256 `77135C0C077CCFFBE04AE40A526535A8A925150603A8C39ED49F5300A90836CD`.

- Workbook Prepared rows leave Current Qty unchanged. WMS preserves that rule and adds database Frozen reservations.
- Workbook formula/helper columns and concatenated keys are replaced by relational balances, constraints and immutable transactions.
- Move is one atomic source-to-destination operation. Adjustment remains separate.
- Database IDs are internal; SH No, Pickup Code and transfer number remain business references.
- In-transit quantity currently remains on the source balance after Physical is removed. A transfer-level in-transit ledger is future work.

## Latest workbook conflicts and mappings

- The workbook now includes semantic field `Outbound_Date / 实际出库日`, populated only for actual Outbound. WMS maps it to `OutboundOrder.outboundAt`; `Date` is business/effective time and never substitutes for dispatch. The AI instruction names a different Excel coordinate than the header, so importers must map semantic headers rather than letters.
- Workbook guidance overloads Prepared. Rows without a known physical source map to `Pending_Allocation`; source selection maps to `Allocated`; confirmed picking maps to `Prepared/Ready_for_Pickup`. Only confirmed preparation increases Frozen.
- The workbook splits serial-tracked Qty N into N rows. WMS retains one line with Qty N and relational allocations/SN assignments.
- Historical repaired-good recognitions use `Adjustment_In`, sometimes without original faulty evidence. Native completion uses RepairJob; only controlled historical recognition uses `RepairGood_Adjustment_In`, `Legacy_Manual`, a mandatory reason and no invented job/SN.
- Workbook label guidance aggregates an SH. The explicit specification extends one Pickup Code across several SH documents. WMS groups SKU + Model + ERP Warehouse and keeps different ERP warehouses as separate rows on one A4 label.
- Product master contains Material rows with `Report Machine Flag = Yes`; `reportMachine` cannot be inferred from item type.
- Rows using SKU `坏机`, Qty 99 and a remark that they only display physical-location occupancy are spreadsheet visualisation placeholders. They are excluded from balances, movements and reconciliation truth.
- Historical incomplete original faulty records are classified as legacy traceability gaps. Current discrepancies remain current operational errors.
- Only balances explicitly marked `legacySerialGap` receive legacy shortage classification. The flag does not permit SN registration beyond Physical Qty.
- Returned_Unrepaired means the faulty unit was returned from the repair activity without becoming usable stock. It remains Repair/Repair; `returnedToStockAt` stays null.

Until explicit cutover approval, the workbook remains the production operational reference and WMS is a shadow system. Reconciliation reports differences but never overwrites either source.

## Sprint 3 import observations

- The inspected source checksum remains `77135C0C077CCFFBE04AE40A526535A8A925150603A8C39ED49F5300A90836CD`.
- Current Stock contains formula cells without cached results for some Container, SN and Frozen fields. The importer does not execute formulas; it uses cached scalar results and falls back to a transaction-derived SN projection.
- The snapshot contains rows whose Item Type says `Item type not found`. These are rejected as data-quality issues rather than inferred from SKU or condition.
- Outbound actions without actual `Outbound_Date` remain reference evidence and are not promoted to confirmed dispatch.
- Prepared without a real source location maps to Pending Allocation and does not freeze stock.
- Location Master has no physical warehouse column; this Sydney-specific import requires an explicit/default SYD context. This default does not infer an unknown location.

## Sprint 3.5 presentation and deployment assumptions

- Supported UI locales are `en` and `zh-CN`; no localized value is written to PostgreSQL.
- Language is a workstation/operator preference and does not alter stable operational URLs.
- Warehouse wall-clock input is interpreted using the selected Warehouse `timezone`. The Sydney default is `Australia/Sydney`, including DST.
- Vercel deployments must define `DATABASE_ENV`. Preview/staging with production database metadata is rejected; Production requires `DATABASE_ENV=production`.
- Role-aware navigation uses server-returned permissions for preparation only. API/domain authorization remains the authoritative future enforcement point; this sprint does not claim complete RBAC.
