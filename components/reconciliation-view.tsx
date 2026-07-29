"use client";

import { useMemo, useState } from "react";
import type { ShadowImportResult } from "@/import/workbook-types";
import { reconciliationToCsv } from "@/import/reconciliation-csv";

type Result = ShadowImportResult & {
  seeded: boolean;
  duplicate: boolean;
  importBatchId?: string;
};

export function ReconciliationView() {
  const [file, setFile] = useState<File>();
  const [cutoverAt, setCutoverAt] = useState(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  });
  const [mode, setMode] = useState<"DRY_RUN" | "SHADOW_SEED">("DRY_RUN");
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issueType, setIssueType] = useState("");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const search = query.trim().toUpperCase();
    return (result?.reconciliation ?? []).filter(
      (row) =>
        (!issueType || row.discrepancyType === issueType) &&
        (!search ||
          [row.sku, row.workbookLocation, row.wmsLocation, row.serialNumber, row.classification]
            .filter(Boolean)
            .some((value) => String(value).toUpperCase().includes(search))),
    );
  }, [issueType, query, result]);
  const issueTypes = useMemo(
    () => [...new Set((result?.reconciliation ?? []).map((row) => row.discrepancyType))].sort(),
    [result],
  );

  async function run() {
    if (!file) {
      setError("Choose the latest Sydney .xlsx workbook.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("cutoverAt", new Date(cutoverAt).toISOString());
      form.set("mode", mode);
      const response = await fetch("/api/reconciliation", { method: "POST", body: form });
      const body = (await response.json()) as Result | { error: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Import failed.");
      setResult(body as Result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const blob = new Blob([reconciliationToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wms-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Shadow Reconciliation</h2>
          <p>
            Read-only semantic workbook comparison. It never edits the source workbook or automatically
            corrects WMS inventory.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h3>Import snapshot</h3></div>
        <div className="panel-body form-grid">
          <div className="field full">
            <label>Workbook (.xlsx, maximum 20 MB)</label>
            <input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0])} />
          </div>
          <div className="field">
            <label>Shadow cutover time (operator local time)</label>
            <input type="datetime-local" value={cutoverAt} onChange={(event) => setCutoverAt(event.target.value)} />
          </div>
          <div className="field">
            <label>Mode</label>
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="DRY_RUN">DRY_RUN — compare only</option>
              <option value="SHADOW_SEED">SHADOW_SEED — guarded dev opening seed</option>
            </select>
          </div>
          <div className="field full">
            <button className="btn primary" disabled={busy} onClick={run}>
              {busy ? "Reading workbook…" : mode === "DRY_RUN" ? "Run dry reconciliation" : "Run guarded shadow seed"}
            </button>
          </div>
        </div>
      </div>
      {error && <div className="notice error" style={{ marginTop: 15 }}>{error}</div>}
      {result && (
        <>
          <div className="grid metrics" style={{ marginTop: 15 }}>
            {[
              ["Matches", result.summary.matches],
              ["Critical", result.summary.critical],
              ["High", result.summary.high],
              ["Medium", result.summary.medium],
              ["Low", result.summary.low],
              ["Active SH", result.activeOutboundOrders.length],
              ["Repair items", result.repairItems.length],
            ].map(([label, value]) => (
              <div className="metric" key={label}>
                <div className="metric-label">{label}</div>
                <div className="metric-value">{value}</div>
              </div>
            ))}
          </div>
          <div className="notice warn" style={{ marginTop: 15 }}>
            Source checksum: <span className="mono">{result.sourceChecksum}</span>. Accepted ledger rows:{" "}
            {result.acceptedRows}; warnings: {result.warningRows}; rejected: {result.rejectedRows}.
            {result.duplicate ? " Duplicate seed identified; no stock was added." : ""}
          </div>
          <div className="panel">
            <div className="toolbar">
              <input
                placeholder="Filter SKU, location, SN or classification"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select value={issueType} onChange={(event) => setIssueType(event.target.value)}>
                <option value="">All issue types</option>
                {issueTypes.map((value) => <option key={value}>{value}</option>)}
              </select>
              <button className="btn" onClick={exportCsv}>Export filtered CSV</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Status</th><th>Severity</th><th>Source</th><th>SKU / SN</th>
                  <th>Workbook Qty</th><th>WMS Qty</th><th>Workbook Location</th>
                  <th>WMS Location</th><th>Condition</th><th>Classification</th><th>Notes</th>
                </tr></thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.discrepancyType}-${row.sku ?? row.serialNumber ?? index}-${index}`}>
                      <td><span className="badge">{row.discrepancyType}</span></td>
                      <td>{row.severity}</td><td>{row.source}</td>
                      <td><span className="strong">{row.sku ?? "—"}</span><div className="subtle mono">{row.serialNumber}</div></td>
                      <td className="number">{row.workbookQty ?? "—"}</td>
                      <td className="number">{row.wmsQty ?? "—"}</td>
                      <td>{row.workbookLocation ?? "—"}</td><td>{row.wmsLocation ?? "—"}</td>
                      <td>{row.workbookCondition ?? row.wmsCondition ?? "—"}</td>
                      <td>{row.classification}</td><td>{row.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="empty">No reconciliation rows match the filters.</div>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
