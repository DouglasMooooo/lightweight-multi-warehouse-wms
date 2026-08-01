# Assumptions and Workbook Conflicts

The validated Sydney workbook was inspected as read-only business evidence. The repository copy is the 2026-07-28 user-provided workbook with SHA-256 `77135C0C077CCFFBE04AE40A526535A8A925150603A8C39ED49F5300A90836CD`.

- Workbook Prepared rows leave Current Qty unchanged. WMS preserves that rule and adds database Frozen reservations.
- Workbook formula/helper columns and concatenated keys are replaced by relational balances, constraints and immutable transactions.
- Move is one atomic source-to-destination operation. Adjustment remains separate.
- Database IDs are internal; SH No, Pickup Code and transfer number remain business references.
- In-transit quantity currently remains on the source balance after Physical is removed. A transfer-level in-transit ledger is future work.

## Latest workbook conflicts and mappings

- The workbook now includes semantic field `Outbound_Date / 实际出库日`, populated only for actual Outbound. WMS maps it to `OutboundOrder.outboundAt`; `Date` is business/effective time and never substitutes for dispatch. The AI instruction names a different Excel coordinate than the header, so importers must map semantic headers rather than letters.
- Workbook guidance overloads Prepared. Rows without a known physical source map to `Pending_Allocation`; source selection maps to `Allocated`; confirmed picking maps to `Prepared/Ready_for_Pickup`. Only confirmed preparation increases Frozen.
- The workbook splits serial-tracked Qty N into N rows. WMS retains one line with Qty N and relational allocations/SN assignments.
- Historical repaired-good recognitions use `Adjustment_In`, sometimes without original faulty evidence. Native completion uses RepairJob; only controlled historical recognition uses `RepairGood_Adjustment_In`, `Legacy_Manual`, a mandatory reason and no invented job/SN.
- Workbook label guidance aggregates an SH. The explicit specification extends one Pickup Code across several SH documents. WMS groups SKU + Model + ERP Warehouse and keeps different ERP warehouses as separate rows on one A4 label.
- Product master contains Material rows with `Report Machine Flag = Yes`; `reportMachine` cannot be inferred from item type.
- Rows using SKU `坏机`, Qty 99 and a remark that they only display physical-location occupancy are spreadsheet visualisation placeholders. They are excluded from balances, movements and reconciliation truth.
- Historical incomplete original faulty records are classified as legacy traceability gaps. Current discrepancies remain current operational errors.
- Only balances explicitly marked `legacySerialGap` receive legacy shortage classification. The flag does not permit SN registration beyond Physical Qty.
- Returned_Unrepaired means the faulty unit was returned from the repair activity without becoming usable stock. It remains Repair/Repair; `returnedToStockAt` stays null.

Until explicit cutover approval, the workbook remains the production operational reference and WMS is a shadow system. Reconciliation reports differences but never overwrites either source.

## Sprint 3 import observations

- The inspected source checksum remains `77135C0C077CCFFBE04AE40A526535A8A925150603A8C39ED49F5300A90836CD`.
- Current Stock contains formula cells without cached results for some Container, SN and Frozen fields. The importer does not execute formulas; it uses cached scalar results and falls back to a transaction-derived SN projection.
- The snapshot contains rows whose Item Type says `Item type not found`. These are rejected as data-quality issues rather than inferred from SKU or condition.
- Outbound actions without actual `Outbound_Date` remain reference evidence and are not promoted to confirmed dispatch.
- Prepared without a real source location maps to Pending Allocation and does not freeze stock.
- Location Master has no physical warehouse column; this Sydney-specific import requires an explicit/default SYD context. This default does not infer an unknown location.

## Sprint 3.5 presentation and deployment assumptions

- Supported UI locales are `en` and `zh-CN`; no localized value is written to PostgreSQL.
- Language is a workstation/operator preference and does not alter stable operational URLs.
- Warehouse wall-clock input is interpreted using the selected Warehouse `timezone`. The Sydney default is `Australia/Sydney`, including DST.
- Vercel deployments must define `DATABASE_ENV`. Preview/staging with production database metadata is rejected; Production requires `DATABASE_ENV=production`.
- Role-aware navigation uses server-returned permissions for preparation only. API/domain authorization remains the authoritative future enforcement point; this sprint does not claim complete RBAC.

## Sprint 3.6 real-data observations

- The latest fixture checksum is `84402AAD17583540AC2758DADFFA5AE27E50A50885A5CD141AF456952B8AE293`; it supersedes the older Sprint 3 inspection checksum for this validation only.
- Thirty-nine ledger rows contain literal `Item type not found`, and seven additional business rows have blank Item Type after display-only exclusions. They are rejected; Product or Material is not inferred from SKU/model.
- Seventeen Outbound actions lack `Outbound_Date`. They remain reference evidence and do not create an invented physical dispatch timestamp.
- Weekly/monthly date-only values follow `Australia/Sydney`; observed Google Sheet `America/Los_Angeles` metadata is not inherited.
- Vercel Preview functions are currently configured for `iad1` while the Neon Preview database is in Sydney. This mismatch is documented and must not be changed in production without a controlled comparison.

## Sprint 4 operational hardening decisions

- Faulty receiving preserves a known serial identity. A known WMS serial is automatically receivable only when its current lifecycle proves it is physically outbound; physically present, Prepared, Repair or otherwise ambiguous statuses require Manual Review so receiving cannot double-increase Physical Qty.
- An unknown faulty serial can be registered only when ERP or explicit operator input identifies the SKU. ERP misses without an identified SKU remain Manual Review; the system never guesses from the serial text.
- Native repair completion remains valid only from `In_Repair` and must use the normal RepairJob lifecycle. Bulk legacy Repair-Good recognition rejects an active normal RepairJob, requires an explicit reason, and never fabricates an unknown serial number.
- Bulk operations use a UUID-backed human-readable batch reference. It is traceability for inbound, faulty receipt and audit, not a new generic batch-management subsystem.
- Bulk New Inbound creates one high-level inventory transaction and audit operation with all supplied serial identities. Bind Existing Stock creates identities only and cannot increase Physical Qty.
- The IAD1/SYD1 A/B test used isolated Vercel Preview deployments and read-only requests. Production was not changed. The dedicated Preview database remained the data source, and no shadow migration was rerun.
- Preview functions are now explicitly configured for `syd1`, matching the Sydney Neon Preview database. This is a Preview evidence-based change, not authorization to change Production.

## Sprint 5 ERP and warehouse-map decisions

- No approved Kingdee request/response contract or credentials were present in the repository. `KingdeeERPAdapter` therefore targets an explicit normalized gateway boundary and does not invent vendor fields.
- The current Vercel Preview is intentionally configured with `ERP_ADAPTER=mock` and labels the adapter as Mock. Real ERP connectivity, latency and write-back are not claimed as verified.
- Preview/staging without a configured adapter reports `ERP connection not configured`; Production cannot select or silently fall back to Mock.
- Structured `Location.rack`, `row`, `bay`, `side` and `serviceZone` fields are authoritative for visualization. The location code is display identity, not the layout parser.
- Locations without rack coordinates render outside the rack grid; known service zones render as separate operational blocks.
- The data model has no physical capacity field. Warehouse Map reports inventory state and quantities only, never a utilization percentage.
- Initial map responses intentionally omit serial objects. SN location resolution is a bounded server-side search performed only when an operator supplies a query.

## Sprint 5.1 reporting decisions

- `InventoryBalance` is the quantity authority for Product Inventory Report aggregation; the immutable ledger remains the reconciliation source.
- Known SN coverage counts only the shared physically-present serial statuses. Allocatable status is intentionally stricter and is not substituted for physical presence.
- Items with `serialTrackingRequired=false` display `Not tracked` and never create a serial coverage defect.
- `legacySerialGap` is shown separately and does not excuse a current balance or serial reconciliation failure.
- Productless or unresolved balance rows cannot be placed in a SKU report without inventing product identity, so they remain reconciliation concerns rather than report rows.
- CSV export applies the active server-side filters and exposes the same business quantities as the report.
- The Vercel Preview continues to use the Mock ERP adapter; real Kingdee connectivity remains blocked on an approved contract and credentials.

## Sprint 6 operations V2 decisions

- Internal outbound enums remain stable. Operator presentation maps Imported, Pending Allocation and Allocated to `To Prepare`; Prepared and Ready for Pickup map to `Awaiting Pickup`. This resolves the workbook's overloaded Prepared wording without rewriting ledger history.
- The workbook label prototype is output evidence, not a mutation workflow. Pickup Code is the first grouping key; only identical SKU + Model + ERP Warehouse rows aggregate. Missing Pickup Code falls back to SH No and never creates a synthetic code.
- The explicit Sprint 6 rule extends the workbook's SH-oriented label examples across all SH documents sharing one Pickup Code. Different ERP warehouse classes remain distinct rows on the same A4 page.
- QR parsing accepts structured key/value payloads, a recognised SKU-and-SN pipe format, and plain SN. Unresolved values remain Manual Review; neither the parser nor scanner UI infers product identity from serial text.
- New inbound remains a single-product logical batch because the validated inventory service posts one product/condition/location balance grain per operation. The scanner resolves the SKU automatically and rejects a second SKU into the same batch rather than silently splitting inventory effects.
- Transfer receipt is all-or-nothing in this Preview: every transfer SN must be scanned exactly once before confirmation. Partial receipt remains represented in the domain enum but is not exposed until a controlled partial-receipt policy is approved.
- Sydney floor geometry is presentation-only configuration. Quantities, conditions, frozen state, search results and location detail are calculated from PostgreSQL; no capacity percentage is shown because no approved capacity master exists.
- Activity Map remains disabled because the current bounded map query does not yet supply a reliable period-normalized activity metric.

## Sprint 6.1 outbound review decisions

- Review batches are temporary operator drafts stored in the current browser's local storage. They are not inventory, reservations, orders or ledger history. A lost browser draft has no stock effect.
- CSV/XLSX upload is a read-only preview step. SN, SKU and SH columns are found by semantic header aliases in the first twenty rows; no workbook coordinate or formula is trusted.
- ERP identity evidence for an SN cannot prove WMS physical presence. An ERP-resolved SN without a registered, located WMS serial remains `Unresolved` and cannot be confirmed.
- When multiple outbound lines have the same SKU and condition, automatic matching is intentionally ambiguous. The operator must select an existing order line; this correction does not alter SKU, condition or historical demand.
- Final outbound review confirmation is all-or-nothing for selected rows and all required serial-tracked lines. It revalidates inside a serializable transaction, converts exact SN allocations, and increases Frozen once without changing Physical Qty.
- Transfer review uses the same temporary intake and review presentation, but confirmation still creates the native cross-warehouse Transfer operation. It never routes through Move.
- Operator exclusion and remarks are review evidence only until confirmation. The final audit records the review reference and aggregate accepted SKU/condition evidence; excluded draft rows do not become stock transactions.

## Final business automation and reporting decisions

- Batch label selection is limited to existing Prepared or Ready_for_Pickup orders in one physical warehouse. The server reloads authoritative order lines and rejects stale or ineligible selections.
- One Pickup Code remains one A4 page. Missing Pickup Code falls back to SH No; different ERP warehouses remain separate rows on that page.
- Faulty receiving uses WMS identity and dispatched allocation history before ERP fallback. A missing original SH, missing SKU, wrong warehouse or unresolved identity remains an exception and is not guessed.
- A Supply Chain expected-inbound file can populate a bounded one-SKU batch and expected quantity. Final physical receipt still requires explicit operator confirmation.
- Weekly/monthly opening and closing balances are reconstructed only when ledger history exists for the requested period. Unsupported historical depth returns unavailable rather than an invented KPI.
- Warehouse floor and operational area are optional nullable master-data fields. No Preview warehouse area was fabricated; area productivity reports `Area data not configured` until approved measurements are entered.
- Operational Inventory Turnover is Outbound Units divided by Average Physical Inventory. It is an operational warehouse measure, not accounting inventory turnover.
- Notification channel delivery remains future work. The Preview documents event boundaries but does not claim email, Teams or Kingdee production connectivity.

## P0/P1 director-demo remediation

- Existing Exception rows predate warehouse ownership and cannot be safely attributed after the fact. They remain nullable and are excluded from warehouse-scoped totals. New WMS-created exceptions carry `warehouseId`.
- A reliable historical inventory report requires an Opening transaction before the requested period. If it is absent, the API returns unavailable fields and a reason code instead of current balances.
- Post-period Repair completion is reversed with its explicit `sourceCondition` and `targetCondition`; ordinary post-period movements reverse their recorded `physicalDelta` at the transaction condition.
- The dedicated transfer fixture uses only `DEMO-*` products, locations, references and SNs in a non-production database. It is installed explicitly and is never part of normal deploy, migration, seed or application startup.
