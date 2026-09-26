# WMS leadership workflow preview

Open `/demo`. This is an isolated, synthetic browser-session prototype. It never calls operational WMS APIs, ERP adapters or a database. Existing operational routes remain available; their navigation includes **Leadership Demo Scenarios**.

## Run without a database

The existing Prisma install hook requires a URL string to generate its client but does not connect. From the repository in PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://demo:demo@127.0.0.1:1/demo'
pnpm install --frozen-lockfile
pnpm dev --port 3100
```

Visit `http://localhost:3100/demo`. No database server is required for this route. The dummy URL is deliberately unusable. Do not copy production environment files. Existing database-backed routes still require their existing configuration.

## Presenter walkthrough

1. **Outbound:** Start Pick Task. Scan/type `FLEX-01`, `EQ48S260700001`, then `EQ48S260700002`, pressing Enter each time. The last scan atomically freezes two units and makes `SH-2607-00175008` Ready for Pickup. Physical remains unchanged. Print the batch label for `SYD-00265`.
2. **Digital Pickup:** Select Engineer pickup, verify the linked demo identity `ENG-2048`, then scan the work-order QR `WO-SYD-2607-0042`. That scan completes the task, dispatches both units and records a mock digital-signature audit event. For Logistics driver, scan the shipment QR `SH-2607-00175008` (or pickup QR `SYD-00265`); no engineer identity or driver name is requested.
3. **Faulty Return:** Enter `60E5M4805C3F242` and optionally `DEMO-RETURN-NO-SH` on separate lines. Confirm `REPAIR-01` and Receive physically. Both have known synthetic product identity. The first matches its SH; the second receives physically and creates `MISSING_SH_REFERENCE` for After-sales. Unknown SKU identity is never guessed. Invalid batches cannot partially post.
4. **Transfer:** `TR-SYD-MEL-00018` expects `EQ48S260700003` and `EQ48S260700004`. Paste/scan both SNs in the batch box and submit once at Sydney, then Confirm Transfer Out. Independently batch-submit both at Melbourne, confirm `RECEIVING-01`, then Transfer In. Invalid or duplicate batches are rejected atomically; source scans cannot prove receipt.
5. **Repair → Good:** Receive the two demo returns, select each repair job and start repair. Paste/scan both `60E5M4805C3F242` and `DEMO-RETURN-NO-SH` into the batch box and validate them together, then complete the batch once. Native `Pending_Repair → In_Repair → Repair_Good` is preserved. The SN identities and total physical quantity remain unchanged; ledger and audit evidence are appended.
6. **Warehouse Map:** Click the raised rack/service-location tiles for their model, SKU and quantity. The selected-location panel lists physical/frozen/available quantities, conditions, SNs and recent movements. Sydney and Melbourne are selectable. Occupancy is shown without capacity percentages because no capacity master exists.
7. **SN Trace:** Search an SN or business number: work order (`WO-SYD-2607-0042`), shipment (`SH-2607-00175008`), pickup (`SYD-00265`) or transfer (`TR-SYD-MEL-00018`). Business-number results show linked unit SNs and their shared timeline. Prepared explicitly means a source reservation, not a physical move.
8. **Audit / Exceptions:** Live checks reconcile the session. Sample discrepancies evaluates a deliberately inconsistent, separate read-only fixture to demonstrate all seven rules. Missing-SH exceptions appear in the live queue.
9. **AI Audit Concept:** Select an example question. Responses are fixed templates with deterministic demo counts. The seven-unit example is labelled illustrative, not a claim about live balances. No AI API or inventory mutation is available.
10. **Reporting:** Current metrics and 7/30-day rolling movement windows use structured session data. Outbound Today uses actual `outboundAt` in Sydney time. Current stock is not presented as historical closing inventory. Scheduled reporting and BI remain concepts.
11. **Reset Demo:** Restores stock, orders, collection evidence, repair jobs, transfers, exceptions, ledger, audit, scan drafts, selections and concept responses. Refreshing/leaving the route also starts a fresh session. No browser cleanup is needed.

## Architecture

`LeadershipDemo UI → LeadershipDemoService → domain commands / existing operations → DemoSessionRepository`.

- A cloned session is committed only after successful validation; failures cannot expose partial state.
- InventoryBalance remains quantity authority, SerialNumber remains identity, and stock transactions are append-only within the session.
- Existing pure operations handle preparation, dispatch, return and transfer. Demo guards add scan evidence/readiness. Existing native repair rules govern repair start/completion.
- Quantity, reconciliation, location, reporting and trace read models stay outside React.
- No operational server service, integration adapter, schema or migration is replaced. The optional `StockTransaction.actor` field adds provenance for demo movements while preserving compatibility.
- Fixtures reuse existing products, locations and requested references. This isolated session normalizes product counts to known synthetic SNs so the opening baseline reconciles. The outbound starts before preparation to demonstrate picking. `TEMP-01`, `QUARANTINE-01` and `DEMO-RETURN-NO-SH` are explicitly synthetic additions.

## Capability boundaries

**Existing prototype:** PostgreSQL repositories, atomic preparation, relational SN readiness, transfer receipt, repair lifecycle, map/reporting queries, scan review, bilingual operational UI and guarded import/cutover tooling. This task does not run those tools or alter their operational behaviour.

**Demo enhancements:** Chinese leadership UI, desktop/PDA execution screens, work-order identity + QR digital-signature simulation, QR-only driver handover, multi-SN transfer and repair batches, raised-rack map with location contents, and SN/work-order/shipment/transfer trace timelines. Missing-documentation receiving, deterministic audits, management views and complete reset remain available.

**Concept-only:** Real identity verification, AI analysis, scheduled report delivery and BI connectivity.

**Not implemented/connected:** Production ERP, Ruiyun SSO, carriers, external AI, production authentication, production database or new infrastructure.

**Limits:** Leadership presentation is Simplified Chinese; one outbound shipment and one two-SN transfer fixture; all-or-nothing transfer receipt; keyboard-wedge/plain-code scans, no camera decoder; schematic raised-rack geometry; occupied/empty instead of capacity percentage; in-memory per-tab sessions without cross-device persistence; investigation suggestions without documentation-resolution mutation. Real company identity/ERP connections remain unconfigured.

## Git baseline

This branch starts at `96b9ca9` from the existing `agent/sprint-2-ledger-parity` checkout to preserve its working flows. That baseline is 40 commits ahead of `origin/main` (`51261cc`), with existing PRs #1 and #2 still open. The requested PR against main therefore includes inherited work. Review the new leadership commits separately. This task introduces no new migration or reference-workbook changes and does not merge automatically.

## Verification record

- `pnpm test`: 21 files / 228 tests, including 13 leadership tests covering work-order identity/QR, batch validation/completion atomicity, pickup replay, independent receipt, repair conservation, audit rules and reset isolation.
- Required gates: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`.
- Browser walkthrough: outbound prep followed by automatic identity+work-order QR sign-off, multi-unit transfer upload in both warehouses, two-unit repair batch, map contents and work-order full lifecycle search.
- PDA walkthrough at 390px: outbound and driver handover. All 12 screens checked for document overflow; map additionally inspected at 360px.
- Fast execution tests cover equal-millisecond event ordering.

Browser verification uses the isolated local demo. Database-backed routes, production integrations, physical scanner hardware and physical printing are not claimed as newly tested.
