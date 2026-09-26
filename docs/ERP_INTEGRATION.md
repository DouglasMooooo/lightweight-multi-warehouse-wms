# ERP Integration

`ERPAdapter` defines server-side replacement-order lookup, faulty-SN lookup, transfer retrieval and write-back. The Preview uses `MockERPAdapter`; browser components never instantiate an adapter or contain vendor-specific rules.

Replacement outbound import reads ERP Replacement Unit Information only. An ERP Pickup Code is preserved when present; otherwise WMS issues one atomically at preparation. ERP warehouse classification is stored separately from physical warehouse and location.

Faulty lookup failure creates an operational exception and never invents SKU, model or SH data. Outbound and transfer confirmation create durable sync jobs. External failure is handled through retry/manual review and never rewrites confirmed physical history.

Production Kingdee connectivity, credentials, retry workers, rate limiting and webhook reconciliation remain future integration work. The boundary and durable sync jobs are already present so integration does not change inventory semantics.
