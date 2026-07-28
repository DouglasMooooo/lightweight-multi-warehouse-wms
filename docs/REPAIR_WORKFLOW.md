# Repair Workflow

Native flow:

1. ERP faulty-SN lookup returns known data; unavailable optional data remains unknown.
2. Receipt creates one active RepairReturn and RepairJob, adds Repair physical stock and preserves the SN.
3. Start Repair records `repairStartedAt` and changes the job to `In_Repair`.
4. Complete as Repair_Good moves the same unit from Repair to Repair_Good at a selected location and records `repairCompletedAt`.
5. Scrap records the outcome without inventing good stock.

Duplicate active receipt is rejected with a stable validation code. Every state or stock change is audited. Legacy / Manual Recognition requires product, location, quantity and reason; it creates `RepairGood_Adjustment_In` evidence marked `Legacy_Manual`, not a fabricated job or serial history.
