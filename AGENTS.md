# WMS engineering rules

This repository is a real operational Warehouse Management System Preview based on the validated Sydney ledger workflow. It is not a generic CRUD inventory demo.

## Non-negotiable rules

- Inventory correctness is more important than visual shortcuts.
- Never invent warehouse data, SKU, serial number, physical location or ERP result.
- Never silently edit historical stock transactions. Correct mistakes with a new correcting transaction.
- `Prepared` creates frozen inventory and does not reduce physical quantity.
- `Move` and `Adjustment` are different. Move is one atomic source-to-destination operation.
- Cross-warehouse movement uses `Transfer`, never normal Move.
- Serial number is a first-class relational entity.
- ERP access belongs behind `ERPAdapter`; do not put vendor-specific logic in domain services.
- All important state changes require an audit record.
- Confirmed physical operations survive ERP write-back failure; expose a retryable exception.
- Business logic stays outside React UI components.
- Current inventory comes from controlled balance updates, reconciled to the immutable transaction ledger.
- Never modify `reference/SYD_WMS_current_reference.xlsx`.
- Map workbook columns by semantic header, never by a hard-coded Excel coordinate.
- Spreadsheet occupancy placeholders (for example Qty 99 rows marked as display-only) are not inventory.
- Actual outbound reporting uses `outboundAt`, never import, creation or preparation time.
- Product reporting eligibility comes from `reportMachine`; it is independent of Product/Material item type.
- Native Repair completion is valid only from `In_Repair`.
- `Returned_Unrepaired` stays in Repair status/condition and is never allocatable stock.
- Serial registration binds identity to existing Physical Qty and never increases inventory.
- Use the shared physically-present SN policy for capacity checks and reconciliation.
- Physically present SN statuses include `Scrapped`; allocatability is a separate, stricter policy.
- Shadow workbook imports are server-side, semantic-header based, checksum-idempotent and never automatic in production.
- Domain/database codes are never translated. English and Simplified Chinese exist only in the presentation layer.
- Business dates are interpreted and displayed in the selected warehouse timezone, never implicitly in the browser timezone.
- Preview/staging deployments must never connect to a production database; environment metadata is mandatory on Vercel.
- Scanner-first fields submit on Enter, prevent rapid duplicates, preserve context on errors and restore focus.
- Run tests, typecheck, lint and the production build before completing changes.

## Sydney rules

1. Replacement outbound data comes from ERP Replacement Unit Information, not Faulty Unit Information.
2. Prepared does not reduce Physical Qty.
3. Prepared increases Frozen Qty.
4. Product Qty N may require N unit/SN allocations.
5. Product outbound must have required SN before final dispatch.
6. Move is one transaction with source decrement and destination increment.
7. Adjustment is different from Move.
8. New and Repair_Good are separate inventory conditions.
9. ERP warehouse and physical warehouse location are separate concepts.
10. Physical location must be known before final outbound.
11. Never guess SKU, SN or physical location.
12. Faulty SN receiving remains traceable when some ERP data is unavailable.
13. Label generation never modifies inventory.
14. Pickup code generation never modifies physical inventory.
15. ERP write-back failure never silently undoes a confirmed physical operation.
16. A workbook Prepared row without a known physical source is Pending Allocation, not frozen inventory.
17. Legacy traceability gaps must be distinguished from current operational reconciliation errors.
18. `returnedToStockAt` means return to usable stock and is set only for Repair_Good.

Read `docs/BUSINESS_RULES.md` and `docs/ASSUMPTIONS.md` before changing inventory, outbound, Move, SN, repair-return, Prepared/Frozen, label or transfer behaviour.
