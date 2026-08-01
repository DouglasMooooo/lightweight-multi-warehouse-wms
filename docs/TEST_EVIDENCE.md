# Test Evidence

## Change under test

P0/P1 Director-demo remediation and IT handover on branch
`agent/sprint-2-ledger-parity`.

Covered risks:

- warehouse leakage in Exception metrics;
- current condition balances represented as historical values;
- ambiguous availability and item-scope labels;
- untranslated operator-visible fields;
- unexplained unavailable historical/area KPIs;
- valuable stock used for Transfer rehearsal.

## Automated evidence

Final commands were run on 1 August 2026 after restoring the bundled Node.js
runtime to `PATH` following a workstation power interruption.

| Command | Exit | Duration | Evidence |
|---|---:|---:|---|
| `pnpm test` | 0 | 10.907 s shell / 6.92 s Vitest | 16 files, 190 tests passed |
| `pnpm typecheck` | 0 | 7.948 s | `tsc --noEmit`; no errors |
| `pnpm lint` | 0 | 42.340 s | `eslint .`; no lint findings |
| `pnpm build` | 0 | 17.440 s | Next.js 16.2.12 production build compiled; all routes generated |

The first post-reboot `pnpm test` launch exited 1 before Vitest started because
PowerShell could not find `node`. This was an environment startup issue, not a
test failure. After loading the workspace runtime, the exact four required
commands above all completed with exit code 0.

## Transfer service evidence

`tests/final-demo-hardening.test.ts` exercises the real Transfer domain services
against an isolated in-memory Prisma-compatible transaction boundary:

- dispatch reduces source Physical, increases In Transit and records one
  Transfer ID, ledger entries, audit entries and SN relations;
- receipt reuses the same Transfer ID, reduces In Transit, increases destination
  Physical and updates SN warehouse/location/status;
- Product and Condition remain unchanged through the lifecycle;
- duplicate receipt is rejected;
- unexpected or duplicate receipt SNs are rejected.

## Historical reporting evidence

The same suite verifies:

- historical closing reconstruction from an Opening baseline;
- post-period transactions do not leak into the selected period;
- `Outbound`, `Transfer_Out`, `Transfer_In`, `Return_to_Repair` and
  `Repair_Completed` are applied to the historical condition buckets;
- missing historical baseline returns an unavailable result instead of current
  `InventoryBalance` values;
- SYD and MEL Exception metrics remain warehouse-scoped.

## Preview acceptance evidence

Latest verified Preview:

`https://syd-wms-preview-afch42g5v-douglas-mos-projects.vercel.app/`

- Dashboard showed `可出库良品库存` with `新品 + 维修良品 − 已冻结`.
- Product Inventory Report showed `物理可用库存` with
  `产品实物库存 − 已冻结`.
- Warehouse Map showed `全部库存范围 · 产品 + 物料`.
- Historical Operations KPI showed `不可用：历史基线不足` and explained the
  missing opening Ledger baseline.
- Area KPIs showed `不可用：仓库面积未配置`.
- Product Inventory Report exposed both synthetic demo Products with two known
  SNs each.
- `DEMO-TRANSFER-001` validated SYD to MEL with four dedicated SNs: 4 valid,
  0 needing attention and 0 unresolved.
- Validation resolved two Product groups under the single `New` condition and
  enabled `确认调拨出库`.
- Batch label selection and preview were opened without modifying inventory.
- Faulty receiving review was opened without committing a receipt.
- Warehouse Map Level 1, Level 2 rack elevation and Level 3 location drawer were
  verified.
- ERP boundary showed `MockERPAdapter`, connected, with zero failed sync jobs.
- No raw translation keys or browser console warnings/errors were found in the
  rehearsed paths.

Screenshots are stored locally under
`artifacts/demo-rehearsal-zh-final/` and intentionally excluded from Git.

## Safety evidence

- No database reset, shadow seed or populated Preview reseed was run.
- Exception migration is additive and does not infer legacy warehouse ownership.
- Transfer fixture requires `ALLOW_DEMO_FIXTURE=true` and rejects production
  metadata.
- Fixture contains no delete or reset path and stops if dedicated SNs entered a
  workflow.
- The fixture prefix migration preserved net Physical quantity using new paired
  `Adjustment_Out` and `Adjustment_In` transactions; it did not rewrite history.
- No Transfer dispatch or receipt confirmation was executed during acceptance.
- No real valuable inventory was used for the Transfer rehearsal.

## Remaining manual demo step

- During the Director demo, confirm `DEMO-TRANSFER-001` once, then demonstrate
  the same Transfer ID in `In Transit` and destination `Pending Receipt` before
  receiving it at MEL.
- A non-zero cross-warehouse Exception isolation UI example remains dependent on
  an approved multi-warehouse test dataset; the service behavior is covered by
  automated tests.

## Presentation-layer exceptions

The following values intentionally remain English/domain-coded where shown:

- `ERP`, `WMS`, `SN`, `SKU`, `SH`, warehouse codes and adapter class names;
- Product SKU/model/master-data values;
- unknown free-form legacy `AuditLog.operation` values not present in the known
  presentation mapping.

Domain and database codes are not translated.

## Outbound lifecycle correction — 2026-08-01

- `pnpm test`: 17 files, 196 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: Next.js 16.2.12 production build passed.
- Dedicated database-service tests prove quantity-complete without SN remains pending, partial SN remains pending, final SN assignment auto-promotes, wrong SKU/location and duplicate SNs fail, non-serial lines can become ready, and every line in a multi-line order must complete.
- Dispatch tests prove the server reuses preparation-assigned SN relations, posts Physical/Frozen and SN lifecycle changes, queues ERP write-back, and blocks incomplete authoritative evidence before ledger mutation.
- Presentation tests prove raw `Prepared` maps to SN Pending and `Ready_for_Pickup` uses read-only SN evidence rather than ordinary pickup rescanning.
- Preview audit was read-only: 11 raw `Prepared` orders, 12 serial-tracked lines and 18/18 assigned SN relations. No Preview data was modified.
- Controlled Preview reconciliation DRY_RUN found six fully eligible orders and five blocked by missing InventoryBalance grains. Only the six eligible orders were promoted; the second APPLY promoted zero, proving idempotency.
- The transaction compared every SYD InventoryBalance row before and after (Physical, Frozen, In Transit and version) and confirmed no change; ERP sync-job count also remained unchanged.
