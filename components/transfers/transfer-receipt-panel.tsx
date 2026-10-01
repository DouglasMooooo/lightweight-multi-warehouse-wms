"use client";

import { FormEvent, useRef, useState } from "react";
import { PackageCheck, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { useI18n } from "@/i18n/provider";

interface ReceiptValidation {
  summary: { total: number; expected: number; valid: number; invalid: number; missing: number };
  results: Array<{
    scanId: string;
    serialNumber: string;
    sku?: string;
    model?: string;
    condition?: string;
    validationStatus: string;
    message: string;
  }>;
}

export function TransferReceiptPanel({
  transferId,
  transferNo,
  destinationWarehouse,
  expectedCount,
  onConfirmed,
}: {
  transferId: string;
  transferNo: string;
  destinationWarehouse: string;
  expectedCount: number;
  onConfirmed: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [destinationLocation, setDestinationLocation] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [rawValues, setRawValues] = useState<string[]>([]);
  const [validation, setValidation] = useState<ReceiptValidation>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function request(action: "validate" | "confirm", values: string[]) {
    setBusy(true);
    try {
      const response = await fetch(`/api/transfers/${encodeURIComponent(transferId)}/receipt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, destinationLocation, rawValues: values }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("common.loadFailed"));
      setValidation(body);
      setFeedback(action === "confirm"
        ? `${transferNo} · ${t("transfer.complete")}`
        : body.results.at(-1)?.message ?? "");
      if (action === "confirm") {
        setRawValues([]);
        await onConfirmed();
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
    if (!value || !destinationLocation.trim() || busy) return;
    setScanValue("");
    const next = [...rawValues, value];
    setRawValues(next);
    await request("validate", next);
  }

  return (
    <section className="batch-operation transfer-receipt">
      <div className="batch-operation-head">
        <div><span>{transferNo}</span><h3>{t("transfer.receiveTitle")}</h3><p>{destinationWarehouse} · {expectedCount} SN</p></div>
        <PackageCheck />
      </div>
      <div className="batch-context-grid">
        <label>
          <span>{t("transfer.to")}</span>
          <input value={destinationWarehouse} disabled />
        </label>
        <label>
          <span>{t("common.location")}</span>
          <input
            value={destinationLocation}
            onChange={(event) => {
              setDestinationLocation(event.target.value.toUpperCase());
              setValidation(undefined);
            }}
            placeholder={t("transfer.destinationPending")}
          />
        </label>
      </div>
      <form className="batch-scan-input" onSubmit={submit}>
        <label htmlFor={`receipt-${transferId}`}><ScanLine />{t("scanner.scanQrSn")}</label>
        <div>
          <input
            id={`receipt-${transferId}`}
            ref={inputRef}
            autoComplete="off"
            value={scanValue}
            onChange={(event) => setScanValue(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" className="primary" disabled={busy || !destinationLocation.trim()}>
            {t("scanner.resolve")}
          </Button>
        </div>
      </form>
      {feedback && <div className="scan-feedback" aria-live="polite">{feedback}</div>}
      <div className="batch-summary">
        <div><span>{t("transfer.scannedUnits", { count: rawValues.length })}</span><strong>{rawValues.length} / {expectedCount}</strong></div>
        <div><span>{t("common.valid")}</span><strong>{validation?.summary.valid ?? 0}</strong></div>
        <div><span>{t("common.invalid")}</span><strong>{(validation?.summary.invalid ?? 0) + (validation?.summary.missing ?? expectedCount)}</strong></div>
      </div>
      {validation?.results.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>SN</th><th>SKU</th><th>{t("common.condition")}</th><th>{t("scanner.result")}</th><th /></tr></thead>
            <tbody>
              {validation.results.map((row, index) => (
                <tr className={row.validationStatus !== "VALID" ? "anomaly" : ""} key={row.scanId}>
                  <td className="mono">{row.serialNumber}</td>
                  <td><b className="mono">{row.sku ?? "—"}</b><small>{row.model ?? "—"}</small></td>
                  <td>{row.condition ? <StatusBadge code={row.condition} /> : "—"}</td>
                  <td><b>{row.validationStatus}</b><small>{row.message}</small></td>
                  <td><button className="icon-button" type="button" onClick={() => {
                    const next = rawValues.filter((_, candidate) => candidate !== index);
                    setRawValues(next);
                    setValidation(undefined);
                  }} aria-label={t("scanner.remove")}><Trash2 /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="batch-confirm-row">
        <span>{t("transfer.scannedUnits", { count: rawValues.length })}</span>
        <Button
          type="button"
          className="primary"
          disabled={
            busy ||
            !validation ||
            Boolean(validation.summary.invalid) ||
            Boolean(validation.summary.missing) ||
            validation.summary.valid !== validation.summary.expected
          }
          onClick={() => request("confirm", rawValues)}
        >
          <PackageCheck />{t("transfer.confirmReceipt")}
        </Button>
      </div>
    </section>
  );
}
