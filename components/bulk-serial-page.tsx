"use client";

import {
  ArrowRight,
  Link2,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  ScanLine,
  Wrench,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { WarehouseCode } from "@/domain/types";
import { Badge, StatusBadge } from "@/components/shared/status-badge";
import { Button, PageHeader } from "@/components/shared/ui";
import { useI18n } from "@/i18n/provider";
import { ScanReviewWorkbench } from "@/components/review/scan-review-workbench";

type Mode = "launcher" | "NEW_INBOUND" | "FAULTY_RECEIVING" | "LEGACY_REPAIR_GOOD" | "OUTBOUND" | "BIND_EXISTING";
type Context = {
  products: Array<{ id: string; sku: string; model: string }>;
  locations: Array<{ id: string; code: string; serviceZone: boolean }>;
  outboundOrders: Array<{
    id: string;
    shNo: string;
    lines: Array<{
      id: string; sku: string; model: string; requiredQty: number;
      assignedQty: number; requiredCondition: string;
    }>;
  }>;
};
type Validation = {
  summary: { total: number; valid: number; invalid: number };
  results: Array<{
    serialNumber: string; valid: boolean; code: string; sku?: string; model?: string;
    shNo?: string; existingStatus?: string; previousStatus?: string; returnStatus?: string;
    destination?: string; repairLocation?: string; erpFound?: boolean;
  }>;
  physicalQty?: number;
  registeredPhysicalSerials?: number;
  availableRegistrationCapacity?: number;
};

const modeKeys: Record<Exclude<Mode, "launcher">, string> = {
  NEW_INBOUND: "bulk.mode.newInbound",
  FAULTY_RECEIVING: "bulk.mode.faultyReceiving",
  LEGACY_REPAIR_GOOD: "bulk.mode.repairGood",
  OUTBOUND: "bulk.mode.outbound",
  BIND_EXISTING: "bulk.mode.bindExisting",
};

const modeIcons: Record<Exclude<Mode, "launcher">, typeof ScanLine> = {
  NEW_INBOUND: PackagePlus,
  FAULTY_RECEIVING: Wrench,
  LEGACY_REPAIR_GOOD: RotateCcw,
  OUTBOUND: PackageCheck,
  BIND_EXISTING: Link2,
};

export function BulkSerialPage({ warehouseCode }: { warehouseCode: WarehouseCode }) {
  const { t, error: friendlyError } = useI18n();
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "launcher";
    const requested = new URLSearchParams(window.location.search).get("mode") as Mode | null;
    return requested && requested in modeKeys ? requested : "launcher";
  });
  const [context, setContext] = useState<Context>();
  const [sku, setSku] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [expectedQty, setExpectedQty] = useState(0);
  const [sourceDocument, setSourceDocument] = useState("");
  const [reason, setReason] = useState("");
  const [bindCondition, setBindCondition] = useState<"New" | "Repair_Good" | "Repair">("New");
  const [serialText, setSerialText] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [validation, setValidation] = useState<Validation>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [selectedOutboundId, setSelectedOutboundId] = useState("");
  const lastScan = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const scanInputRef = useRef<HTMLInputElement>(null);
  const serialNumbers = useMemo(
    () => serialText.split(/[\r\n,\t;]+/).map((row) => row.trim().toUpperCase()).filter(Boolean),
    [serialText],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/bulk-serial/context?warehouse=${encodeURIComponent(warehouseCode)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || t("common.loadFailed"));
        setContext(body);
        setSku((value) => value || body.products[0]?.sku || "");
        setLocationCode((value) => {
          if (value) return value;
          if (mode === "FAULTY_RECEIVING")
            return body.locations.find((row: Context["locations"][number]) => row.code === "REPAIR-01")?.code ??
              body.locations.find((row: Context["locations"][number]) => row.serviceZone)?.code ?? "";
          return body.locations[0]?.code || "";
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage({ text: error instanceof Error ? error.message : t("common.loadFailed"), error: true });
      });
    return () => controller.abort();
  }, [mode, t, warehouseCode]);

  function selectMode(next: Mode) {
    if (next === "FAULTY_RECEIVING") {
      const repair = context?.locations.find((row) => row.code === "REPAIR-01") ??
        context?.locations.find((row) => row.serviceZone);
      if (repair) setLocationCode(repair.code);
    }
    setMode(next);
    setValidation(undefined);
    setMessage(undefined);
    setSerialText("");
    setExpectedQty(0);
    setReason("");
    setSelectedOutboundId("");
  }

  async function appendScan(event: FormEvent) {
    event.preventDefault();
    const value = scanValue.trim();
    if (!value) return;
    const now = Date.now();
    if (lastScan.current.value === value.toUpperCase() && now - lastScan.current.at < 1200) {
      setMessage({ text: t("scanner.duplicate"), error: true });
      return;
    }
    lastScan.current = { value: value.toUpperCase(), at: now };
    setBusy(true);
    try {
      const response = await fetch("/api/scans/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawValues: [value] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("common.loadFailed"));
      const resolved = body.results[0] as {
        serialNumber: string;
        sku?: string;
        model?: string;
        validationStatus: string;
        message: string;
      };
      if (serialNumbers.includes(resolved.serialNumber)) {
        setMessage({ text: t("scanner.duplicate"), error: true });
        return;
      }
      if (mode === "NEW_INBOUND" && resolved.validationStatus !== "VALID") {
        setMessage({ text: resolved.message, error: true });
        return;
      }
      if (resolved.sku && mode !== "FAULTY_RECEIVING") {
        if (serialNumbers.length && sku && sku !== resolved.sku) {
          setMessage({ text: t("scanner.skuMismatch"), error: true });
          return;
        }
        setSku(resolved.sku);
      }
      setSerialText((current) => `${current}${current ? "\n" : ""}${resolved.serialNumber}`);
      setScanValue("");
      setValidation(undefined);
      setMessage({
        text: `${resolved.serialNumber} · ${resolved.sku ?? "MANUAL_REVIEW"}${resolved.model ? ` · ${resolved.model}` : ""}`,
        error: resolved.validationStatus !== "VALID",
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : t("common.loadFailed"), error: true });
    } finally {
      setBusy(false);
      window.setTimeout(() => scanInputRef.current?.focus(), 0);
    }
  }

  async function validate(file?: File) {
    if (mode !== "NEW_INBOUND" && mode !== "FAULTY_RECEIVING" && mode !== "BIND_EXISTING") return;
    setBusy(true);
    setMessage(undefined);
    try {
      const route = mode === "BIND_EXISTING"
        ? "/api/serials/bulk/register/validate"
        : "/api/bulk-serial/validate";
      const payload = {
        mode,
        warehouseCode,
        locationCode,
        sku,
        expectedQty,
        sourceDocument,
        condition: bindCondition,
        serialNumbers,
      };
      let response: Response;
      if (file) {
        const form = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (key !== "serialNumbers") form.set(key, String(value));
        });
        form.set("file", file);
        response = await fetch(route, { method: "POST", body: form });
      } else {
        response = await fetch(route, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const body = await response.json();
      if (!response.ok) throw new Error(friendlyError(body.code, body.error));
      setValidation(body);
      if (file) {
        setSerialText(body.results.map((row: { serialNumber: string }) => row.serialNumber).join("\n"));
        if (mode === "NEW_INBOUND") setExpectedQty(body.expectedQty ?? body.results.length);
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : t("bulk.validationFailed"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (mode === "launcher" || mode === "OUTBOUND") return;
    setBusy(true);
    setMessage(undefined);
    try {
      const bind = mode === "BIND_EXISTING";
      const response = await fetch(bind ? "/api/serials/bulk/register/commit" : "/api/bulk-serial/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bind
              ? { warehouseCode, locationCode, sku, condition: bindCondition, serialNumbers }
          : {
              mode,
              warehouseCode,
              locationCode,
              sku,
              expectedQty: mode === "LEGACY_REPAIR_GOOD" ? expectedQty : expectedQty,
              quantity: expectedQty,
              sourceDocument,
              reason,
              serialNumbers,
              acceptSerialNumbers: validation?.results.filter((row) => row.valid).map((row) => row.serialNumber),
            }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(friendlyError(body.code, body.error));
      setMessage({
        text: bind
          ? t("bulk.success.bound", { count: body.registered })
          : mode === "NEW_INBOUND"
            ? t("bulk.success.inbound", { count: body.received, sku, location: body.locationCode, batch: body.batchReference })
            : mode === "FAULTY_RECEIVING"
              ? t("bulk.success.faulty", { count: body.accepted, attention: body.needsAttention, batch: body.batchReference })
              : t("bulk.success.repairGood", { count: body.recognized, batch: body.batchReference }),
      });
      setSerialText("");
      setValidation(undefined);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : t("bulk.commitFailed"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (mode === "launcher") {
    return (
      <>
        <PageHeader title={t("bulk.title")} subtitle={t("bulk.subtitle")} />
        <div className="bulk-launcher-console">
          <div className="bulk-launcher-head">
            <ScanLine />
            <div>
              <span>{t("bulk.launcherEyebrow")}</span>
              <h3>{t("bulk.launcherTitle")}</h3>
              <p>{t("bulk.launcherHelp")}</p>
            </div>
            <dl>
              <div><dt>{t("common.warehouse")}</dt><dd>{warehouseCode}</dd></div>
              <div><dt>{t("bulk.availableProducts")}</dt><dd>{context?.products.length ?? "—"}</dd></div>
              <div><dt>{t("bulk.availableLocations")}</dt><dd>{context?.locations.length ?? "—"}</dd></div>
            </dl>
          </div>
          <div className="bulk-operation-list">
            {(Object.keys(modeKeys) as Array<Exclude<Mode, "launcher">>).map((value, index) => {
              const Icon = modeIcons[value];
              return (
                <button type="button" key={value} disabled={!context} onClick={() => selectMode(value)}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <Icon />
                  <span><strong>{t(modeKeys[value])}</strong><small>{t(`bulk.modeHelp.${value}`)}</small></span>
                  <em>{t("bulk.openOperation")}</em>
                  <ArrowRight />
                </button>
              );
            })}
          </div>
        </div>
        {message && <div className={`notice ${message.error ? "error" : ""}`}>{message.text}</div>}
      </>
    );
  }

  if (mode === "OUTBOUND") {
    const selectedOrder = context?.outboundOrders.find((order) => order.id === selectedOutboundId);
    return (
      <>
        <PageHeader title={t("bulk.mode.outbound")} subtitle={t("bulk.outboundHelp")} />
        <Button onClick={() => selectMode("launcher")}>{t("bulk.back")}</Button>
        <div className="panel">
          <div className="table-wrap">
            <table>
              <thead><tr><th>SH</th><th>SKU</th><th>{t("common.model")}</th><th>{t("scanner.required")}</th><th>{t("bulk.assigned")}</th><th>{t("common.condition")}</th><th>{t("table.action")}</th></tr></thead>
              <tbody>{context?.outboundOrders.flatMap((order) => order.lines.map((line) => (
                <tr key={line.id}>
                  <td className="mono">{order.shNo}</td><td className="mono">{line.sku}</td><td>{line.model}</td>
                  <td>{line.requiredQty}</td><td>{line.assignedQty} / {line.requiredQty}</td>
                  <td><StatusBadge code={line.requiredCondition} /></td>
                  <td><Button className="primary small" onClick={() => setSelectedOutboundId(order.id)}>{t("bulk.manageSn")}</Button></td>
                </tr>
              )))}</tbody>
            </table>
          </div>
        </div>
        {selectedOrder && (
          <ScanReviewWorkbench
            key={selectedOrder.id}
            endpoint={`/api/outbound/${selectedOrder.id}/scans`}
            persistenceKey={`outbound:${selectedOrder.id}`}
            title={t("review.outboundTitle", { shNo: selectedOrder.shNo })}
            subtitle={t("review.outboundSubtitle")}
            confirmLabel={t("review.confirmPreparation")}
            lines={selectedOrder.lines.map((line) => ({
              id: line.id,
              sku: line.sku,
              model: line.model,
              requiredCondition: line.requiredCondition,
              requiredQty: line.requiredQty,
              assignedQty: line.assignedQty,
            }))}
            onConfirmed={async () => selectMode("launcher")}
          />
        )}
      </>
    );
  }

  const condition = mode === "FAULTY_RECEIVING"
    ? "Repair"
    : mode === "LEGACY_REPAIR_GOOD"
      ? "Repair_Good"
      : mode === "BIND_EXISTING"
        ? bindCondition
        : "New";
  const canCommit =
    mode === "LEGACY_REPAIR_GOOD"
      ? expectedQty > 0 && Boolean(reason.trim()) && (serialNumbers.length === expectedQty || serialNumbers.length === 0)
      : Boolean(validation?.summary.valid) &&
        (mode === "FAULTY_RECEIVING" || validation?.summary.invalid === 0);

  return (
    <>
      <PageHeader title={t(modeKeys[mode])} subtitle={t(`bulk.modeHelp.${mode}`)} />
      <Button onClick={() => selectMode("launcher")}>{t("bulk.back")}</Button>
      <div className="panel">
        <div className="panel-body form-grid">
          <div className="field"><label>{t("common.warehouse")}</label><input value={warehouseCode} disabled /></div>
          <div className="field">
            <label>{t("common.location")}</label>
            <select value={locationCode} onChange={(event) => { setLocationCode(event.target.value); setValidation(undefined); }}>
              {context?.locations.filter((row) => mode !== "FAULTY_RECEIVING" || row.serviceZone).map((row) => (
                <option key={row.id} value={row.code}>{row.code}</option>
              ))}
            </select>
          </div>
          {mode !== "FAULTY_RECEIVING" && (
            <div className="field">
              <label>SKU</label>
              <select value={sku} onChange={(event) => { setSku(event.target.value); setValidation(undefined); }}>
                {context?.products.map((row) => <option key={row.id} value={row.sku}>{row.sku} · {row.model}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>{t("common.condition")}</label>
            {mode === "BIND_EXISTING" ? (
              <select value={bindCondition} onChange={(event) => {
                setBindCondition(event.target.value as typeof bindCondition);
                setValidation(undefined);
              }}>
                <option value="New">{t("status.New")}</option>
                <option value="Repair_Good">{t("status.Repair_Good")}</option>
                <option value="Repair">{t("status.Repair")}</option>
              </select>
            ) : <div><StatusBadge code={condition} /></div>}
          </div>
          {(mode === "NEW_INBOUND" || mode === "LEGACY_REPAIR_GOOD") && (
            <div className="field">
              <label>{t("bulk.expectedQty")}</label>
              <input type="number" min="1" step="1" value={expectedQty || ""} onChange={(event) => { setExpectedQty(Number(event.target.value)); setValidation(undefined); }} />
            </div>
          )}
          {mode === "NEW_INBOUND" && (
            <div className="field"><label>{t("bulk.sourceDocument")}</label><input value={sourceDocument} onChange={(event) => setSourceDocument(event.target.value)} /></div>
          )}
          {mode === "LEGACY_REPAIR_GOOD" && (
            <div className="field full"><label>{t("field.reason")}</label><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("bulk.legacyReasonPlaceholder")} /></div>
          )}
          <form className="field full scanner-row" onSubmit={appendScan}>
            <label>{t("bulk.scan")}</label>
            <input ref={scanInputRef} autoFocus value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder={t("bulk.scanPlaceholder")} />
            <Button type="submit" disabled={busy}>{t("bulk.addSn")}</Button>
          </form>
          <div className="field full">
            <label>{t("bulk.serialNumbers")}</label>
            <textarea rows={10} value={serialText} onChange={(event) => { setSerialText(event.target.value.toUpperCase()); setValidation(undefined); }} placeholder={"SN001\nSN002\nSN003"} />
            <span className="field-help">{t("bulk.detected", { count: serialNumbers.length })}</span>
          </div>
          <div className="field full scanner-row">
            {mode !== "LEGACY_REPAIR_GOOD" && (
              <>
                <label className="btn">
                  {t("bulk.upload")}
                  <input type="file" hidden accept=".csv,.txt,.xlsx" onChange={(event) => validate(event.target.files?.[0])} />
                </label>
                <Button onClick={() => validate()} disabled={!serialNumbers.length || busy}>{t("bulk.validate")} {serialNumbers.length}</Button>
              </>
            )}
            <Button className="primary" onClick={commit} disabled={!canCommit || busy}>
              {t("bulk.confirm")} {mode !== "FAULTY_RECEIVING" ? expectedQty || serialNumbers.length : validation?.summary.valid || 0}
            </Button>
          </div>
        </div>
      </div>
      {message && <div className={`notice ${message.error ? "error" : ""}`}>{message.text}</div>}
      {validation && (
        <div className="panel">
          <div className="panel-head">
            <h3>{t("bulk.validation")}</h3>
            <span className="subtle">{t("bulk.validationSummary", validation.summary)}</span>
          </div>
          {validation.availableRegistrationCapacity !== undefined && (
            <div className="panel-body">{t("bulk.capacitySummary", {
              physical: validation.physicalQty ?? 0,
              registered: validation.registeredPhysicalSerials ?? 0,
              capacity: validation.availableRegistrationCapacity,
            })}</div>
          )}
          <div className="table-wrap">
            <table>
              {mode === "FAULTY_RECEIVING" ? (
                <>
                  <thead><tr>
                    <th>SN</th><th>{t("bulk.originalSh")}</th><th>SKU</th><th>{t("common.model")}</th>
                    <th>{t("bulk.previousStatus")}</th><th>{t("bulk.returnStatus")}</th>
                    <th>{t("bulk.repairLocation")}</th><th>{t("bulk.result")}</th>
                  </tr></thead>
                  <tbody>{validation.results.map((row, index) => (
                    <tr key={`${row.serialNumber}:${index}`}>
                      <td className="mono">{row.serialNumber}</td>
                      <td className="mono">{row.shNo || "—"}</td>
                      <td className="mono">{row.sku || "—"}</td>
                      <td>{row.model || "—"}</td>
                      <td><StatusBadge code={row.previousStatus || row.existingStatus || "Unknown"} /></td>
                      <td><StatusBadge code={row.returnStatus || "Repair"} /></td>
                      <td>{row.repairLocation || row.destination || locationCode}</td>
                      <td><Badge tone={row.valid ? "teal" : "red"}>{t(`bulk.result.${row.code}`)}</Badge></td>
                    </tr>
                  ))}</tbody>
                </>
              ) : (
                <>
                  <thead><tr><th>SN</th><th>SKU</th><th>{t("common.model")}</th><th>{t("bulk.destination")}</th><th>{t("bulk.result")}</th></tr></thead>
                  <tbody>{validation.results.map((row, index) => (
                    <tr key={`${row.serialNumber}:${index}`}>
                      <td className="mono">{row.serialNumber}</td>
                      <td className="mono">{row.sku || "—"}</td>
                      <td>{row.model || "—"}</td><td>{row.destination || locationCode}</td>
                      <td><Badge tone={row.valid ? "teal" : "red"}>{t(`bulk.result.${row.code}`)}</Badge></td>
                    </tr>
                  ))}</tbody>
                </>
              )}
            </table>
          </div>
        </div>
      )}
    </>
  );
}
