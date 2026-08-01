# Outbound Lifecycle Audit — 2026-08-01

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
