# Sprint 6 — Warehouse Operations V2

## Operator semantics

Outbound domain states are projected into five bounded queues: To Prepare, Partially Prepared, Awaiting Pickup, Outbound and ERP Issues. Prepared inventory remains physically present and frozen; the UI presents it as Awaiting Pickup.

## Shared scanning

`QRScanResolver` and `BulkScanSession` normalize structured QR and plain SN input, resolve WMS identity first, use the configured ERP adapter second, and return Manual Review without inventing a SKU. The shared bounded endpoint is `/api/scans/resolve`.

New inbound and faulty receiving use the shared resolver in their scanner field. Outbound automatically matches valid scans to the correct order line. Transfer Out validates up to 100 scans and auto-groups lines by Product + Condition. Destination receipt requires the exact transfer SN set and a destination physical location.

## Labels

`/api/labels/preview` is read-only. Pickup batch mode creates one A4 page per Pickup Code, falling back to SH No when missing. Rows aggregate by SKU + Model + ERP Warehouse. Unit SN mode is optional and produces quantity one per page.

## Warehouse Map V2

The map uses React and SVG in two levels. The Sydney floor plan shows REPAIR, R1, R2, RETURN, FLEX and DISPATCH from presentation-only layout configuration. Rack elevation preserves authoritative rack/row/bay/side ordering, with high rows first and L/M/R slots. Search dims non-matches, SKU highlights areas and slots, and SN focuses the exact location drawer.

New APIs are bounded and Sydney-region preferred:

- `/api/scans/resolve`
- `/api/outbound/[orderId]/scans`
- `/api/transfers/batch`
- `/api/transfers/[transferId]/receipt`
- `/api/labels/preview`
- `/api/warehouse-map`
