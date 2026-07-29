"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StockCondition, WarehouseCode, WmsState } from "@/domain/types";
import { Badge } from "@/components/shared/status-badge";
import { Button, PageHeader } from "@/components/shared/ui";

type Validation = {
  physicalQty: number;
  registeredPhysicalSerials: number;
  availableRegistrationCapacity: number;
  summary: { total: number; valid: number; invalid: number };
  results: Array<{ serialNumber: string; valid: boolean; code: string; message: string }>;
};

export function BulkSerialPage({
  state,
  warehouseCode,
  onRefresh,
}: {
  state: WmsState;
  warehouseCode: WarehouseCode;
  onRefresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"register" | "assign">("register");
  const serialProducts = state.products.filter((row) => row.serialTrackingRequired && row.active);
  const [sku, setSku] = useState(serialProducts[0]?.sku ?? "");
  const locations = state.locations.filter((row) => row.warehouseCode === warehouseCode && row.active);
  const [locationCode, setLocationCode] = useState(locations[0]?.code ?? "");
  const [condition, setCondition] = useState<StockCondition>("New");
  const [serialText, setSerialText] = useState("");
  const [validation, setValidation] = useState<Validation>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const serialNumbers = useMemo(
    () => serialText.split(/[\r\n,\t;]+/).map((row) => row.trim().toUpperCase()).filter(Boolean),
    [serialText],
  );

  const context = { warehouseCode, locationCode, sku, condition };

  async function validate(values = serialNumbers) {
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/serials/bulk/register/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...context, serialNumbers: values }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Validation failed.");
      setValidation(body);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Validation failed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    Object.entries(context).forEach(([key, value]) => form.set(key, value));
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/serials/bulk/register/validate", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Upload validation failed.");
      setSerialText(body.results.map((row: { serialNumber: string }) => row.serialNumber).join("\n"));
      setValidation(body);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Upload validation failed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!validation || validation.summary.invalid) return;
    setBusy(true);
    try {
      const response = await fetch("/api/serials/bulk/register/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...context, serialNumbers }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Registration failed.");
      setMessage({
        text: `${body.registered} serial numbers registered. Physical Qty remains ${body.physicalQty}.`,
      });
      setSerialText("");
      setValidation(undefined);
      await onRefresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Registration failed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Bulk SN"
        subtitle="Register identities against existing physical inventory, or assign registered SNs to outbound lines."
      />
      <div className="queue-tabs">
        <Button className={mode === "register" ? "primary" : ""} onClick={() => setMode("register")}>
          Register Inventory SN
        </Button>
        <Button className={mode === "assign" ? "primary" : ""} onClick={() => setMode("assign")}>
          Assign Outbound SN
        </Button>
      </div>
      {mode === "assign" ? (
        <div className="panel">
          <div className="panel-body">
            <p>Open an outbound order and select the required line. Each line has its own batch validation and commit.</p>
            <Link className="btn primary" href="/outbound">Open outbound orders</Link>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-body form-grid">
            <div className="field">
              <label>Warehouse</label>
              <input value={warehouseCode} disabled />
            </div>
            <div className="field">
              <label>Location</label>
              <select value={locationCode} onChange={(event) => { setLocationCode(event.target.value); setValidation(undefined); }}>
                {locations.map((row) => <option key={row.id} value={row.code}>{row.code}</option>)}
              </select>
            </div>
            <div className="field">
              <label>SKU</label>
              <select value={sku} onChange={(event) => { setSku(event.target.value); setValidation(undefined); }}>
                {serialProducts.map((row) => <option key={row.id} value={row.sku}>{row.sku} · {row.model}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Condition</label>
              <select value={condition} onChange={(event) => { setCondition(event.target.value as StockCondition); setValidation(undefined); }}>
                <option value="New">New</option>
                <option value="Repair_Good">Repair Good</option>
                <option value="Repair">Repair</option>
              </select>
            </div>
            <div className="field full">
              <label>Serial numbers</label>
              <textarea
                rows={10}
                value={serialText}
                onChange={(event) => { setSerialText(event.target.value.toUpperCase()); setValidation(undefined); }}
                placeholder={"SN001\nSN002\nSN003"}
              />
              <span className="field-help">Newline, comma, tab and copied Excel columns are accepted.</span>
            </div>
            <div className="field full scanner-row">
              <label className="btn">
                Upload CSV/XLSX
                <input type="file" hidden accept=".csv,.txt,.xlsx" onChange={(event) => upload(event.target.files?.[0])} />
              </label>
              <Button onClick={() => validate()} disabled={!serialNumbers.length || busy}>Validate {serialNumbers.length}</Button>
              <Button className="primary" onClick={commit} disabled={!validation || validation.summary.invalid > 0 || !validation.summary.valid || busy}>
                Confirm registration
              </Button>
            </div>
          </div>
        </div>
      )}
      {message && <div className={`notice ${message.error ? "error" : ""}`}>{message.text}</div>}
      {validation && (
        <div className="panel">
          <div className="panel-head">
            <h3>Validation</h3>
            <span className="subtle">
              Physical {validation.physicalQty} · Registered {validation.registeredPhysicalSerials} · Capacity {validation.availableRegistrationCapacity}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>SN</th><th>Result</th><th>Message</th></tr></thead>
              <tbody>{validation.results.map((row, index) => (
                <tr key={`${row.serialNumber}:${index}`}>
                  <td className="mono">{row.serialNumber}</td>
                  <td><Badge tone={row.valid ? "teal" : "red"}>{row.code}</Badge></td>
                  <td>{row.message}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
