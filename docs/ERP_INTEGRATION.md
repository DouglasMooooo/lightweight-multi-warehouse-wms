# ERP Integration

`ERPAdapter` defines server-side lookup, order retrieval, transfer retrieval and write-back. Sprint 1 uses `MockERPAdapter`; browser components do not instantiate adapters.

Faulty lookup failure creates an operational exception and does not invent SKU, model or SH data. Outbound and transfer confirmation create durable sync jobs. External failure is handled by Failed/Retrying/Manual Review state in later workers and never rewrites confirmed physical history.

Production Kingdee connectivity, credentials, retry workers and webhook reconciliation remain Sprint 2 scope.
