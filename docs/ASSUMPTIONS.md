# Assumptions and Workbook Conflicts

The validated Sydney workbook was inspected as read-only business evidence.

- Workbook `Prepared` rows leave Current_Qty unchanged. Sprint 1 preserves that rule and adds database Frozen reservations required by the specification.
- The workbook calculates current stock through formula/helper columns and concatenated logical keys. Sprint 1 replaces these with relational balances, constraints and transactions; helper columns are not domain fields.
- The workbook records Move as source/destination effects. Sprint 1 models one atomic Move transaction and requires selected SNs for serial-tracked Product moves to avoid ledger drift.
- Workbook guidance says SN is mandatory mainly for confirmed Product Outbound and Return_to_Repair, while aggregate opening examples can be partial. Sprint 1 follows the stricter specification for unit-level outbound/transfer/move integrity and keeps partial seed reconciliation diagnostic-only.
- Workbook guidance treats ERP SH_No as the official business reference and discourages extra operator-facing IDs. Database IDs are internal relational identifiers; SH No and transfer number remain business references.
- For Preview simplicity, in-transit quantity remains on the source balance while Physical is removed. This does not mean the unit is physically at the source. A transfer-level in-transit ledger is recommended later.
- The workbook's Current Stock may expose SN-level formula grain. Sprint 1 separates aggregate balances from the first-class SN ledger and reconciles them diagnostically.

## Sprint 2 workbook conflicts and mappings

- The inspected workbook currently has `Date` but no semantic `Outbound_Date` field in its main transaction table. Sprint 2 follows the explicit specification: `StockTransaction.recordedAt` is the database record time, `effectiveAt` is the operation time, and `OutboundOrder.outboundAt` is the actual dispatch time.
- Workbook guidance overloads `Prepared`: some work-order import guidance allows a Prepared row with unknown location/SN, while operational Prepared rows also contain real locations and sometimes SNs. The WMS intentionally maps these to different states: ERP import → `Pending_Allocation`, physical source selection → `Allocated`, picked stock → `Prepared`/`Ready_for_Pickup`. Only the last step increases Frozen.
- The workbook uses one row per unit for serial-tracked product quantities. The WMS retains one order line with Qty N and relational allocations/SN assignments.
- Workbook historical repaired-good recognitions use `Adjustment_In`, including examples where the original faulty record or SN is unavailable. Native WMS repair completion uses `RepairJob` and preserves the known serial. Only controlled historical recognition uses `RepairGood_Adjustment_In`, marked `Legacy_Manual`, without inventing a RepairJob or SN.
- Workbook batch-label guidance aggregates rows for an SH. The current specification extends the physical concept to one Pickup Code across multiple SH documents. The WMS therefore aggregates a `PickupBatch` by SKU + Model + ERP Warehouse and retains different ERP warehouses as separate rows on one A4 label.
- Reporting helper columns (`Unique_SH_Action_Flag`, `Outstanding_Return_Flag`, `Report Machine Flag`, `Report Group`) are not persisted transaction helpers. Queries count distinct SH, correlate returns, and read reporting scope from Product master fields.
- Until an explicit cutover is approved, the workbook remains the operational production reference and the WMS remains a read-only-to-spreadsheet shadow system. Reconciliation reports differences but never overwrites either source.
