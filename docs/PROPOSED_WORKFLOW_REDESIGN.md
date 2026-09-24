# Proposed WMS Workflow Redesign v1

Status: **Proposal for first-round leadership discussion; not an implementation specification or delivery commitment.**

This proposal concerns WMS workflow redesign. ERP remains the source of business documents; WMS focuses on warehouse execution, SN traceability, physical location, task workflow, audit and exception handling. It does not propose replacing ERP or redesigning ERP as a whole.

## Current prototype and proposed next state

The current browser Preview uses demo state; configuring PostgreSQL does not wire the browser workflows to database persistence. The repository provides InventoryBalance, SerialNumber, StockTransaction, Location, outbound, Prepared/Frozen, faulty-return, Transfer, audit, exception and ERPAdapter foundations. Mock ERP behaviour is not a live ERP integration.

| Area | Current prototype baseline | Proposed next-state workflow |
| --- | --- | --- |
| Outbound | Allocation, Prepared/Frozen, pickup code, batch label, SN scan and dispatch; preparation can already set `Ready_for_Pickup` before SN scanning. | Suggested location, mobile/PDA location QR and SN validation before preparation confirmation, then routing to logistics or engineer pickup. |
| Pickup | Demo Supervisor identity and outbound dispatch flow. | Company/Ruiyun-authenticated engineer pickup linked to an after-sales order, or driver pickup-order input/scan, with an auditable pickup record. |
| Faulty receiving | Single-SN mock ERP lookup and receipt to SYD `REPAIR-01`. | Bulk SN input/upload, WMS history and original ERP SH lookup, replacement relation matching and operator-confirmed receiving location. |
| Transfer | SYD → MEL Transfer Out/In updates balances and SN state using the transfer's stored SN list. | Send-side and receive-side physical SN scans against one shared Transfer ID and expected SN list. |
| Repair completion | Explicit Repair Completion remains backlog work; the documented Preview approach is a controlled adjustment. | Same-warehouse Repair → Repair_Good conversion, with one SN scan and target good-stock location confirmation. |
| Locations and reporting | Location model, demo layout, operational cards, audit and exceptions. | Database-driven operational map, structured periodic reporting and later AI-assisted analysis. |

The sections below describe **proposed next-state behaviour**, including extensions to existing foundations. They do not assert that these end-to-end workflows are implemented.

## Principles retained

- ERP remains the source of business documents, including original SH and after-sales order references.
- WMS owns warehouse execution, SN traceability, physical location, task workflow, audit and exception handling.
- `InventoryBalance` is quantity authority, maintained by controlled operations and reconciled to the immutable `StockTransaction` ledger.
- `SerialNumber` provides identity traceability; it is not the quantity source of truth. SN counts must not replace balance quantities.
- Prepared increases Frozen Qty without reducing Physical Qty. Pickup codes and labels do not change inventory.
- A confirmed physical warehouse event commits before ERP write-back. ERP failure becomes a visible exception with retry/manual review, never a silent rollback of physical execution.
- Important state changes require audit records. Unknown SKU, SN, location or ERP results must not be guessed.

## Proposed outbound workflow

1. Load the ERP business document and replacement-unit requirements; faulty-unit details must not become replacement allocation data.
2. Suggest an eligible physical location using warehouse, SKU, condition and Available Qty. The worker must verify the actual location.
3. Generate the pickup code and batch labels linked to the order/preparation task, without changing inventory.
4. The worker uses mobile/PDA to scan the location QR and required SNs. Validate location, SKU, condition, status, uniqueness and required quantity; route mismatches to an exception.
5. Confirm preparation after successful validation and update the task/order to Ready for Pickup when all required units are prepared. Retain Physical Qty and increase Frozen Qty through the controlled preparation operation. This scan-before-confirmation sequence is a proposed change to the current Preview sequence.
6. Route the prepared task to logistics pickup or engineer self-pickup.
7. Confirm physical pickup, generate its audit record and trigger downstream WMS order/task, inventory and SN status updates. Where pickup is the final dispatch event, reduce Physical and Frozen quantities and mark the SNs Outbound once; prevent a separate dispatch action from posting the same movement again.
8. Queue the corresponding ERP/after-sales status write-back after the physical event commits. Show Pending/Failed status and retry exceptions without undoing the pickup.

## Proposed Identity Pickup / Digital Pickup

- Engineer self-pickup requires company/Ruiyun identity authentication and authorization linked to the relevant after-sales order. The current Demo Supervisor context does not satisfy this requirement.
- A logistics driver can identify the pickup by entering or scanning the pickup order number. Validate the order and its readiness before confirming the physical handover; an order number alone is not engineer identity authentication.
- Each confirmation should generate an auditable pickup record containing the order/after-sales reference, pickup code, pickup route, collector identity or driver details, confirming actor, timestamp and handed-over SNs/quantities.
- Repeated confirmation must reference the existing result rather than duplicate inventory or downstream status updates. Identity, order and handover mismatches go to visible exceptions.
- Identity integration, driver verification and downstream status mapping require design agreement; none is claimed as a completed production integration.

## Proposed faulty receiving workflow

1. Accept bulk SN input or upload and validate each entry, retaining a per-SN result.
2. Look up WMS history and the original ERP SH through the adapter boundary.
3. Identify SKU, model and the original/faulty/replacement relationship from those records. Do not infer missing values or use replacement details as the faulty item's identity.
4. Require the operator to confirm the actual receiving warehouse and physical location, for example `REPAIR-01` (Repair-01), even when lookup succeeds.
5. Confirm valid physical receipts through controlled balance, SN, transaction and audit updates into Repair stock, then queue any ERP write-back.
6. Route unknown SNs, duplicates and status mismatches to exceptions/manual review. Keep unresolved entries visible rather than silently accepting, dropping or guessing them.

## Proposed Transfer versus Repair-to-Good

| Rule | Cross-warehouse Transfer | Repair → Repair_Good |
| --- | --- | --- |
| Purpose | Physical movement between different warehouses. | Condition conversion within the same warehouse; not Transfer. |
| Operator confirmation | Send-side SN scan and destination receive-side SN scan. | One SN scan plus target good-stock location confirmation. |
| Shared reference | Create one Transfer ID and expected SN list, then reuse them at dispatch and receipt. | Record a repair-completion operation and its audit reference. |
| Validation | Destination scans the physically received SNs for Expected vs Actual comparison; the stored list is not proof of receipt. Missing, unexpected, duplicate or mismatched SNs become exceptions. | Validate the unit is in Repair and the target is an eligible good-stock location in the same warehouse. |
| Inventory effect | Retain Transfer Out/In and In Transit semantics for confirmed movements. | Decrease Repair and increase Repair_Good through one controlled conversion, preserving total physical quantity and SN identity. |

The transfer reference and expected list must not be recreated at the receiving warehouse. Repair conversion must not create an artificial inter-warehouse shipment or add good stock without removing the corresponding Repair quantity.

## Proposed location database and visual map direction

- Locations should be database-driven master data. The map is an operational visualization of location and inventory records, not a fixed hard-coded drawing.
- Future location types are Fixed, Flexible, Temporary and Virtual. These are proposed business categories, not a claim about current schema support.
- Users should be able to click a location and inspect SKU, SN, quantity and status. Show quantities from `InventoryBalance` and identity details from `SerialNumber`.
- Virtual locations must be clearly identified and must not substitute for confirming a real physical receiving or pickup location.
- This proposal does not change the database schema or implement the map.

## Future reporting and AI

Structured order, SN, location, task, exception and audit data should enable automated weekly/monthly operational reports with traceable source records.

A future AI agent could answer management questions and help analyze exceptions using that data. AI assistance is outside the MVP critical path and must not become quantity authority or silently change warehouse records.

## Scope and decisions for leadership

The first-round discussion should confirm workflow priorities, identity/order linkage, pickup-to-downstream status mapping and exception ownership. Delivery sequencing and acceptance criteria remain to be agreed; this proposal does not promote these ideas to committed next-sprint work.

This is a documentation-only proposal. No business code, database schema or existing demo reports are changed. See [current workflows](WORKFLOWS.md), [business rules](BUSINESS_RULES.md) and the [existing backlog](BACKLOG.md) for the baseline and separately tracked work.
