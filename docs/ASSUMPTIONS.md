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
