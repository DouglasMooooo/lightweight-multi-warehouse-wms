# Performance

Measured on Vercel Preview on 2026-07-30. Timings are observations, not guarantees.

## Root cause

Before Sprint 4, Vercel Functions ran in `iad1` (Washington, D.C.) while the dedicated Preview Neon database ran in Sydney. Database-heavy requests therefore crossed an intercontinental path. Normal pages also depended on an oversized `GET /api/wms` snapshot, which returned unrelated collections and made command responses scale with total warehouse data.

Sprint 4 aligned Preview Functions to `syd1`, split bounded page queries, reduced bootstrap data to the current user and warehouses, cached one Prisma client and `pg` pool per warm runtime, and instrumented safe route-level duration, response size and row count.

Production was not reconfigured or deployed.

## Deployed A/B method

- Before control: commit `36d7124`, Vercel Preview functions verified as `IAD1`.
- After candidate: commit `c3bb7ec`, Vercel Preview functions verified as `SYD1`.
- Five warm invocations were sampled for each route from actual Vercel runtime logs.
- The cold/first observation is reported separately and excluded from warm statistics.
- The old control did not emit response-size instrumentation, so before sizes are intentionally reported as unavailable.
- Requests were read-only and used a guaranteed-miss SN query; no warehouse data was changed.
- Values below are server operation durations from application telemetry, not browser navigation time.

## Before and after

| Route | Before IAD1 warm median | Before p95 | After SYD1 warm median | After p95 | After fastest–slowest | After cold | After bytes / rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `GET /api/bootstrap` | 445 ms | 447 ms | 5 ms | 5 ms | 5–5 ms | 6 ms | 798 B |
| `GET /api/dashboard` | 1,064 ms | 1,913 ms | 18 ms | 26 ms | 17–26 ms | 39 ms | 524 B |
| `GET /api/inventory?page=1&pageSize=50` | 639 ms | 844 ms | 13 ms | 26 ms | 11–26 ms | 57 ms | 13,958 B / 50 |
| `GET /api/outbound` | 632 ms | 1,049 ms | 9 ms | 10 ms | 8–10 ms | 33 ms | 6,929 B / 12 |
| `GET /api/serials/search?q=PERF-NOT-FOUND` | 445 ms | 445 ms | 6 ms | 7 ms | 6–7 ms | 41 ms | 11 B / 0 |

The observed warm median reduction was approximately 98.0%–98.9% across the sampled routes. This large change is consistent with removing the cross-region database path and splitting oversized reads; it is not attributed to one isolated SQL change.

Historical context: the old warm browser navigation to `GET /api/wms` was measured at 4,946 ms, and a real workbook DRY_RUN at 27,937 ms. Those are different workloads and are not presented as direct route-for-route A/B results.

## Endpoint and response changes

- Dashboard uses aggregates and six recent audit rows.
- Inventory is server-paginated and capped at 100 rows per page.
- Outbound queue/history and detail are separate bounded reads.
- SN search is server-side and bounded.
- Repair has a paginated query supporting status, SKU/model, SN and received-date filters.
- Receiving, Repair, Move, Adjustment, Transfers, Stocktake, Exceptions, Admin and Bulk SN no longer need a full snapshot for their normal page load.
- Bulk validation performs set-based serial and allocation reads.
- Normal command responses refresh only the affected resource.
- Instrumentation records `route`, `durationMs`, `responseBytes`, `queryName`, safe `rows`, and environment; it never logs row contents or serial numbers.

## Pooling and indexes

The application uses the pooled Neon `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED`. A cached Prisma client owns a cached `pg` pool per warm runtime. `DATABASE_POOL_MAX` defaults to 5 on Vercel and 10 elsewhere.

Query review confirmed existing coverage for the measured access patterns: unique SN, unique SKU, location/warehouse, unique SH number, outbound/repair statuses, inventory balance grain, audit business reference, and transaction reference/effective time. No speculative index was added.

## Remaining performance risks

- Neon Free and Vercel can still cold-start after idle periods; cold and warm results must continue to be tracked separately.
- Workbook parsing and reconciliation remain larger workloads than operator page reads.
- The legacy `GET /api/wms` read endpoint remains for compatibility and label fallback; normal operator pages should not add new dependencies on it.
- Response-size baselines still need to be accumulated for outbound detail, repair and bulk-validation requests using representative but non-sensitive operator activity.

## Hosting recommendation

Keep Vercel + Neon. With both in Sydney and bounded queries, all measured warm medians are comfortably below the Sprint 4 targets. There is no performance evidence supporting a hosting migration at this time.
