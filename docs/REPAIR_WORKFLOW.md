# Repair Workflow

Native flow:

1. ERP faulty-SN lookup returns known data; unavailable optional data remains unknown.
2. Receipt creates one active RepairReturn and RepairJob, adds Repair physical stock and preserves the SN.
3. Start Repair records `repairStartedAt` and changes the job to `In_Repair`.
4. Only In_Repair can complete. Repair_Good moves the same unit from Repair to Repair_Good, sets the SN to In_Stock and records both completion and usable-stock return time.
5. Scrap moves one unit to non-allocatable Scrap and marks the SN Scrapped. Returned_Unrepaired remains Repair/Repair at a service or holding location.

Duplicate active receipt is rejected with a stable validation code. Every state or stock change is audited. Legacy / Manual Recognition requires product, location, quantity and reason; it creates `RepairGood_Adjustment_In` evidence marked `Legacy_Manual`, not a fabricated job or serial history.

`returnedToStockAt` is null for Scrap and Returned_Unrepaired. The Repair_Completed ledger records both conditions and locations, outcome, SN, SH reference, effective time, actor and one operation ID. Scrap disposal/`Scrap_Out` is deliberately future work.
