# Product backlog

Legend: **v0.1** implemented in Preview; **Next** recommended next sprint.

## EPIC 1 — Inventory Core

- **v0.1** Physical/Frozen/Available/In Transit model, atomic Move and controlled Adjustment.
- **Next** Wire server services to Prisma transactions and add ledger/balance reconciliation job.

## EPIC 2 — Outbound

- **v0.1** Allocate, Prepare, pickup code, label, SN scan and dispatch.
- **Next** ERP order import, partial multi-line preparation, cancellation/release flow.

## EPIC 3 — Serial Number Traceability

- **v0.1** First-class SN state and searchable timeline.
- **Next** Scan batching, duplicate/quarantine resolution and full event timeline projection.

## EPIC 4 — Faulty Returns / Repair

- **v0.1** Mock ERP lookup and Return_to_Repair.
- **Next** Manual Review receipt, explicit Repair Completion and Scrap approval.

## EPIC 5 — Transfers

- **v0.1** SYD → MEL Transfer Out/In with SN state changes.
- **Next** Multi-line/partial receive, discrepancy handling and overdue exceptions.

## EPIC 6 — ERP Integration

- **v0.1** Replaceable adapter, sync statuses and mock fixtures.
- **Next** Durable outbox worker, retry controls, idempotency and production adapter discovery.

## EPIC 7 — Stocktake

- **v0.1** Count entry and visible variance.
- **Next** Snapshot persistence, SN counts, supervisor approval and adjustment posting.

## EPIC 8 — Reporting / Dashboard

- **v0.1** Operational cards, activity, layout pulse and exception queue.
- **Next** Reconciliation reports and repair operational reporting.

## EPIC 9 — Roles / Security

- **v0.1** Role schema and Demo Supervisor context.
- **Next** SSO/Auth.js, server authorization and permission audit tests.

## EPIC 10 — Mobile / PWA / Scanner UX

- **v0.1** Responsive task UI, focused scan inputs and web manifest.
- **Next** installable icons, offline read cache, scan queue and warehouse-device testing.
