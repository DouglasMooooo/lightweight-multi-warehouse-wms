# Assumptions and Workbook Conflicts

The validated Sydney workbook was inspected as read-only business evidence.

- Workbook `Prepared` rows leave Current_Qty unchanged. Sprint 1 preserves that rule and adds database Frozen reservations required by the specification.
- The workbook calculates current stock through formula/helper columns and concatenated logical keys. Sprint 1 replaces these with relational balances, constraints and transactions; helper columns are not domain fields.
- The workbook records Move as source/destination effects. Sprint 1 models one atomic Move transaction and requires selected SNs for serial-tracked Product moves to avoid ledger drift.
- Workbook guidance says SN is mandatory mainly for confirmed Product Outbound and Return_to_Repair, while aggregate opening examples can be partial. Sprint 1 follows the stricter specification for unit-level outbound/transfer/move integrity and keeps partial seed reconciliation diagnostic-only.
- Workbook guidance treats ERP SH_No as the official business reference and discourages extra operator-facing IDs. Database IDs are internal relational identifiers; SH No and transfer number remain business references.
- For Preview simplicity, in-transit quantity remains on the source balance while Physical is removed. This does not mean the unit is physically at the source. A transfer-level in-transit ledger is recommended later.
- The workbook's Current Stock may expose SN-level formula grain. Sprint 1 separates aggregate balances from the first-class SN ledger and reconciles them diagnostically.
