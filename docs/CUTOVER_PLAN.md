# Shadow and Cutover Plan

1. Keep the validated Sydney workbook operational and read-only to WMS.
2. Export workbook and WMS views using semantic fields; exclude documented display-only placeholders.
3. Reconcile balances by warehouse and grain, then reconcile serials.
4. Resolve current errors with controlled transactions; record legacy gaps separately.
5. Run repeated clean shadow periods covering outbound, repair, pickup, move, adjustment and transfer.
6. Validate ERP write-back retry/manual-review operations and audit access.
7. Approve opening balances, SN completeness, owners and rollback criteria.
8. Switch authority only through an explicit operational decision, never an application-side workbook write.

Cutover is not part of this sprint. The database is authoritative only for Preview data until the business approves this plan.
