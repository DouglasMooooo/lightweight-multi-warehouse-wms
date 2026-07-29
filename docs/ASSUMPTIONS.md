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

## Sprint 3.6 real-data observations

- The latest fixture checksum is `84402AAD17583540AC2758DADFFA5AE27E50A50885A5CD141AF456952B8AE293`; it supersedes the older Sprint 3 inspection checksum for this validation only.
- Thirty-nine ledger rows contain literal `Item type not found`, and seven additional business rows have blank Item Type after display-only exclusions. They are rejected; Product or Material is not inferred from SKU/model.
- Seventeen Outbound actions lack `Outbound_Date`. They remain reference evidence and do not create an invented physical dispatch timestamp.
- Weekly/monthly date-only values follow `Australia/Sydney`; observed Google Sheet `America/Los_Angeles` metadata is not inherited.
- Vercel Preview functions are currently configured for `iad1` while the Neon Preview database is in Sydney. This mismatch is documented and must not be changed in production without a controlled comparison.

## Sprint 4 operational hardening decisions

- Faulty receiving preserves a known serial identity. A known WMS serial is automatically receivable only when its current lifecycle proves it is physically outbound; physically present, Prepared, Repair or otherwise ambiguous statuses require Manual Review so receiving cannot double-increase Physical Qty.
- An unknown faulty serial can be registered only when ERP or explicit operator input identifies the SKU. ERP misses without an identified SKU remain Manual Review; the system never guesses from the serial text.
- Native repair completion remains valid only from `In_Repair` and must use the normal RepairJob lifecycle. Bulk legacy Repair-Good recognition rejects an active normal RepairJob, requires an explicit reason, and never fabricates an unknown serial number.
- Bulk operations use a UUID-backed human-readable batch reference. It is traceability for inbound, faulty receipt and audit, not a new generic batch-management subsystem.
- Bulk New Inbound creates one high-level inventory transaction and audit operation with all supplied serial identities. Bind Existing Stock creates identities only and cannot increase Physical Qty.
- The IAD1/SYD1 A/B test used isolated Vercel Preview deployments and read-only requests. Production was not changed. The dedicated Preview database remained the data source, and no shadow migration was rerun.
- Preview functions are now explicitly configured for `syd1`, matching the Sydney Neon Preview database. This is a Preview evidence-based change, not authorization to change Production.
