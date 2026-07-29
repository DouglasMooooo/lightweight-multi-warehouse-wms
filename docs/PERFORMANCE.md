# Performance

Measured 2026-07-29. Timings are observations, not guarantees.

## Before

The deployed Preview at commit `6876940` used `GET /api/wms` for normal startup and returned nearly every domain collection plus up to 500 transactions, audits and exceptions.

| Measurement | Result |
| --- | ---: |
| Warm deployed `GET /api/wms` navigation | 4,946 ms |
| Real workbook DRY_RUN end-to-end | 27,937 ms |
| Command response | Full WMS snapshot |
| SN scan | One write followed by a full snapshot |

The browser measurement includes network, function and database work. DRY_RUN includes upload, parsing, PostgreSQL reference reads, reconciliation and rendering.

## Changes

- Dashboard uses aggregate/count queries and six recent audit rows.
- Inventory is server-paginated (page size capped at 100) with search and filters.
- Outbound queue/history are paginated; detail reads one order plus bounded candidate balances.
- SN search is server-side and bounded; all serials are no longer preloaded.
- Audit and transactions have dedicated paginated endpoints.
- Timing logs contain route, duration, query name, safe row count and environment—never row/SN contents.
- Normal command responses are small; outbound detail refreshes only the affected query.
- Bulk validation uses one `IN (...)` serial read and one `IN (...)` active-allocation read.
- PrismaClient and its `pg` pool are cached per warm runtime. `DATABASE_POOL_MAX` defaults to 5 on Vercel and 10 elsewhere.

## Vercel / Database

| Component | Finding |
| --- | --- |
| Project | `syd-wms-preview` |
| Vercel function region | `iad1` (Washington, D.C.) |
| Compute | Fluid Compute enabled |
| PostgreSQL | Neon Free |
| PostgreSQL region | Sydney (`syd1`) |
| Application URL | pooled `DATABASE_URL` |
| Migrations | `DATABASE_URL_UNPOOLED` |

Compute and database are not aligned. The current deployment does not expose an isolated network RTT, so no synthetic latency is claimed. The measured DB-heavy 4.946 s snapshot and 27.937 s reconciliation include the inter-region path. Test `syd1` functions in Preview before any production resource change.

## After

The new endpoints have not yet been deployed, so deployed after-timings are not fabricated. The next isolated Preview deployment must measure:

| Endpoint | Target |
| --- | ---: |
| Dashboard warm | < 1,000 ms |
| Inventory first page warm | < 1,000 ms |
| Outbound active queue warm | < 1,000 ms |
| Exact/prefix SN search | < 500 ms where practical |
| Command | Independent of total row count |

Remaining bottlenecks are the inter-region path, Neon Free cold starts, workbook formula parsing and large reconciliation result sets.
