# Workflows

## Prepare and outbound

Prepare validates available stock per location, creates an allocation, freezes that location's quantity, updates totals, atomically generates a pickup code if needed, and writes transaction/audit rows. Repeating prepare at another location creates another allocation.

SN scan converts one aggregate prepared unit at the SN's location into a unit allocation. Dispatch requires prepared totals and all required unit SN allocations, consumes each exact balance, marks SNs Outbound and queues ERP sync.

## Faulty return

The server calls `ERPAdapter.findBySerialNumber()`. A missing record creates an ERP lookup exception. Confirmed receipt revalidates ERP data, enforces active-return idempotency, adds one Repair physical unit at SYD/REPAIR-01, updates the SN and writes transaction/audit rows atomically.

## Move and adjustment

Move validates both locations in the same warehouse and updates source, destination, selected SNs, one Move transaction and audit atomically. Adjustment uses one signed physical delta and cannot consume Frozen stock.

## Transfer

Transfer Out removes source Physical, adds source-balance In Transit, updates SNs and writes Transfer_Out. Transfer In releases In Transit, adds destination Physical, relocates SNs and writes Transfer_In.
