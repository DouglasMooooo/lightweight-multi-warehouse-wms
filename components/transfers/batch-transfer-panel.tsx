"use client";

import { ScanLine, Trash2, Truck } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import type { StockCondition, WarehouseCode } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/status-badge";

interface TransferValidation {
  summary: { total: number; valid: number; invalid: number };
  results: Array<{
    scanId: string;
    rawValue: string;
    serialNumber: string;
    sku?: string;
    model?: string;
    condition?: StockCondition;
    warehouse?: WarehouseCode;
    location?: string;
    source: string;
    validationStatus: string;
    message: string;
  }>;
  groups: Array<{ sku: string; model: string; condition: StockCondition; quantity: number }>;
  transferNo?: string;
}

export function BatchTransferPanel({
  sourceWarehouse,
  onConfirmed,
}: {
  sourceWarehouse: WarehouseCode;
  onConfirmed: () => Promise<void>;
}) {
  const { t } = useI18n();
  const destinations = (["SYD", "MEL", "BNE"] as WarehouseCode[]).filter((code) => code !== sourceWarehouse);
  const [destinationWarehouse, setDestinationWarehouse] = useState<WarehouseCode>(destinations[0]);
  const [requiredCondition, setRequiredCondition] = useState<"New" | "Repair_Good" | "Repair">("Repair_Good");
  const [allowRepair, setAllowRepair] = useState(false);
  const [transferReference, setTransferReference] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [rawValues, setRawValues] = useState<string[]>([]);
  const [validation, setValidation] = useState<TransferValidation>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function validate(values: string[]) {
    if (!values.length || !transferReference.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/transfers/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          sourceWarehouse,
          destinationWarehouse,
          requiredCondition,
          transferReference,
          rawValues: values,
          allowRepair,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("common.loadFailed"));
      setValidation(body);
      const last = body.results.at(-1);
      setFeedback(last ? `${last.serialNumber} · ${last.message}` : "");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("common.loadFailed"));
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function submitScan(event: FormEvent) {
    event.preventDefault();
    const value = scanValue.trim();
    if (!value || busy) return;
    setScanValue("");
    const normalized = value.toUpperCase();
    if (rawValues.some((raw) => raw.toUpperCase() === normalized)) {
      setFeedback(t("scanner.duplicateScan"));
      inputRef.current?.focus();
      return;
    }
    const next = [...rawValues, value];
    setRawValues(next);
    await validate(next);
  }

  async function confirm() {
    if (!validation || validation.summary.invalid || !validation.summary.valid) return;
    setBusy(true);
    try {
      const response = await fetch("/api/transfers/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          sourceWarehouse,
          destinationWarehouse,
          requiredCondition,
          transferReference,
          rawValues,
          allowRepair,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("common.loadFailed"));
      setFeedback(`${body.transferNo} · ${t("status.In_Transit")}`);
      setRawValues([]);
      setValidation(undefined);
      setTransferReference("");
      await onConfirmed();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("common.loadFailed"));
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <section className="batch-operation">
      <div className="batch-operation-head"><div><span>{t("outbound.batchTitle")}</span><h3>{t("transfer.batchTitle")}</h3><p>{t("transfer.batchSubtitle")}</p></div><Truck /></div>
      <div className="batch-context-grid">
        <label><span>{t("transfer.from")}</span><input value={sourceWarehouse} disabled /></label>
        <label><span>{t("transfer.to")}</span><select value={destinationWarehouse} onChange={(event) => setDestinationWarehouse(event.target.value as WarehouseCode)}>{destinations.map((code) => <option key={code}>{code}</option>)}</select></label>
        <label><span>{t("transfer.conditionPolicy")}</span><select value={requiredCondition} onChange={(event) => setRequiredCondition(event.target.value as "New" | "Repair_Good" | "Repair")}><option value="New">{t("condition.New")}</option><option value="Repair_Good">{t("condition.Repair_Good")}</option><option value="Repair">{t("condition.Repair")}</option></select></label>
        <label><span>{t("transfer.reference")}</span><input value={transferReference} onChange={(event) => { setTransferReference(event.target.value.toUpperCase()); setValidation(undefined); }} placeholder="TR-…" /></label>
        {requiredCondition === "Repair" && <label className="checkbox-row"><input type="checkbox" checked={allowRepair} onChange={(event) => setAllowRepair(event.target.checked)} />{t("condition.Repair")}</label>}
      </div>
      <form className="batch-scan-input" onSubmit={submitScan}>
        <label htmlFor="transfer-scan"><ScanLine />{t("scanner.scanQrSn")}</label>
        <div><input id="transfer-scan" ref={inputRef} autoFocus autoComplete="off" value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder={`${t("scanner.scanQrSn")} → Enter`} disabled={busy} /><Button type="submit" className="primary" disabled={busy || !transferReference.trim()}>{t("scanner.resolve")}</Button></div>
      </form>
      {feedback && <div className={`scan-feedback ${validation?.results.at(-1)?.validationStatus === "VALID" ? "success" : "error"}`} aria-live="polite">{feedback}</div>}
      <div className="batch-summary">
        <div><span>{t("scanner.batchSummary")}</span><strong>{t("transfer.scannedUnits", { count: rawValues.length })}</strong></div>
        <div><span>{t("common.valid")}</span><strong>{validation?.summary.valid ?? 0}</strong></div>
        <div><span>{t("common.invalid")}</span><strong>{validation?.summary.invalid ?? 0}</strong></div>
      </div>
      {validation?.groups.length ? <div className="batch-groups"><h4>{t("transfer.autoGrouped")}</h4>{validation.groups.map((group) => <div key={`${group.sku}:${group.condition}`}><span><b className="mono">{group.sku}</b><small>{group.model}</small></span><StatusBadge code={group.condition} /><strong>× {group.quantity}</strong></div>)}</div> : null}
      {validation?.results.length ? <div className="table-wrap"><table><thead><tr><th>SN</th><th>SKU / {t("common.model")}</th><th>{t("common.condition")}</th><th>{t("common.location")}</th><th>{t("scanner.result")}</th><th /></tr></thead><tbody>{validation.results.map((row, index) => <tr className={row.validationStatus !== "VALID" ? "anomaly" : ""} key={row.scanId}><td className="mono">{row.serialNumber}</td><td><b className="mono">{row.sku ?? "—"}</b><small>{row.model ?? "—"}</small></td><td>{row.condition ? <StatusBadge code={row.condition} /> : "—"}</td><td className="mono">{row.location ?? "—"}</td><td><b>{row.validationStatus}</b><small>{row.message}</small></td><td><button type="button" className="icon-button" aria-label={t("scanner.remove")} onClick={() => { const next = rawValues.filter((_, valueIndex) => valueIndex !== index); setRawValues(next); setValidation(undefined); setFeedback(""); }}><Trash2 /></button></td></tr>)}</tbody></table></div> : null}
      <div className="batch-confirm-row"><span>{t("transfer.autoGrouped")}</span><Button type="button" className="primary" disabled={busy || !validation?.summary.valid || Boolean(validation?.summary.invalid)} onClick={confirm}><Truck />{t("transfer.confirmOut")}</Button></div>
    </section>
  );
}
