# Reconciliation

Reconciliation is read-only. It compares a semantic workbook/export projection with database balances by warehouse, SKU, condition, physical location and optional container. Outcomes are match, missing in WMS, missing in ledger, quantity difference, condition difference and location difference.

Serial outcomes are `SN_MISSING_IN_WMS`, `SN_WRONG_LOCATION`, `SN_WRONG_CONDITION` and `SN_STATUS_MISMATCH`. A known historical incomplete record may be classified `LEGACY_TRACEABILITY_GAP`; otherwise it is `CURRENT_OPERATIONAL_ERROR`.

For each serial-tracked balance, Physical Qty is compared with SNs at the same product, warehouse, location and condition. In_Stock, Prepared and Repair count as physically present; Outbound, In_Transit and Scrapped do not. Results are `SERIAL_COUNT_MATCH`, `SERIAL_COUNT_SHORTAGE` or `SERIAL_COUNT_EXCESS`.

Known legacy aggregate shortages may be Low-severity `LEGACY_TRACEABILITY_GAP`. Excess SNs and unmarked shortages are High-severity `CURRENT_OPERATIONAL_ERROR`. Snapshot diagnostics are read-only and use deterministic IDs, so they are not persisted repeatedly.

Workbook helper columns, formulas, concatenated keys and display-only occupancy placeholders are not source fields. No result posts an adjustment. Operators investigate and, when appropriate, use a new controlled correcting transaction.
