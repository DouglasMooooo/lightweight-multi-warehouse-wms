# Sprint 5 — Warehouse UX, ERP Order Import and Visual Location Map

Completed on 2026-07-30 on branch `agent/sprint-2-ledger-parity`.

## UI changes

- Reworked the application shell into Overview, Operations, Control and Administration groups.
- Added bounded global operational search for SN, SKU, model, SH, pickup code and location.
- Redesigned Dashboard around six operational priority lanes, blockers, activity and quick operations.
- Redesigned Outbound as a dense operational queue with required/prepared progress and next actions.
- Preserved the five explicit Bulk SN business modes while improving hierarchy and bilingual scanning.
- Added local loading states so the shell is not blocked by page data.

No inventory, Prepared/Frozen, repair, transfer, outbound or reconciliation semantics were changed by the presentation work.

## ERP import

- Adapter construction now goes through an environment-safe factory.
- Development/test may default to `MockERPAdapter`.
- Preview/staging without explicit configuration returns `ERP connection not configured`.
- Production rejects Mock, missing and unsupported adapter configuration.
- Added a `KingdeeERPAdapter` boundary for the normalized gateway contract:
  `findBySerialNumber`, `getOutboundOrder`, `getTransferOrder`,
  `writeBackOutbound`, `writeBackTransfer` and `healthCheck`.
- Outbound import is now Fetch -> Preview -> Validate -> Confirm.
- Preview is read-only. Confirm re-fetches and re-validates before creating one audited order.
- Replacement Unit Information is the only outbound demand source.
- Product, ERP warehouse mapping, physical warehouse, quantity and duplicate SH failures are operator-readable and retain technical codes.
- Duplicate SH returns existing status, pickup context and an Open Order action.
- Admin ERP health reports the selected adapter, connectivity, latest successful import and failed sync jobs without exposing credentials.

Mock was verified in the deployed Preview. Real Kingdee ERP was not verified because this project did not contain a production Kingdee API contract or credentials. The Preview deployment explicitly identifies its adapter as Mock; it does not present Mock data as real ERP data.

## Warehouse map

- `/warehouse-map` is generated from `Location` structured fields and controlled `InventoryBalance` rows.
- Rack rows sort descending, bays ascending and positions in L/M/R order.
- Service zones render separately from rack storage.
- Cells expose Empty, Occupied, Mixed, Repair Good, Repair, Frozen/Prepared and Exception semantics using labels/icons as well as color.
- No utilization percentage is shown because capacity metadata does not exist.
- The bounded initial API returns location identity and lightweight inventory summaries only; it does not preload SN objects and does not use `/api/wms`.
- Location, SKU, model, SN and container search highlights matching locations. SN detail is queried only for a search.
- The location drawer shows stock grains, physical/frozen/available quantities, container, SN count, recent movements and links to Inventory and Move.

Sydney Preview validation confirmed R1 and R2 rack generation, Row 4 above Row 1, L/M/R positions, and separate FLEX, REPAIR, DISPATCH and RETURN service zones.

## Chinese

The new shell, global search, Dashboard, Outbound, ERP workflow and health, Bulk SN and Warehouse Map surfaces have English and Simplified Chinese messages. Locale switching preserved the active map search. Persisted domain/database codes remain English.

## Performance

Measured on the deployed Vercel Preview in `SYD1`, backed by the Sydney Preview Neon database:

| Operation | Observed result |
| --- | ---: |
| Warehouse Map full page, six loads | 438–483 ms |
| Location drawer, six opens | 293–316 ms |
| Warehouse Map server query | 18 ms, 41,144 bytes |
| Location detail server query | 13–15 ms, 654 bytes |

All observed warm interactions met the <500 ms Sprint target. Browser timings include UI/network work; server timings come from `wms_timing` Vercel runtime logs. ERP latency was not measured because no real ERP endpoint was configured.

## Tests

Final quality gates:

- `pnpm db:validate`
- `pnpm test` — 10 files, 141 tests
- `pnpm typecheck`
- `pnpm lint`
- i18n operator-facing text check — 12 React components
- `pnpm build` — Next.js 16.2.12 production build

## Known remaining gaps

- The real Kingdee endpoint contract and credentials still need to be supplied and validated in a non-production environment.
- The adapter currently targets a normalized gateway contract; field-level Kingdee mapping must follow the actual approved API specification.
- Warehouse physical capacity is not modeled, so the map intentionally cannot claim occupancy percentages.
- API/domain RBAC remains future enforcement work; the navigation permission treatment is not a security boundary.

## Recommended next sprint

Run a controlled Kingdee integration certification in staging: approve the exact API schema, configure secrets, replay read-only known SH/SN cases, validate mapping diagnostics, then test write-back retry and idempotency with ERP owners before enabling any real production adapter.
