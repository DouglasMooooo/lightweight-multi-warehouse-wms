"use client";

import {
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  ScanLine,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  mergeReviewRows,
  splitReviewPaste,
  type ScanReviewFilePreview,
  type ScanReviewInputRow,
} from "@/domain/scan-review";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/status-badge";

export interface ReviewLineOption {
  id: string;
  sku: string;
  model: string;
  requiredCondition: string;
  requiredQty: number;
  assignedQty?: number;
}

interface ReviewResult {
  rowId: string;
  rawValue: string;
  serialNumber: string;
  sku?: string;
  model?: string;
  condition?: string;
  warehouse?: string;
  location?: string;
  source?: string;
  targetLineId?: string;
  targetLabel?: string;
  included: boolean;
  operatorRemark?: string;
  validationStatus: "VALID" | "NEEDS_ATTENTION" | "UNRESOLVED" | "EXCLUDED";
  validationCode: string;
  message: string;
}

interface ReviewResponse {
  batchReference?: string;
  summary: {
    total: number;
    valid: number;
    needsAttention: number;
    unresolved: number;
    excluded: number;
  };
  results: ReviewResult[];
  lineSummary?: Array<{
    lineId: string;
    sku: string;
    model: string;
    condition: string;
    requiredQty: number;
    assignedQty: number;
    batchMatchedQty: number;
  }>;
  groups?: Array<{ sku: string; model: string; condition: string; quantity: number }>;
}

function loadDraft(key: string) {
  if (typeof window === "undefined") return [] as ScanReviewInputRow[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 500) : [];
  } catch {
    return [];
  }
}

export function ScanReviewWorkbench({
  endpoint,
  persistenceKey,
  requestContext,
  lines = [],
  title,
  subtitle,
  confirmLabel,
  onConfirmed,
}: {
  endpoint: string;
  persistenceKey: string;
  requestContext?: Record<string, unknown>;
  lines?: ReviewLineOption[];
  title: string;
  subtitle: string;
  confirmLabel: string;
  onConfirmed: () => Promise<void>;
}) {
  const { t, error: friendlyError } = useI18n();
  const storageKey = `wms-review:${persistenceKey}`;
  const [rows, setRows] = useState<ScanReviewInputRow[]>(() => loadDraft(storageKey));
  const [scanValue, setScanValue] = useState("");
  const [pasteValue, setPasteValue] = useState("");
  const [preview, setPreview] = useState<ScanReviewFilePreview>();
  const [validation, setValidation] = useState<ReviewResponse>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef({ value: "", at: 0 });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(rows));
  }, [rows, storageKey]);

  async function request(
    action: "validate" | "lookup" | "confirm",
    submittedRows = rows,
  ) {
    if (!submittedRows.length) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...requestContext,
          action,
          rows: submittedRows,
          reviewBatchReference:
            validation?.batchReference ??
            `RWB-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(friendlyError(body.code, body.error));
      if (action === "confirm") {
        if (body.confirmed === false) throw new Error(t("review.changed"));
        window.localStorage.removeItem(storageKey);
        setRows([]);
        setValidation(undefined);
        setFeedback(t("review.confirmed"));
        await onConfirmed();
        return;
      }
      setValidation(body);
      setFeedback(t("review.validated", body.summary));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("common.loadFailed"));
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function append(
    additions: Array<Omit<ScanReviewInputRow, "rowId">>,
    validateAfter = false,
  ) {
    const merged = mergeReviewRows(rows, additions, () => crypto.randomUUID());
    setRows(merged.rows);
    setValidation(undefined);
    setFeedback(
      merged.duplicates.length
        ? t("review.duplicatesSkipped", { count: merged.duplicates.length })
        : t("review.added", { count: merged.added.length }),
    );
    if (validateAfter && merged.added.length) void request("validate", merged.rows);
  }

  function submitScan(event: FormEvent) {
    event.preventDefault();
    const value = scanValue.trim();
    if (!value || busy) return;
    const normalized = value.toUpperCase();
    const now = Date.now();
    if (lastScan.current.value === normalized && now - lastScan.current.at < 1200) {
      setFeedback(t("scanner.duplicateScan"));
      return;
    }
    lastScan.current = { value: normalized, at: now };
    setScanValue("");
    append([{ rawValue: value, included: true }], true);
  }

  async function previewFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/review-batches/parse", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(friendlyError(body.code, body.error));
      setPreview(body);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("review.fileFailed"));
    } finally {
      setBusy(false);
    }
  }

  function changeRow(rowId: string, patch: Partial<ScanReviewInputRow>) {
    setRows((current) => current.map((row) => row.rowId === rowId ? { ...row, ...patch } : row));
    setValidation(undefined);
  }

  const byRow = new Map(validation?.results.map((result) => [result.rowId, result]));
  const canConfirm = Boolean(
    validation?.summary.valid &&
    !validation.summary.needsAttention &&
    !validation.summary.unresolved,
  );

  return (
    <section className="batch-operation review-workbench">
      <div className="batch-operation-head">
        <div>
          <span>{t("review.eyebrow")}</span>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <FileSpreadsheet />
      </div>

      <div className="review-input-grid">
        <form className="review-input-card" onSubmit={submitScan}>
          <label htmlFor={`${persistenceKey}-scan`}><ScanLine />{t("review.scan")}</label>
          <div>
            <input
              id={`${persistenceKey}-scan`}
              ref={inputRef}
              autoFocus
              autoComplete="off"
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              placeholder={t("review.scanPlaceholder")}
            />
            <Button type="submit" className="primary" disabled={busy}>{t("review.add")}</Button>
          </div>
        </form>
        <div className="review-input-card">
          <label><Upload />{t("review.paste")}</label>
          <textarea
            rows={3}
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
            placeholder={t("review.pastePlaceholder")}
          />
          <Button
            type="button"
            disabled={!pasteValue.trim()}
            onClick={() => {
              append(splitReviewPaste(pasteValue).map((rawValue) => ({ rawValue })));
              setPasteValue("");
            }}
          >
            {t("review.addPaste")}
          </Button>
        </div>
        <div className="review-input-card">
          <label><FileSpreadsheet />{t("review.file")}</label>
          <label className="btn">
            {t("review.chooseFile")}
            <input
              type="file"
              hidden
              accept=".csv,.txt,.xlsx"
              onChange={(event) => void previewFile(event.target.files?.[0])}
            />
          </label>
          <small>{t("review.fileHelp")}</small>
        </div>
      </div>

      {preview && (
        <div className="review-file-preview">
          <div>
            <b>{preview.fileName}</b>
            <span>{t("review.fileCounts", {
              detected: preview.rowsDetected,
              valid: preview.validSnValues,
              blank: preview.blankRows,
            })}</span>
          </div>
          {preview.errors.map((error, index) => (
            <small className="error" key={`${error.code}:${index}`}>{error.message}</small>
          ))}
          <Button
            type="button"
            className="primary"
            disabled={!preview.rows.length}
            onClick={() => {
              append(preview.rows.map((row) => ({
                rawValue: row.rawValue,
                supportingSku: row.supportingSku,
                supportingShNo: row.supportingShNo,
              })));
              setPreview(undefined);
            }}
          >
            {t("review.addFileRows", { count: preview.rows.length })}
          </Button>
        </div>
      )}

      <div className="review-toolbar">
        <div className="review-summary">
          <span>{t("review.total")} <b>{rows.length}</b></span>
          <span className="valid">{t("review.valid")} <b>{validation?.summary.valid ?? 0}</b></span>
          <span className="warning">{t("review.attention")} <b>{validation?.summary.needsAttention ?? 0}</b></span>
          <span className="error">{t("review.unresolved")} <b>{validation?.summary.unresolved ?? 0}</b></span>
          <span>{t("review.excluded")} <b>{validation?.summary.excluded ?? rows.filter((row) => row.included === false).length}</b></span>
        </div>
        <div>
          <Button type="button" onClick={() => void request("lookup")} disabled={!rows.length || busy}><Search />{t("review.lookupAll")}</Button>
          <Button type="button" onClick={() => void request("validate")} disabled={!rows.length || busy}><RefreshCw />{t("review.revalidate")}</Button>
          <Button
            type="button"
            onClick={() => {
              const invalid = new Set(validation?.results.filter((row) => row.validationStatus !== "VALID").map((row) => row.rowId));
              setRows((current) => current.filter((row) => !invalid.has(row.rowId)));
              setValidation(undefined);
            }}
            disabled={!validation?.results.some((row) => row.validationStatus !== "VALID")}
          >
            <Trash2 />{t("review.removeInvalid")}
          </Button>
        </div>
      </div>

      {rows.length ? (
        <div className="table-wrap review-table">
          <table>
            <thead>
              <tr>
                <th>{t("review.include")}</th>
                <th>SN</th>
                <th>{t("review.erpEvidence")}</th>
                <th>SKU / {t("common.model")}</th>
                <th>{t("common.condition")}</th>
                <th>{t("review.currentPosition")}</th>
                <th>{t("review.target")}</th>
                <th>{t("review.result")}</th>
                <th>{t("review.remark")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const result = byRow.get(row.rowId);
                return (
                  <tr className={result && result.validationStatus !== "VALID" ? "anomaly" : ""} key={row.rowId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.included !== false}
                        onChange={(event) => changeRow(row.rowId, { included: event.target.checked })}
                        aria-label={t("review.include")}
                      />
                    </td>
                    <td className="mono">{result?.serialNumber ?? row.rawValue}</td>
                    <td><b>{result?.source ?? "—"}</b><small className="mono">{row.supportingShNo ?? "—"}</small></td>
                    <td><b className="mono">{result?.sku ?? row.supportingSku ?? "—"}</b><small>{result?.model ?? "—"}</small></td>
                    <td>{result?.condition ? <StatusBadge code={result.condition} /> : "—"}</td>
                    <td><b>{result?.warehouse ?? "—"}</b><small className="mono">{result?.location ?? "—"}</small></td>
                    <td>
                      {lines.length ? (
                        <select
                          value={row.targetLineId ?? result?.targetLineId ?? ""}
                          onChange={(event) => changeRow(row.rowId, { targetLineId: event.target.value || undefined })}
                        >
                          <option value="">{t("review.autoTarget")}</option>
                          {lines.map((line) => (
                            <option key={line.id} value={line.id}>
                              {line.sku} · {line.model} · {line.requiredCondition} × {line.requiredQty}
                            </option>
                          ))}
                        </select>
                      ) : <b>{result?.targetLabel ?? String(requestContext?.destinationWarehouse ?? "—")}</b>}
                    </td>
                    <td>
                      <b>{result ? t(`review.status.${result.validationStatus}`) : t("review.notValidated")}</b>
                      <small>{result ? t(`review.code.${result.validationCode}`) : t("review.pendingHelp")}</small>
                      {result?.validationStatus === "UNRESOLVED" && (
                        <Button type="button" className="small" onClick={() => void request("lookup")} disabled={busy}>
                          <Search />{t("review.lookup")}
                        </Button>
                      )}
                    </td>
                    <td>
                      <input
                        value={row.operatorRemark ?? ""}
                        maxLength={240}
                        onChange={(event) => changeRow(row.rowId, { operatorRemark: event.target.value })}
                        placeholder={t("review.remarkPlaceholder")}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("scanner.remove")}
                        onClick={() => {
                          setRows((current) => current.filter((candidate) => candidate.rowId !== row.rowId));
                          setValidation(undefined);
                        }}
                      >
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="review-empty">{t("review.empty")}</div>}

      {validation?.lineSummary?.length ? (
        <div className="outbound-line-progress">
          {validation.lineSummary.map((line) => {
            const total = (line.assignedQty ?? 0) + line.batchMatchedQty;
            return (
              <div className={total === line.requiredQty ? "complete" : ""} key={line.lineId}>
                <span><b className="mono">{line.sku}</b><small>{line.model} · {line.condition}</small></span>
                <strong>{total} / {line.requiredQty}</strong>
                <span>{t("review.batchMatched", { count: line.batchMatchedQty })}</span>
                {total === line.requiredQty ? <CheckCircle2 /> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {feedback && <div className="scan-feedback" aria-live="polite">{feedback}</div>}
      <div className="batch-confirm-row">
        <span>{t("review.noMutationNotice")}</span>
        <Button
          type="button"
          className="primary"
          disabled={!canConfirm || busy}
          onClick={() => void request("confirm")}
        >
          <CheckCircle2 />{confirmLabel}
        </Button>
      </div>
    </section>
  );
}
