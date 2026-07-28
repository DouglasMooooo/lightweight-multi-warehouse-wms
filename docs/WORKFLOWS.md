# Workflows

## Replacement outbound

1. Import ERP Replacement Unit Information as `Pending_Allocation`; record `importedAt`.
2. Allocate one or more eligible physical locations; record `allocatedAt` only when fully allocated. Physical and Frozen do not change.
3. Scan/assign required serials against the exact allocations.
4. Confirm preparation. Exact balances increase Frozen; Physical is unchanged.
5. When all lines are prepared, attach one PickupBatch and set Ready for Pickup.
6. Confirm dispatch. Exact allocations reduce Physical and Frozen, SNs become Outbound and `outboundAt` is set.
7. Queue ERP write-back independently. Failure creates retryable work and does not reverse dispatch.

## Faulty return and repair

1. Query ERP by known returned SN and receive once to Repair stock.
2. Create a RepairReturn and RepairJob; preserve the existing serial entity when present.
3. Start repair: `Pending_Repair -> In_Repair`, recording `repairStartedAt`.
4. Only `In_Repair` can complete. Direct completion from Received/Pending_Repair is rejected.
5. Repair_Good decrements Repair, increments Repair_Good, restores the same SN to `In_Stock`, and appends transaction/audit evidence.
6. Scrap decrements Repair and increments non-allocatable Scrap; Returned_Unrepaired stays non-allocatable in Repair at a service/holding location.
7. Legacy / Manual Recognition requires a reason and is only for historical Repair_Good whose earlier lifecycle is unavailable.

## Pickup and label

Preparation freezes already allocated stock and attaches orders sharing a Pickup Code to one PickupBatch. A batch is Ready when its orders are ready; it becomes Picked_Up only after all active orders in the batch are dispatched. The one-page A4 label groups identical SKU + Model + ERP Warehouse rows across all SH documents. Label and pickup-code generation never mutate inventory.

## Move and adjustment

Move validates source and destination in the same warehouse and updates both balances, selected SNs, one Move transaction and audit atomically. Adjustment uses one signed physical delta and cannot consume Frozen stock. Cross-warehouse movement is Transfer.

## Transfer

Transfer Out removes source Physical, adds In Transit, updates SNs and writes Transfer_Out. Transfer In releases In Transit, adds destination Physical, relocates SNs and writes Transfer_In.

## Reporting and reconciliation

Reports use domain timestamps: movement flows use `effectiveAt`, outbound uses `outboundAt`, and preparation uses `preparedAt`. Machine scope comes from Product `reportMachine`, not item type. Reconciliation maps semantic fields, compares balances/SNs and never writes inventory.
