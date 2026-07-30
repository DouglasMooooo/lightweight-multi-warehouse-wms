"use client";

import { CheckCircle2, ScanLine, Trash2 } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import type { OutboundOrder, StockCondition } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/status-badge";

interface OutboundBatchValidation {
  summary: { total: number; valid: number; invalid: number };
  lineSummary: Array<{
    lineId: string;
    sku: string;
    model: string;
    condition: StockCondition;
    requiredQty: number;
    assignedQty: number;
    batchMatchedQty: number;
  }>;
  results: Array<{
    scanId: string;
    serialNumber: string;
    sku?: string;
    model?: string;
    condition?: StockCondition;
    location?: string;
    lineId?: string;
    source: string;
    validationStatus: string;
    message: string;
  }>;
}

export function OutboundBatchScanner({
  order,
  onCommitted,
}: {
  order: OutboundOrder;
  onCommitted: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [scanValue, setScanValue] = useState("");
  const [rawValues, setRawValues] = useState<string[]>([]);
  const [validation, setValidation] = useState<OutboundBatchValidation>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function run(action: "validate" | "commit", values = rawValues) {
    if (!values.length) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/outbound/${order.id}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, rawValues: values }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("common.loadFailed"));
      setValidation(body);
      const last = body.results.at(-1);
      setFeedback(last ? `${last.serialNumber} · ${last.message}` : "");
      if (action === "commit") {
        setRawValues([]);
        setValidation(undefined);
        await onCommitted();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("common.loadFailed"));
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = scanValue.trim();
    if (!value || busy) return;
    setScanValue("");
    if (rawValues.some((raw) => raw.toUpperCase() === value.toUpperCase())) {
      setFeedback(t("scanner.duplicateScan"));
      return;
    }
    const next = [...rawValues, value];
    setRawValues(next);
    await run("validate", next);
  }

  return (
    <section className="batch-operation outbound-batch-operation">
      <div className="batch-operation-head"><div><span>{order.shNo}</span><h3>{t("outbound.batchTitle")}</h3><p>{t("outbound.batchHelp")}</p></div><ScanLine /></div>
      <form className="batch-scan-input" onSubmit={submit}>
        <label htmlFor="outbound-batch-scan"><ScanLine />{t("scanner.scanQrSn")}</label>
        <div><input id="outbound-batch-scan" ref={inputRef} autoFocus autoComplete="off" value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder={`${t("scanner.scanQrSn")} → Enter`} disabled={busy} /><Button type="submit" className="primary" disabled={busy}>{t("scanner.resolve")}</Button></div>
      </form>
      {feedback && <div className={`scan-feedback ${validation?.results.at(-1)?.validationStatus === "VALID" ? "success" : "error"}`} aria-live="polite">{feedback}</div>}
      <div className="batch-summary">
        <div><span>{t("scanner.batchSummary")}</span><strong>{rawValues.length}</strong></div>
        <div><span>{t("common.valid")}</span><strong>{validation?.summary.valid ?? 0}</strong></div>
        <div><span>{t("common.invalid")}</span><strong>{validation?.summary.invalid ?? 0}</strong></div>
      </div>
      <div className="outbound-line-progress">
        {(validation?.lineSummary ?? order.lines.map((line) => ({
          lineId: line.id,
          sku: line.sku,
          model: line.model,
          condition: line.requiredCondition,
          requiredQty: line.requiredQty,
          assignedQty: line.scannedSerials.length,
          batchMatchedQty: 0,
        }))).map((line) => {
          const complete = line.assignedQty + line.batchMatchedQty >= line.requiredQty;
          return <div className={complete ? "complete" : ""} key={line.lineId}><span><b className="mono">{line.sku}</b><small>{line.model}</small></span><StatusBadge code={line.condition} /><strong>{t("outbound.lineComplete", { scanned: line.assignedQty + line.batchMatchedQty, required: line.requiredQty })}</strong>{complete && <CheckCircle2 />}</div>;
        })}
      </div>
      {validation?.results.length ? <div className="table-wrap"><table><thead><tr><th>SN</th><th>SKU / {t("common.model")}</th><th>{t("common.condition")}</th><th>{t("common.location")}</th><th>{t("scanner.result")}</th><th /></tr></thead><tbody>{validation.results.map((row, index) => <tr className={row.validationStatus !== "VALID" ? "anomaly" : ""} key={row.scanId}><td className="mono">{row.serialNumber}</td><td><b className="mono">{row.sku ?? "—"}</b><small>{row.model ?? "—"}</small></td><td>{row.condition ? <StatusBadge code={row.condition} /> : "—"}</td><td className="mono">{row.location ?? "—"}</td><td><b>{row.validationStatus}</b><small>{row.message}</small></td><td><button type="button" className="icon-button" aria-label={t("scanner.remove")} onClick={() => { setRawValues((values) => values.filter((_, valueIndex) => valueIndex !== index)); setValidation(undefined); setFeedback(""); }}><Trash2 /></button></td></tr>)}</tbody></table></div> : null}
      <div className="batch-confirm-row"><span>{t("outbound.batchHelp")}</span><Button type="button" className="primary" disabled={busy || !validation?.summary.valid || Boolean(validation?.summary.invalid)} onClick={() => run("commit")}><CheckCircle2 />{t("scanner.confirmBatch")}</Button></div>
    </section>
  );
}
