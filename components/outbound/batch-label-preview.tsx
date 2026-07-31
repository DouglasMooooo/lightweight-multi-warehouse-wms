"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, EmptyState } from "@/components/shared/ui";
import { useI18n } from "@/i18n/provider";

type Label = {
  groupKey: string;
  pickupCode?: string;
  shNos: string[];
  totalQty: number;
  lines: Array<{ sku: string; model: string; erpWarehouse: string; qty: number }>;
};

type Preview = {
  labels: Label[];
  validation: { valid: boolean; errors: string[] };
  totals: { selectedOrders: number; pickupCodes: number; labelPages: number; totalUnits: number };
};

export function BatchLabelPreview() {
  const { t } = useI18n();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState("");

  useEffect(() => {
    const orderIds = new URLSearchParams(window.location.search)
      .get("orderIds")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
    const controller = new AbortController();
    fetch("/api/labels/batch-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderIds }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.validation?.errors?.join(" ") || body.error || t("common.loadFailed"));
        setPreview(body);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError")
          setError(reason instanceof Error ? reason.message : t("common.loadFailed"));
      });
    return () => controller.abort();
  }, [t]);

  return (
    <div className="label-page">
      <div className="print-controls">
        <Link className="btn" href="/outbound"><ArrowLeft /> {t("label.backToOutbound")}</Link>
        <strong>{t("label.batchPreview")}</strong>
        <Button className="primary" disabled={!preview?.labels.length} onClick={() => window.print()}>
          <Printer /> {t("label.print")}
        </Button>
        <Button disabled={!preview?.labels.length} onClick={() => window.print()}>
          <Download /> {t("label.exportPdf")}
        </Button>
      </div>
      <div className="notice">{t("label.exportPdfHelp")}</div>
      {preview && (
        <div className="batch-label-totals">
          <span>{t("label.selectedOrders")} <strong>{preview.totals.selectedOrders}</strong></span>
          <span>{t("label.pickupCodes")} <strong>{preview.totals.pickupCodes}</strong></span>
          <span>{t("label.labelPages")} <strong>{preview.totals.labelPages}</strong></span>
          <span>{t("label.totalUnits")} <strong>{preview.totals.totalUnits}</strong></span>
        </div>
      )}
      {!preview && !error && <div className="page-loading">{t("common.loading")}</div>}
      {error && <div className="notice error">{error}</div>}
      {preview && !preview.labels.length && <EmptyState label={t("common.noResults")} />}
      {preview?.labels.map((label) => (
        <article className="label-sheet" key={label.groupKey}>
          <div className="label-brand">FOXESS · {t("label.warehouseOperations")}</div>
          <div>
            <section className="label-main">
              <div className="label-kicker">{t("label.pickupBatch")}</div>
              <div className="label-sh">{label.shNos.join(" · ")}</div>
              <div className="label-pickup">
                <span>{label.pickupCode ? t("common.pickup") : t("label.shNumbers")}</span>
                <strong>{label.pickupCode ?? label.shNos.join(" · ")}</strong>
              </div>
            </section>
            <section className="label-details">
              {label.lines.map((line) => (
                <div className="label-detail" key={`${line.sku}:${line.model}:${line.erpWarehouse}`}>
                  <span>{line.sku} · {line.model}</span>
                  <strong>{line.erpWarehouse} · Qty {line.qty}</strong>
                </div>
              ))}
              <div className="label-total"><span>{t("label.totalQty")}</span><strong>{label.totalQty}</strong></div>
            </section>
          </div>
          <div className="label-brand">{t("label.batchFooter")}</div>
        </article>
      ))}
    </div>
  );
}
