"use client";

import { AlertTriangle, CheckCircle2, CloudDownload, ExternalLink, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import type { StockCondition } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { Badge, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/shared/ui";

interface ImportPreview {
  status: "Ready" | "Needs_Attention" | "Already_Imported";
  adapter: string;
  order: {
    shNo: string;
    customerLabel?: string;
    physicalWarehouseCode: string;
    pickupCode?: string;
    lines: Array<{
      sku: string; model: string; quantity: number; erpWarehouse: string;
      wmsCondition?: StockCondition; productExists: boolean; mappingExists: boolean;
    }>;
  };
  issues: Array<{ code: string; message: string; lineIndex?: number; value?: string }>;
  existingOrder?: { id: string; status: string; pickupCode?: string };
}

export function ERPImportPanel({ onImported }: { onImported: () => Promise<void> | void }) {
  const { t, error: friendlyError } = useI18n();
  const [shNo, setShNo] = useState("");
  const [stage, setStage] = useState<"Search" | "Fetching" | "Preview" | "Importing" | "Imported" | "Needs_Attention">("Search");
  const [preview, setPreview] = useState<ImportPreview>();
  const [message, setMessage] = useState("");

  async function fetchPreview(event?: FormEvent) {
    event?.preventDefault();
    if (!shNo.trim()) return;
    setStage("Fetching");
    setMessage("");
    try {
      const response = await fetch("/api/erp/outbound/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shNo: shNo.trim().toUpperCase() }),
      });
      const body = await response.json() as ImportPreview & { error?: string; code?: string };
      if (!response.ok) throw new Error(friendlyError(body.code, body.error));
      setPreview(body);
      setStage(body.status === "Ready" || body.status === "Already_Imported" ? "Preview" : "Needs_Attention");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("erp.previewFailed"));
      setStage("Needs_Attention");
    }
  }

  async function confirmImport() {
    if (!preview || preview.status !== "Ready") return;
    setStage("Importing");
    setMessage("");
    try {
      const response = await fetch("/api/erp/outbound/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shNo: preview.order.shNo }),
      });
      const body = await response.json() as {
        imported?: boolean;
        order?: { id: string; shNo: string };
        existingOrder?: { id: string };
        error?: string;
        code?: string;
      };
      if (!response.ok) throw new Error(friendlyError(body.code, body.error));
      if (!body.imported && body.existingOrder) {
        setPreview((current) => current ? { ...current, status: "Already_Imported", existingOrder: { id: body.existingOrder!.id, status: "", pickupCode: undefined } } : current);
        setStage("Preview");
        return;
      }
      setStage("Imported");
      setMessage(t("erp.importSuccess", { sh: body.order?.shNo ?? preview.order.shNo }));
      await onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("erp.importFailed"));
      setStage("Needs_Attention");
    }
  }

  return (
    <section className="erp-import-panel" id="import-erp">
      <div className="erp-import-head">
        <div><span>{t("erp.importKicker")}</span><h3>{t("erp.importTitle")}</h3><p>{t("erp.importHelp")}</p></div>
        <div className="import-stage" aria-label={t("erp.importStatus")}>
          {["Search", "Preview", "Ready", "Imported"].map((value, index) => {
            const active = (stage === "Search" && index === 0) || (["Fetching", "Preview", "Needs_Attention"].includes(stage) && index <= 1) || (stage === "Importing" && index <= 2) || (stage === "Imported");
            return <span className={active ? "active" : ""} key={value}>{t(`erp.stage.${value}`)}</span>;
          })}
        </div>
      </div>
      <form className="erp-search-row" onSubmit={fetchPreview}>
        <div><Search /><input value={shNo} onChange={(event) => setShNo(event.target.value.toUpperCase())} placeholder={t("erp.shPlaceholder")} /></div>
        <Button className="primary" type="submit" disabled={stage === "Fetching" || !shNo.trim()}>
          {stage === "Fetching" ? <Loader2 className="spin" /> : <CloudDownload />}
          {t("erp.fetchOrder")}
        </Button>
      </form>
      {message && <div className={`notice ${stage === "Needs_Attention" ? "error" : ""}`}>{message}</div>}
      {preview && (
        <div className="erp-preview">
          <div className="erp-preview-meta">
            <div><span>SH</span><strong className="mono">{preview.order.shNo}</strong></div>
            <div><span>{t("erp.customer")}</span><strong>{preview.order.customerLabel ?? "—"}</strong></div>
            <div><span>{t("summary.physicalWarehouse")}</span><strong>{preview.order.physicalWarehouseCode || "—"}</strong></div>
            <div><span>{t("summary.pickupCode")}</span><strong className="mono">{preview.order.pickupCode ?? "—"}</strong></div>
            <div><span>{t("erp.adapter")}</span><strong>{preview.adapter}</strong></div>
          </div>
          <div className="table-wrap erp-lines">
            <table>
              <thead><tr><th>SKU</th><th>{t("common.model")}</th><th className="numeric">{t("common.quantity")}</th><th>{t("summary.erpWarehouse")}</th><th>{t("erp.wmsCondition")}</th><th>{t("common.status")}</th></tr></thead>
              <tbody>{preview.order.lines.map((line, index) => (
                <tr key={`${line.sku}:${index}`}>
                  <td className="mono">{line.sku}</td><td>{line.model}</td><td className="numeric">{line.quantity}</td>
                  <td>{line.erpWarehouse}</td><td>{line.wmsCondition ? <StatusBadge code={line.wmsCondition} /> : "—"}</td>
                  <td>{line.productExists && line.mappingExists && line.quantity > 0 ? <Badge tone="teal">{t("erp.valid")}</Badge> : <Badge tone="red">{t("dashboard.needsAttention")}</Badge>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {preview.issues.length > 0 && (
            <div className="erp-issues">
              <div><AlertTriangle /><strong>{t("dashboard.needsAttention")}</strong></div>
              {preview.issues.map((issue, index) => <div key={`${issue.code}:${index}`}><span>{friendlyError(issue.code, issue.message)}{issue.value ? ` · ${issue.value}` : ""}</span><details><summary>{t("common.technicalDetails")}</summary><code>{issue.code}</code></details></div>)}
            </div>
          )}
          {preview.status === "Already_Imported" && preview.existingOrder && (
            <div className="existing-order">
              <CheckCircle2 />
              <div><strong>{t("erp.alreadyImported")}</strong><span>{t("common.status")}: {preview.existingOrder.status} · {t("common.pickup")}: {preview.existingOrder.pickupCode ?? "—"}</span></div>
              <Link className="btn" href={`/outbound/${preview.existingOrder.id}`}>{t("erp.openOrder")}<ExternalLink /></Link>
            </div>
          )}
          {preview.status === "Ready" && (
            <div className="erp-confirm-row"><div><CheckCircle2 /><span>{t("erp.readyToImport")}</span></div><Button className="primary" type="button" onClick={confirmImport} disabled={stage === "Importing"}>{stage === "Importing" ? <Loader2 className="spin" /> : <CloudDownload />}{t("erp.confirmImport")}</Button></div>
          )}
        </div>
      )}
    </section>
  );
}
