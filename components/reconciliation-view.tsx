"use client";

import { useMemo, useState } from "react";
import type { Warehouse } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { reconciliationToCsv } from "@/import/reconciliation-csv";
import type { ShadowImportResult } from "@/import/workbook-types";
import { canShowShadowSeed } from "@/lib/environment";
import {
  currentWarehouseWallClock,
  formatWarehouseDateTime,
  warehouseWallClockToUtc,
} from "@/lib/warehouse-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/ui";

type Result = ShadowImportResult & {
  seeded: boolean;
  duplicate: boolean;
  importBatchId?: string;
};

export function ReconciliationView({ warehouse }: { warehouse: Warehouse }) {
  const { locale, t } = useI18n();
  const [file, setFile] = useState<File>();
  const [cutoverAt, setCutoverAt] = useState(() => currentWarehouseWallClock(warehouse.timezone));
  const seedVisible = canShowShadowSeed({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    enabled: process.env.NEXT_PUBLIC_SHADOW_IMPORT_ENABLED,
    adminTools: process.env.NEXT_PUBLIC_ENABLE_ADMIN_TOOLS,
  });
  const [mode, setMode] = useState<"DRY_RUN" | "SHADOW_SEED">("DRY_RUN");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issueType, setIssueType] = useState("");
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState(false);

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
  const cutoverPreview = useMemo(() => {
    try {
      return warehouseWallClockToUtc(cutoverAt, warehouse.timezone);
    } catch {
      return undefined;
    }
  }, [cutoverAt, warehouse.timezone]);

  async function run() {
    if (!file) {
      setError(t("reconciliation.chooseWorkbook"));
      return;
    }
    setBusy(true);
    setError("");
    setCompleted(false);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("cutoverAt", warehouseWallClockToUtc(cutoverAt, warehouse.timezone).toISOString());
      form.set("mode", seedVisible ? mode : "DRY_RUN");
      form.set("replaceExisting", mode === "SHADOW_SEED" && replaceExisting ? "true" : "false");
      const response = await fetch("/api/reconciliation", { method: "POST", body: form });
      const body = (await response.json()) as Result | { error: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Reconciliation failed.");
      setResult(body as Result);
      setCompleted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reconciliation failed.");
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
      <PageHeader
        title={t("title.reconciliation")}
        subtitle={t("reconciliation.subtitle")}
        badge={<StatusBadge code="Pending" label={t("reconciliation.shadowMode")} tone="neutral" />}
      />
      <ol className="workflow-steps" aria-label={t("reconciliation.workflow")}>
        {[t("reconciliation.upload"), t("reconciliation.cutover"), t("reconciliation.run"), t("reconciliation.review"), t("reconciliation.export")]
          .map((label, index) => <li className={result && index >= 3 ? "done" : index <= 2 ? "active" : ""} key={label}><span>{index + 1}</span>{label}</li>)}
      </ol>
      <div className="panel">
        <div className="panel-body form-grid">
          <div className="field full">
            <label>{t("reconciliation.upload")} (.xlsx · 20 MB max)</label>
            <input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0])} />
          </div>
          <div className="field">
            <label>{t("reconciliation.cutover")}</label>
            <input type="datetime-local" value={cutoverAt} onChange={(event) => setCutoverAt(event.target.value)} />
            <span className="field-help">{warehouse.code} · {warehouse.name} · {warehouse.timezone}</span>
          </div>
          <div className="field">
            <label>{t("reconciliation.mode")}</label>
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="DRY_RUN">{t("reconciliation.compareOnly")}</option>
              {seedVisible && <option value="SHADOW_SEED">{t("reconciliation.adminShadowSeed")}</option>}
            </select>
          </div>
          <div className="field full">
            {seedVisible && mode === "SHADOW_SEED" && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                />
                Replace existing Preview operational data with this workbook (non-production only)
              </label>
            )}
            <div className="cutover-preview">
              <strong>{t("reconciliation.cutover")}:</strong>{" "}
              {cutoverPreview
                ? formatWarehouseDateTime(cutoverPreview, locale, warehouse.timezone)
                : "—"}
              <span>{t("reconciliation.timezone")}: {warehouse.timezone}</span>
            </div>
            <button className="btn primary" disabled={busy} onClick={run}>
              {busy ? t("reconciliation.reconciling") : t("reconciliation.run")}
            </button>
          </div>
        </div>
      </div>
      {completed && <div className="notice" style={{ marginTop: 15 }}>{t("reconciliation.completed")}</div>}
      {error && <div className="notice error" style={{ marginTop: 15 }}>{error}</div>}
      {result && (
        <>
          <div className="grid reconciliation-metrics">
            {[
              ["MATCH", result.summary.matches, "teal"],
              ["Critical", result.summary.critical, "red"],
              ["High", result.summary.high, "red"],
              ["Medium", result.summary.medium, "amber"],
              ["Low", result.summary.low, "neutral"],
            ].map(([label, value, tone]) => (
              <div className="metric" key={label}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><StatusBadge code={String(label)} label={String(label)} tone={String(tone)} /></div>
            ))}
          </div>
          <div className="panel">
            <div className="toolbar">
              <input
                aria-label={t("common.search")}
                placeholder={t("reconciliation.search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select value={issueType} onChange={(event) => setIssueType(event.target.value)}>
                <option value="">{t("reconciliation.allIssues")}</option>
                {issueTypes.map((value) => <option key={value}>{value}</option>)}
              </select>
              <button className="btn" onClick={exportCsv}>{t("reconciliation.export")}</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>{t("reconciliation.whatWrong")}</th><th>SKU / SN</th>
                  <th>{t("reconciliation.workbookQty")}</th><th>{t("reconciliation.wmsQty")}</th>
                  <th>{t("reconciliation.workbookLocation")}</th><th>{t("reconciliation.wmsLocation")}</th>
                  <th>{t("reconciliation.severity")}</th><th>{t("common.technicalDetails")}</th>
                </tr></thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.discrepancyType}-${row.sku ?? row.serialNumber ?? index}-${index}`}>
                      <td><strong>{row.comment}</strong><div className="subtle mono">{row.discrepancyType}</div></td>
                      <td><span className="mono strong">{row.sku ?? "—"}</span><div className="subtle mono">{row.serialNumber}</div></td>
                      <td className="number">{row.workbookQty ?? "—"}</td><td className="number">{row.wmsQty ?? "—"}</td>
                      <td className="mono">{row.workbookLocation ?? "—"}</td><td className="mono">{row.wmsLocation ?? "—"}</td>
                      <td><StatusBadge code={row.severity} label={row.severity} /></td>
                      <td><details><summary>{t("common.technicalDetails")}</summary><div className="diagnostic-details">{row.source}<br />{row.classification}<br />{row.workbookCondition ?? "—"} → {row.wmsCondition ?? "—"}</div></details></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="empty">{t("common.noResults")}</div>}
            </div>
          </div>
          <details className="technical-summary"><summary>{t("common.technicalDetails")}</summary>
            <div>SHA-256: <span className="mono">{result.sourceChecksum}</span></div>
            <div>Accepted: {result.acceptedRows} · Warnings: {result.warningRows} · Rejected: {result.rejectedRows}</div>
          </details>
        </>
      )}
    </>
  );
}
