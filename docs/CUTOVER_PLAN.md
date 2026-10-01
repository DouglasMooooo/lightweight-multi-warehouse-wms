# Shadow and Cutover Plan

1. Keep the validated Sydney workbook operational and read-only to WMS.
2. Run the semantic DRY_RUN against workbook view, transaction-derived projection and WMS; exclude documented display-only placeholders.
3. Reconcile balances by warehouse and grain, then reconcile serials.
4. Resolve current errors with controlled transactions; record legacy gaps separately.
5. Run repeated clean shadow periods covering outbound, repair, pickup, move, adjustment and transfer.
6. Validate ERP write-back retry/manual-review operations and audit access.
7. Approve opening balances, SN completeness, owners and rollback criteria.
8. Switch authority only through an explicit operational decision, never an application-side workbook write.

`SHADOW_SEED` may establish explicit Opening evidence in an empty non-production shadow database. It is not authority approval. Cutover is not part of this sprint; the database is authoritative only for Preview data until the business approves this plan.
