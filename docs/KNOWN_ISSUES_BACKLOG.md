# Known Issues and Backlog

Remaining Preview limitations after the P0/P1 director-demo remediation.

| Priority | Area | Limitation | Required next step |
|---|---|---|---|
| P1 | Legacy exceptions | Pre-migration Exception rows have no reliable warehouse owner and are excluded from scoped totals | Map only rows with documentary warehouse evidence; never infer |
| P1 | Demo transfer | `DEMO-TRANSFER-001` is a one-way rehearsal fixture; completed SNs are intentionally not reset | Prepare a new numbered synthetic fixture for another destructive rehearsal |
| P1 | ERP | Preview uses `MockERPAdapter`; Kingdee contract, credentials and write-back are unverified | Approve the gateway contract and complete integration/UAT |
| P1 | Authorization | Navigation is role-aware, but API/domain authorization is not a complete production RBAC boundary | Add authenticated principal and endpoint permission enforcement |
| P1 | Legacy API | `/api/wms` includes a Preview reset command in its schema | Remove or hard-disable before production cutover |
| P2 | Historical reports | Periods before the first Opening baseline correctly show unavailable | Establish approved cutover snapshots if older history is required |
| P2 | Warehouse area | Floor and operational area are null in Preview | Load approved measurements through controlled master-data change |
| P2 | Transfer receipt | Receipt is all-or-nothing; partial receipt policy is not exposed | Approve shortage, damage and partial receipt rules |
| P2 | Notifications | Email, Teams and Kingdee notification delivery are not implemented | Select channels and define retry/escalation policy |
| P2 | Review drafts | Outbound and transfer review drafts use browser local storage | Decide whether multi-workstation handoff needs server persistence |
| P2 | Legacy outbound status | Existing shadow-import orders can have complete SN evidence but remain raw `Prepared` until explicitly reconciled | Run the guarded readiness audit/reconciliation only with approved Preview credentials; do not infer or fabricate SNs |
| P3 | Activity map | Disabled because a reliable normalized activity metric is not approved | Define period, weighting and interpretation |

## Closed by this patch

- Dashboard and Operations Report Exception totals are warehouse-scoped.
- Historical New, Repair_Good, Repair and condition totals no longer use current balances as historical values.
- Missing historical baseline produces a reason-specific unavailable state.
- Dashboard allocatable-product and Inventory Report physical-available labels are distinct.
- Warehouse Map states its Product + Material scope.
- Visible `Not registered`, `New`, `Pending`, `Qty` and `Unmapped` presentation gaps are translated.
- Area and historical KPI unavailable states have distinct reasons.
- A guarded, non-production-only `DEMO-TRANSFER-001` installer is available.
- Quantity-complete serial-tracked outbound orders no longer enter Awaiting Pickup until authoritative SN assignments are complete; dispatch reuses preparation assignments.
