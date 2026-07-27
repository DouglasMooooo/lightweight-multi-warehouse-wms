# ERP integration

`ERPAdapter` prevents domain code from depending on a vendor.

Current conceptual operations:

- `findBySerialNumber`
- `getOutboundOrder`
- `getTransferOrder`
- `writeBackOutbound`
- `writeBackTransfer`
- `healthCheck`

`MockERPAdapter` contains fixtures outside inventory services. Faulty SN `60E5M4805C3F242` returns SH `SH-2607-00165610`, SKU `97-223-00107-00`, model EQ4800-S and a return-expected status.

Replacement outbound uses the ERP replacement structure, not faulty-unit details. ERP warehouse labels are mapped in master data:

- `悉尼物料仓` → New
- `悉尼良品仓` → Repair_Good

Production write-back is an outbox-style process through `ERPSyncJob`. Statuses are Pending, Synced, Failed, Retrying and Manual_Review. Retry is idempotent by entity and operation reference.
