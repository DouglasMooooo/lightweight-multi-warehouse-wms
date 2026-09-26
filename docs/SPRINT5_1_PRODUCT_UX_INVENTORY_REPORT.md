# Sprint 5.1 Product UX and Inventory Report

Sprint 5.1 strengthens the operator experience without changing inventory semantics. `InventoryBalance` remains the quantity authority and the immutable transaction ledger remains the reconciliation source.

## UX redesign

- The primary navigation now groups the Product Inventory Report under Inventory & Control.
- The interface retains scanner-first operation, stable routes, English/Simplified Chinese presentation, and domain codes that are never translated.
- The Outbound detail page exposes the seven operational states: ERP Imported, Allocated, Prepared, SN Complete, Ready for Pickup, Outbound, and ERP Sync.

## Warehouse Map

- Service zones are separated from the rack floor.
- Rack cells are compact and follow higher-row-at-top, bay-left-to-right, L/M/R placement.
- Search dims unrelated cells and highlights matching location, SKU, model, or SN results.
- The location drawer shows Physical, Frozen, Available, condition-level stock, containers, and recent movements.
- Initial map responses remain bounded and do not preload serial objects.

## Product Inventory Report

- The report aggregates database balances by warehouse and product.
- It supports Products, Materials, and All views; server-side search and filters; sorting; pagination; and filter-respecting CSV export.
- Physical, Frozen, Available, In Transit, New, Repair Good, Repair, Scrap, and Material quantities are explicit.
- The product drawer provides location-level balances and known physically-present serial coverage.
- Non-serial-tracked items display `Not tracked`; they are not presented as serial coverage defects.
- Legacy serial gaps remain distinct from current operational reconciliation errors.

## ERP import

The existing Fetch, Preview, Validate, and Confirm boundary remains unchanged. The deployed Preview uses the Mock adapter. No approved Kingdee contract or credentials were available, so real ERP connectivity and write-back are not claimed.

## Chinese

All new navigation, report, warehouse-map, filter, coverage, and outbound-stepper presentation strings have English and Simplified Chinese messages. Persisted domain and database codes remain English.

## Performance

On the Vercel Preview in `syd1`, six browser loads measured:

- Product Inventory Report: 387-423 ms.
- Warehouse Map: 395-404 ms.
- Product drilldown: 297-313 ms.

Warm server telemetry measured 24-26 ms for the report, 8-10 ms for drilldown, 23 ms for the map, and 32-69 ms for CSV export. All observed interactions met the 500 ms Preview target.

## Tests

The release is gated by unit/integration tests, typecheck, lint, i18n validation, database schema validation, and a production build.

## Remaining gaps

- Kingdee integration remains behind `ERPAdapter` until an approved staging contract and credentials are supplied.
- CSV is intentionally a filtered operational export, not a scheduled reporting pipeline.
- Historical legacy traceability gaps require business cleanup and are not repaired by this UI.
