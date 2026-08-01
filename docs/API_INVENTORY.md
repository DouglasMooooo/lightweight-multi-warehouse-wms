# API Inventory

This inventory describes the current Next.js WMS Preview API surface for IT handover. Routes are server-side and database-backed. Mutation routes revalidate authoritative data in the service layer.

## Read and query APIs

| Method | Route | Purpose | Scope / notes |
|---|---|---|---|
| GET | `/api/bootstrap` | User, warehouses and application shell context | No inventory mutation |
| GET | `/api/dashboard?warehouse=SYD` | Operational queues and daily measures | Exceptions filtered by `Exception.warehouseId` |
| GET | `/api/inventory` | Bounded operational inventory | Warehouse, SKU, model, condition and item-type filters |
| GET | `/api/outbound` | Paginated outbound queue | Warehouse and operator-stage filters |
| GET | `/api/outbound/{orderId}` | Authoritative outbound detail | Lines, allocations and SN state |
| GET | `/api/transactions` | Immutable transaction-ledger view | Read-only |
| GET | `/api/audit` | Audit trail | Read-only |
| GET | `/api/operations?section=...&warehouse=SYD` | Receiving, repair, move, adjustment, transfer, stocktake, exception and admin contexts | Exception section is warehouse-scoped |
| GET | `/api/repair` | Repair work queue | Warehouse-scoped |
| GET | `/api/search` | General bounded WMS search | No mutation |
| GET | `/api/serials/search` | SN identity and lifecycle search | Serial is first-class |
| GET | `/api/warehouse-map` | Floor, rack and location data plus spatial search | All Product + Material; warehouse-scoped exceptions |
| GET | `/api/reports/inventory` | Product/Material inventory report and CSV | Physical Available = Physical - Frozen in active scope |
| GET | `/api/reports/inventory/{sku}/locations` | SKU location drill-down | Warehouse and optional condition scope |
| GET | `/api/reports/operations` | Weekly/monthly operational report | Historical inventory requires Opening baseline |
| GET | `/api/erp/health` | Adapter identity, configuration and sync health | Preview uses Mock adapter |
| GET | `/api/bulk-serial/context` | Products and locations for scanner workflows | Read-only context |
| GET | `/api/labels/preview` | Single label preview | Labels never change inventory |
| GET | `/api/wms/faulty-lookup` | Legacy single-SN ERP lookup | Unknown lookup exception has warehouse ownership |

## Validation and preview APIs

These routes do not mutate inventory unless a separate commit action is called.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/scans/resolve` | Resolve QR/SN identity evidence |
| POST | `/api/review-batches/parse` | Parse CSV/TXT/XLSX by semantic headers |
| POST | `/api/bulk-serial/validate` | Validate New Inbound or Faulty Receiving batch |
| POST | `/api/serials/bulk/register/validate` | Validate registration against existing Physical capacity |
| POST | `/api/outbound/{orderId}/scans` | Validate temporary outbound review rows |
| POST | `/api/outbound/{orderId}/serials/validate` | Validate exact outbound SN selection |
| POST | `/api/transfers/batch` | Validate/group transfer scans by Product + Condition or confirm one Transfer |
| POST | `/api/transfers/{transferId}/receipt` | Validate exact receipt SN set or confirm destination receipt |
| POST | `/api/erp/outbound/preview` | Preview ERP demand import without allocation or freeze |
| POST | `/api/labels/batch-preview` | Build read-only Pickup Code label pages |
| POST | `/api/reconciliation` | Read-only workbook/database reconciliation |

## Mutation APIs

| Method | Route | Controlled effect |
|---|---|---|
| POST | `/api/bulk-serial/commit` | New Inbound, Faulty Receiving or legacy Repair_Good recognition |
| POST | `/api/serials/bulk/register/commit` | Bind SN identity to existing Physical; quantity unchanged |
| POST | `/api/outbound/{orderId}/serials/commit` | Final revalidation and preparation/freeze |
| POST | `/api/erp/outbound/confirm` | Import demand as Pending Allocation; no physical/frozen mutation |
| POST | `/api/transfers/batch` | Create one cross-warehouse Transfer from accepted grouped SNs |
| POST | `/api/transfers/{transferId}/receipt` | All-or-nothing receipt at an explicit destination location |
| POST | `/api/wms` | Legacy command gateway for approved operations | Preview reset command remains a production-cutover backlog item |

## Error and integration conventions

- Domain validation failures use stable error codes where implemented; translation stays in the presentation layer.
- Spreadsheet uploads are parsed by semantic header, never fixed coordinates.
- ERP-specific logic stays behind `ERPAdapter`.
- Confirmed physical operations create ledger and audit evidence before ERP write-back. Failed write-back does not silently undo physical reality.
- Preview/staging must declare environment metadata and must never connect to production data.
