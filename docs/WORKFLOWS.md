# Workflows

## Prepare and dispatch

1. Load ERP/SH order and its Replacement Unit Information.
2. Show eligible inventory by physical location and condition.
3. Allocate no more than Available Qty.
4. Prepare: Physical unchanged; Frozen increases.
5. Generate a concurrency-safe warehouse pickup code.
6. Print the batch label without changing inventory.
7. Scan N unique matching SNs for an SN-tracked Qty N.
8. Confirm dispatch: Physical and Frozen both decrease.
9. Mark SNs Outbound, audit the operation and queue ERP write-back.

## Faulty return

1. Scan SN.
2. Query `ERPAdapter.findBySerialNumber`.
3. Display related SH, SKU, model and ERP status.
4. Confirm SYD receipt to `REPAIR-01`.
5. Create Return_to_Repair, increase Repair physical inventory and set SN status Repair.
6. If lookup fails, create Manual Review; do not guess data.

## Move

Validate same warehouse, distinct locations and sufficient Available Qty. In one transaction, decrement source and increment destination. Create one Move business record and one audit entry.

## Adjustment

Validate supervisor permission, item rules, quantity, reason and remark. Create Adjustment_In or Adjustment_Out and update the single relevant balance. Adjustment never impersonates Move.

## Transfer

Transfer Out decreases source Physical, increases In Transit and sets SN In_Transit. Transfer In decreases In Transit, increases destination Physical, and sets the SN’s warehouse/location and state to In_Stock.

## Stocktake

Capture an expected snapshot including Physical, Frozen and Available. Operators count quantity/SNs. Variance requires supervisor review; approval creates explicit adjustment transactions.
