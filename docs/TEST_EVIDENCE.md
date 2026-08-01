# Test Evidence

## Change under test

P0/P1 director-demo remediation and IT handover on branch `agent/sprint-2-ledger-parity`.

Covered risks:

- warehouse leakage in Exception metrics;
- current condition balances represented as historical values;
- ambiguous availability and item-scope labels;
- untranslated operator-visible fields;
- unexplained unavailable historical/area KPIs;
- valuable stock used for Transfer rehearsal.

## Automated evidence

Final commands run on 1 August 2026:

```text
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

| Check | Result | Evidence |
|---|---|---|
| Prisma generate | PASS | Client generated with nullable `Exception.warehouseId` relation |
| Unit/integration tests | PASS | 15 files, 186 tests passed |
| TypeScript typecheck | PASS | `tsc --noEmit` completed with no errors |
| ESLint | PASS | `eslint .` completed with no errors |
| Next.js production build | PASS | Next.js 16.2.12 optimized build compiled and generated all routes |

## Safety evidence

- No database reset, shadow seed or populated Preview reseed was run.
- Exception migration is additive and does not infer legacy warehouse ownership.
- Transfer fixture requires `ALLOW_DEMO_FIXTURE=true` and rejects production metadata.
- Fixture contains no delete or reset path and stops if dedicated SNs entered a workflow.
- Fixture records Opening ledger and AuditLog evidence when synthetic stock is added.
- The demo-only condition correction used new `Adjustment_Out` and `Adjustment_In` ledger entries; it did not rewrite the original Opening history.

## Preview acceptance evidence

- Dashboard showed `可出库产品库存`; Product Inventory Report showed `物理可用库存`.
- Warehouse Map showed `全部库存单位 · 产品 + 物料`.
- Historical Operations KPI showed `不可用：历史基线不足` and explained the missing opening Ledger baseline.
- Area KPI showed `不可用：仓库面积未配置`.
- Product Inventory Report exposed both synthetic demo products with two known SNs each.
- `DEMO-TRANSFER-001` was validated read-only for SYD to MEL with four dedicated SNs: 4 valid, 0 needing attention and 0 unresolved.
- Validation resolved two Product groups under the single `New` condition policy and enabled `Confirm Transfer Out`.
- Final confirmation was intentionally not executed, preserving the one-time destructive rehearsal for the Director demo.

## Remaining manual checks

- [ ] During the demo, confirm `DEMO-TRANSFER-001` once and verify one Transfer ID, `In Transit`, and destination `Pending Receipt`.
- [ ] Verify the faulty receiving and label preview translations in the exact Director walkthrough path.
- [ ] Recheck exception isolation with non-zero exceptions independently present in two warehouses when an approved multi-warehouse test dataset is available.
