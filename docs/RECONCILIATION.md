# Reconciliation

Reconciliation is read-only. It compares a semantic workbook/export projection with database balances by warehouse, SKU, condition, physical location and optional container. Outcomes are match, missing in WMS, missing in ledger, quantity difference, condition difference and location difference.

Serial outcomes are `SN_MISSING_IN_WMS`, `SN_WRONG_LOCATION`, `SN_WRONG_CONDITION` and `SN_STATUS_MISMATCH`. A known historical incomplete record may be classified `LEGACY_TRACEABILITY_GAP`; otherwise it is `CURRENT_OPERATIONAL_ERROR`.

Workbook helper columns, formulas, concatenated keys and display-only occupancy placeholders are not source fields. No result posts an adjustment. Operators investigate and, when appropriate, use a new controlled correcting transaction.
