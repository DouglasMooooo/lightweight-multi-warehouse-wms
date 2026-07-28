# Workflows

## Replacement outbound

1. Import read-only ERP Replacement Unit Information as `Pending_Allocation`.
2. Select one or more eligible physical locations. This creates allocations only.
3. Scan/assign required serials against those allocations.
4. Confirm physical preparation. Exact balances increase Frozen; Physical is unchanged.
5. When all lines are prepared, create or attach one PickupBatch and expose its A4 batch label.
6. Confirm dispatch. Exact allocations reduce Physical and Frozen, serials become Outbound, and `outboundAt` is set.
7. Queue ERP write-back independently. Failure creates retryable operational work and does not reverse confirmed physical dispatch.

## Faulty return and repair

1. Query ERP by known returned SN and receive once to Repair stock.
2. Create a RepairReturn plus linked RepairJob; preserve the existing serial entity when present.
3. Complete repair by choosing outcome and target physical location.
4. For Repair_Good, decrement Repair balance, increment Repair_Good balance, set the same SN to `In_Stock`, and append repair transaction/audit records.
5. Use Legacy / Manual Recognition only for historical Repair_Good stock whose earlier repair lifecycle is unavailable.

## Shadow reconciliation

Map workbook rows by semantic headers into SKU, condition, physical location, optional container and quantity. Compare with WMS balances and report match/missing/quantity/condition/location outcomes. No result writes inventory.

## Prepare and outbound

Prepare validates available stock per location, creates an allocation, freezes that location's quantity, updates totals, atomically generates a pickup code if needed, and writes transaction/audit rows. Repeating prepare at another location creates another allocation.

SN scan converts one aggregate prepared unit at the SN's location into a unit allocation. Dispatch requires prepared totals and all required unit SN allocations, consumes each exact balance, marks SNs Outbound and queues ERP sync.

## Faulty return

The server calls `ERPAdapter.findBySerialNumber()`. A missing record creates an ERP lookup exception. Confirmed receipt revalidates ERP data, enforces active-return idempotency, adds one Repair physical unit at SYD/REPAIR-01, updates the SN and writes transaction/audit rows atomically.

## Move and adjustment

Move validates both locations in the same warehouse and updates source, destination, selected SNs, one Move transaction and audit atomically. Adjustment uses one signed physical delta and cannot consume Frozen stock.

## Transfer

Transfer Out removes source Physical, adds source-balance In Transit, updates SNs and writes Transfer_Out. Transfer In releases In Transit, adds destination Physical, relocates SNs and writes Transfer_In.
