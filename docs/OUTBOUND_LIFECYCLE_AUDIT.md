# Outbound Lifecycle Audit — 2026-08-01

## Normal operator flow simplification — 2026-08-02

The prior correction made readiness authoritative but left the historical allocation, quantity-preparation and SN-commit commands visible as separate ordinary actions. The database could protect each command, but a client interruption between commands could still leave a valid yet operationally incomplete intermediate record.

New and clean orders now use one server-side Serializable transaction:

`ERP order → Confirm Preparation (location + exact quantity + required SNs) → Awaiting Pickup → Confirm Dispatch → ERP sync`

Confirm Preparation validates order/line state, active source location, condition, available Physical stock, exact serial quantity, SN identity/SKU/condition/warehouse/location/status and competing assignments. It then creates prepared allocation evidence, binds and marks SNs Prepared, increases Frozen without changing Physical, updates quantities, writes ledger/audit evidence, generates the Pickup Code when the whole order is complete and promotes automatically. Multi-line orders remain Partially Prepared until the final line succeeds.

Awaiting Pickup keeps the preparation-assigned location and SNs read-only. Confirm Dispatch reuses those relations and performs no second scan. Raw `Prepared`/SN Pending remains only an exception presentation for legacy incomplete evidence.

`DEMO-OUTBOUND-001` is a guarded Preview-only synthetic fixture. Its creator requires explicit permission and Preview environment metadata, refuses partial fixtures, preserves any existing lifecycle state on rerun, and never dispatches the order.

## Root cause

The database-backed `prepareOutbound` command promoted an order to `Ready_for_Pickup` after prepared quantities reached demand, without requiring complete authoritative SN relations for serial-tracked lines. Presentation and query code also grouped raw `Prepared` together with `Ready_for_Pickup`, while the detail UI kept the SN scanner active for both. The result was an Awaiting Pickup queue that could still ask the operator to complete SN work.

## Current Preview read-only evidence

URL audited: `https://syd-wms-preview-ddmdmcgc3-douglas-mos-projects.vercel.app/`

The old Awaiting Pickup filter exposed 11 raw `Prepared` orders. Detail inspection found no missing SN evidence: 12 serial-tracked lines contained 18 required units, 18 prepared units and 18 assigned SN relations.

| SH | Required | Prepared | Assigned SN relations | Result |
|---|---:|---:|---:|---|
| SH-2607-00175010 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |
| SH-2607-00175722 | 1 + 3 | 1 + 3 | 1 + 3 | Both lines complete; raw `Prepared` |
| SH-2607-00161558 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |
| SH-2607-00168454 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |
| SH-2607-00174586 | 4 | 4 | 4 | Complete evidence; raw `Prepared` |
| SH-2607-00170883 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |
| SH-2607-00172594 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |
| SH-2607-00175011 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |
| SH-2607-00175008 | 2 | 2 | 2 | Complete evidence; raw `Prepared` |
| SH-2607-00168887 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |
| SH-2607-00174080 | 1 | 1 | 1 | Complete evidence; raw `Prepared` |

This was a read-only browser audit of database-backed pages. No dispatch, preparation, SN replacement, reset, reseed or database mutation was performed. Raw SN values are intentionally omitted from this document; existence/count was checked through the relational detail view.

## Corrected lifecycle

| Raw domain status | Operator stage | Entry criterion | Primary next action |
|---|---|---|---|
| `Imported`, `Pending_Allocation`, `Allocated` | To Prepare | Demand imported; location/preparation incomplete | Allocate / prepare |
| `Partially_Prepared` | Partially Prepared | Some quantity prepared | Continue preparation |
| `Prepared` | SN Pending | Quantities prepared but allocation or required SN evidence is incomplete | Complete SN confirmation |
| `Ready_for_Pickup` | Awaiting Pickup | Every line passes quantity, location and authoritative SN checks | Confirm Dispatch |
| `Outbound` | Outbound | Physical dispatch committed | ERP write-back processing |
| `ERP_Synced` | ERP Synced | ERP write-back succeeded | Complete |
| ERP failed job | ERP Issue | Physical dispatch survives failed write-back | Retry / manual review |

The correction does not require a database enum or migration. Existing complete legacy rows are not silently rewritten; the guarded audit tool can identify them for an explicitly approved reconciliation.

## Controlled Preview reconciliation — 2026-08-02

The guarded reconciliation ran against the existing Preview Neon database with `DATABASE_ENV=preview`. It required raw `Prepared` status, SYD warehouse and `Workbook migration evidence` provenance. DRY_RUN checked authoritative order/line/SN relations, all active prepared reservations at each InventoryBalance grain, duplicate active SN assignments and Frozen-to-Physical safety.

Final verified Preview: `https://syd-wms-preview-5aq2vtnck-douglas-mos-projects.vercel.app/`

- Candidates: 11
- Eligible and promoted: 6 (`SH-2607-00161558`, `SH-2607-00168454`, `SH-2607-00170883`, `SH-2607-00175008`, `SH-2607-00175010`, `SH-2607-00175722`)
- Blocked and unchanged: 5 (`SH-2607-00168887`, `SH-2607-00172594`, `SH-2607-00174080`, `SH-2607-00174586`, `SH-2607-00175011`)
- Blocking reason for all five: the exact InventoryBalance grain was missing, so Frozen support could not be proven.
- InventoryBalance snapshot: unchanged, including Physical, Frozen, In Transit and version.
- ERP sync jobs created: 0
- Dispatches: 0
- Fabricated SNs: 0
- Each promoted order received the normal `Outbound ready for pickup` audit record.

A second APPLY run found only the same five blocked candidates, promoted zero orders and again left inventory and ERP jobs unchanged. This confirms the operation is idempotent.
