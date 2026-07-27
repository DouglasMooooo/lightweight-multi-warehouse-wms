# Assumptions and reference conflicts

The workbook was inspected as operational evidence and remains unmodified.

## Confirmed workbook evidence carried forward

- Prepared has no physical stock effect.
- Move balances source and destination.
- Return_to_Repair normally enters `REPAIR-01`.
- Physical location is separate from ERP warehouse selection.
- Current stock is derived, never manually entered.
- Mixed containers retain one row per member SKU.
- Controlled no-SKU `Unmonitored material` Adjustment_In exists.
- New, Repair_Good, Repair and Material are operationally distinct.

## Specification takes precedence

1. The workbook calculates current stock with formulas and concatenated helper keys. The application uses `InventoryBalance`, relational columns and database constraints.
2. The workbook records Prepared without changing Current_Qty but only exposes a calculated Frozen_Qty. The application makes frozen quantity a first-class balance.
3. The workbook’s SN rule requires SN mainly for confirmed Product Outbound and Return_to_Repair. The specification’s per-product `serialTrackingRequired` rule also governs inbound and transfers.
4. The workbook says SH_No is the main official reference and discourages extra operator-facing case IDs. The database still uses internal relational IDs; SH No remains the visible business reference.
5. The workbook stores pickup codes on ledger rows. The application stores pickup code on `OutboundOrder` and uses `PickupSequence` for concurrency safety.
6. The workbook is Sydney-only and has no warehouse dimension. The application adds Warehouse to every relevant relation for MEL/BNE expansion.
7. The workbook formula implements Move using helper source quantity/key columns. The application uses one atomic native Move operation.
8. The workbook classifies a fixed set of nine models as Product. The application treats Product/Material as governed master data and does not hard-code model lists in UI.
9. The workbook allows opening and ordinary quantity stock without SN. This remains valid where the Product master does not require unit traceability for that operation.
10. Weekly/monthly repair reporting and the 2026-07-20 cutover are historical spreadsheet workflows and are not implemented in Preview v0.1.

## Validation needed

- Confirm whether standard inbound must always capture every SN for all current Product SKUs.
- Confirm the production ERP warehouse labels and whether mappings vary by physical warehouse.
- Confirm whether Repair completion should be its own transaction type or a controlled paired adjustment in the first production release.
- Confirm pickup sequence reset policy, if any, per warehouse/year.
- Confirm stocktake approval thresholds and transfer overdue duration.
