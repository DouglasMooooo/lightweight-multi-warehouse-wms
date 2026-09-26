# Sprint 4 — Operational Bulk SN, Chinese and Performance Hardening

Completed 2026-07-30 on branch `agent/sprint-2-ledger-parity`.

## Real Data Status

The existing dedicated Sydney Preview migration was preserved. Sprint 4 did not rerun the shadow migration or execute a real bulk commit against migrated serial numbers. The validated baseline remains:

- 96 Products
- 136 Locations
- 76 Inventory Balances
- 76 Opening Stock Transactions
- 20 known Serial Numbers
- 13 Outbound Orders and 14 lines
- 13 Pickup Batches
- 2 Repair Jobs
- Current Stock reconciliation 76 / 76 MATCH
- Known SN reconciliation 20 / 20 MATCH

Production was not deployed or connected. The workbook reference was not modified.

## Bulk SN Workflows

`/bulk-sn` is now an operational launcher rather than a generic condition form:

- New Stock Inbound: New condition, +Physical, one logical ledger movement, one audit, one batch reference, and all supplied SNs start as `In_Stock`.
- Faulty Batch Receiving: batch ERP lookup where available, row-by-row classification, explicit partial acceptance, Repair condition/status and a valid repair location.
- Repair-Good: normal tracked jobs must use `completeRepair()`; controlled legacy recognition requires destination and reason, is audited, and creates no fake SN.
- Outbound New and Repair_Good: validation follows each line's authoritative `requiredCondition`; Repair and Scrapped cannot satisfy normal replacement outbound.
- Multi-line outbound: every line exposes its own required quantity, assigned count, condition and SN action.
- Bind SN Existing Stock: identity-only registration with server-side physical-capacity validation; Physical Qty is unchanged.
- Unknown outbound SN: the operator must explicitly choose Register & Assign; validation and registration/assignment are atomic.
- Scanner, pasted Excel columns, CSV, TXT and XLSX input are supported with duplicate suppression and semantic headers.

## Simplified Chinese

English and Simplified Chinese dictionaries now cover navigation and the operator pages for Dashboard, Inventory, Outbound, Bulk SN, Receiving, Repair, Move, Adjustment, SN Search, Transfers, Stocktake, Reconciliation, Exceptions, Audit, Admin and labels, including the principal dialogs, validation states, empty states, scanner feedback and upload controls.

Stored domain codes remain English and unchanged. Identifiers such as SKU, SN, SH, ERP, SYD, FLEX-01 and REPAIR-01 are intentionally not translated.

The repository includes `pnpm i18n:check`, a heuristic audit for obvious JSX operator literals, plus dictionary parity and domain-code tests. The audit is a guardrail rather than a proof for every runtime string. Remaining intentional English consists of identifiers/domain codes and server diagnostic details where translation must not change the authoritative code.

Language switching remains client-side and does not reload the route or reset operational form state.

## Performance Root Cause and Region Change

Before Sprint 4, Preview Functions ran in Washington `iad1` while Neon ran in Sydney `syd1`; database reads crossed an intercontinental path. The application also used the large `/api/wms` snapshot too broadly.

Preview Functions now run in `syd1`, verified from Vercel deployment Resources and runtime logs. Five warm samples per route showed:

| Route | IAD1 median | SYD1 median |
| --- | ---: | ---: |
| Bootstrap | 445 ms | 5 ms |
| Dashboard | 1,064 ms | 18 ms |
| Inventory page 1 | 639 ms | 13 ms |
| Outbound queue | 632 ms | 9 ms |
| Exact/prefix SN miss | 445 ms | 6 ms |

Cold observations and complete fastest/p95/slowest data are recorded in `docs/PERFORMANCE.md`. Production region settings were not changed.

## API Refactor

Normal page reads for Receiving, Repair, Move, Adjustment, Transfers, Stocktake, Exceptions, Admin and Bulk SN now use bounded page/context DTOs rather than preloading `WmsState`. Dashboard, Inventory, Outbound, SN Search, Audit and Transactions already use dedicated bounded queries.

`/api/bootstrap` returns only the current user, warehouses and minimal environment metadata. Bulk SN has dedicated context, validate and commit endpoints. Repair has its own paginated/filterable endpoint. Outbound detail returns only the selected order graph and candidate inventory needed for that order.

`GET /api/wms` remains a compatibility/label fallback; command POST compatibility is intentionally retained. It is no longer the normal page-read architecture.

## Tests and Validation

Automated coverage includes:

- 30-unit New inbound with 30 `In_Stock` SN identities and one logical movement.
- Duplicate and existing-SN validation.
- Faulty row classifications and partial-acceptance rules.
- Normal Repair lifecycle protection and explicit legacy recognition.
- New versus Repair_Good outbound condition policy; Repair/Scrapped rejection.
- Multi-line order behavior.
- English/Chinese Bulk SN key parity and stable domain codes.

Final quality gate:

- `pnpm db:validate`: passed
- `pnpm test`: 9 files passed, 127 tests passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm i18n:check`: passed for 8 React component files
- `pnpm build`: passed with Next.js 16.2.12

## Remaining Risks

- The ERP adapter remains a Preview mock; real Kingdee production integration was explicitly out of scope. ERP misses correctly require Manual Review.
- The compatibility `GET /api/wms` endpoint and label fallback still exist and must not regain normal page consumers.
- The Repair API supports the required filters, but richer filter controls can still be added to the operator page.
- The i18n static check is intentionally heuristic; newly introduced runtime text still requires review and dictionary coverage.
- Neon Free/Vercel cold starts and large workbook reconciliation should continue to be measured separately from warm operator reads.

## Hosting Recommendation

Keep Vercel + Neon. The aligned Sydney Preview and bounded APIs are materially below the stated warm latency targets. Replacing either platform is not justified by the measured evidence.
