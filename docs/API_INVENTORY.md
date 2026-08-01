# API Inventory

This is the current Next.js WMS Preview API surface. `Read` and `Validate` operations do not change inventory. `Mutation` operations reload authoritative state, validate business rules and write controlled balance, ledger and audit evidence.

## Read APIs

| Method | Route | Mode | Purpose | Main input | Main output | Major errors |
|---|---|---|---|---|---|---|
| GET | `/api/bootstrap` | Read | Shell user, role, warehouse and environment context | none | user, permissions, warehouses, environment | server error |
| GET | `/api/dashboard` | Read | Warehouse work queues and current KPIs | `warehouse` | scoped tasks, sellable availability, recent audit | invalid warehouse/server error |
| GET | `/api/inventory` | Read | Bounded current inventory | warehouse, query, condition, item type, paging | balances and paging | invalid filter |
| GET | `/api/outbound` | Read | Outbound queue | warehouse, stage, query, paging | order summaries | invalid filter |
| GET | `/api/outbound/{orderId}` | Read | Authoritative outbound detail | path `orderId` | order, lines, allocations, SN state | 404 order not found |
| GET | `/api/operations` | Read | Section-specific operation context | `section`, `warehouse` | receiving/repair/move/transfer/etc. data | unsupported section |
| GET | `/api/repair` | Read | Warehouse repair queue | warehouse and paging filters | RepairJobs and summary | invalid filter |
| GET | `/api/transactions` | Read | Immutable ledger view | warehouse, query, paging | StockTransaction rows | invalid filter |
| GET | `/api/audit` | Read | Audit trail | warehouse/reference/paging | AuditLog rows | invalid filter |
| GET | `/api/search` | Read | Bounded global search | warehouse, `q` | SN/SKU/location/container matches | `SEARCH_FAILED` |
| GET | `/api/serials/search` | Read | SN identity/lifecycle search | warehouse, query | serial records and current location | invalid filter |
| GET | `/api/warehouse-map` | Read | Floor/rack map, spatial search and detail | warehouse plus optional area/rack/location/query | map totals, geometry, inventory detail | `LOCATION_NOT_FOUND`, `WAREHOUSE_MAP_FAILED` |
| GET | `/api/reports/inventory` | Read | Product/Material inventory report or CSV | warehouse, item type, condition, location, sort, paging | scoped totals and rows/CSV | invalid filter |
| GET | `/api/reports/inventory/{sku}/locations` | Read | SKU location drill-down | SKU, warehouse, optional condition | product totals and location rows | `REPORT_PRODUCT_NOT_FOUND` |
| GET | `/api/reports/operations` | Read | Weekly/monthly operational report | mode, warehouse, business date | movement, condition and KPI report; unavailable reasons | `INVALID_REPORT_FILTER` |
| GET | `/api/erp/health` | Read | ERPAdapter identity/configuration/health | none | adapter name, configuration, health | adapter domain code, `ERP_REQUEST_FAILED` |
| GET | `/api/bulk-serial/context` | Read | Scanner products and locations | warehouse, operation mode | bounded product/location context | invalid warehouse |
| GET | `/api/labels/preview` | Read | Single-order label preview | `orderId` | label model | `ORDER_REQUIRED`, `ORDER_NOT_FOUND` |
| GET | `/api/wms/faulty-lookup` | Read | Single faulty-SN lookup | `serialNumber`, `warehouse` | WMS/ERP identity evidence | `INVALID_WAREHOUSE`, missing SN, ERP/domain errors |

## Validate and preview APIs

| Method | Route | Mode | Purpose | Main input | Main output | Major errors |
|---|---|---|---|---|---|---|
| POST | `/api/scans/resolve` | Validate | Resolve QR/SN identity without mutation | warehouse and raw scan rows | parsed identities and validation states | `INVALID_SCAN_BATCH`, `SCAN_RESOLUTION_FAILED` |
| POST | `/api/review-batches/parse` | Validate | Parse TXT/CSV/XLSX by semantic headers | multipart file | temporary review rows | `FILE_REQUIRED`, `FILE_TOO_LARGE`, `FILE_PARSE_FAILED` |
| POST | `/api/bulk-serial/validate` | Validate | Validate New Inbound or Faulty Receiving | operation mode, warehouse/location, SKU context, SN/file | row results and summary | `FILE_REQUIRED`, `INVALID_BATCH`, domain codes |
| POST | `/api/serials/bulk/register/validate` | Validate | Check SN registration against Physical capacity | warehouse/location/SKU/condition and SN/file | capacity and row results | `FILE_REQUIRED`, `INVALID_BATCH`, domain codes |
| POST | `/api/outbound/{orderId}/scans` | Validate or mutation by `action` | Validate/lookup temporary outbound rows; confirm only when explicitly requested | action, review rows, optional target line | row validation, summary, confirmation result | `INVALID_OUTBOUND_SCAN_BATCH`, domain codes, `OUTBOUND_SCAN_FAILED` |
| POST | `/api/outbound/{orderId}/serials/validate` | Validate | Validate exact outbound SN set | SN list/file and line context | eligible/invalid SN rows | `FILE_REQUIRED`, `INVALID_BATCH`, domain codes |
| POST | `/api/transfers/batch` | Validate or mutation by `action` | Validate/group Transfer SNs or confirm one native Transfer | action, source/destination, condition, reference, review rows | summary, Product+Condition groups; confirmed Transfer ID | `INVALID_TRANSFER_BATCH`, `TRANSFER_BATCH_INVALID`, domain codes |
| POST | `/api/transfers/{transferId}/receipt` | Validate or mutation by `action` | Validate exact receipt set or receive same Transfer ID | action, destination location, SN rows | missing/invalid rows; receipt result | `TRANSFER_NOT_IN_TRANSIT`, `DESTINATION_LOCATION_NOT_FOUND`, `TRANSFER_RECEIPT_INCOMPLETE` |
| POST | `/api/erp/outbound/preview` | Validate | Preview ERP replacement demand | SH number | normalized ERP demand preview | `INVALID_REQUEST`, adapter domain code, `ERP_REQUEST_FAILED` |
| POST | `/api/labels/batch-preview` | Validate | Build Pickup Code A4 labels | 1–100 outbound order IDs | validation, totals and label pages | `INVALID_LABEL_BATCH`, stale/ineligible order result |
| POST | `/api/reconciliation` | Read/Validate | Compare workbook with WMS without posting adjustments | XLSX, warehouse, optional cutover time | inventory/SN discrepancies and classifications | `FILE_REQUIRED`, `INVALID_CUTOVER_AT`, domain codes |

## Mutation APIs

| Method | Route | Purpose | Main input | Main output | Major errors |
|---|---|---|---|---|---|
| POST | `/api/bulk-serial/commit` | Commit New Inbound, Faulty Receiving or legacy Repair_Good recognition | validated mode-specific batch and explicit location/reason | batch reference, accepted units, audit evidence | `INVALID_BATCH`, domain codes, `INTERNAL_ERROR` |
| POST | `/api/serials/bulk/register/commit` | Bind SN identity to existing Physical Qty | validated SKU/location/condition/SNs | registered count and batch reference | `INVALID_BATCH`, capacity/domain codes |
| POST | `/api/outbound/{orderId}/serials/commit` | Revalidate and bind exact preparation-stage outbound SNs | order line and selected SNs | assignment result plus re-evaluated order status; final complete assignment auto-promotes to Ready for Pickup | `INVALID_BATCH`, allocation/SN/domain codes |
| POST | `/api/erp/outbound/confirm` | Import ERP demand as Pending Allocation | SH number | imported order/reference; Physical and Frozen unchanged | `INVALID_REQUEST`, adapter/domain codes, `ERP_REQUEST_FAILED` |
| POST | `/api/transfers/batch` | Create and dispatch one reviewed Transfer | `action=confirm` plus source/destination/condition/reference/rows | one Transfer ID, `In_Transit`, validated groups | transfer validation/domain codes |
| POST | `/api/transfers/{transferId}/receipt` | All-or-nothing receipt against same Transfer ID | `action=confirm`, destination location, exact SN set | received count and validation evidence | receipt domain codes; duplicate receipt rejected |
| POST | `/api/wms` | Legacy command gateway for approved inventory operations | discriminated command payload | refreshed operation result | domain code, `INVALID_REQUEST`, `INTERNAL_ERROR` |

## Conventions and boundaries

- Zod validates transport shape; domain services enforce warehouse, stock, SN, condition and lifecycle rules.
- Domain/database codes remain English and stable. Translation exists only in the presentation layer.
- Uploaded workbooks are matched by semantic headers, never fixed cell coordinates.
- Labels, search, reconciliation and validation actions never modify inventory.
- Confirmed physical operations append StockTransaction and AuditLog evidence.
- Preview uses Mock ERP. Real Kingdee connectivity is not represented as complete.
- The legacy `/api/wms` `resetDemo` command is a production-readiness gap and must be removed or locked before cutover.
