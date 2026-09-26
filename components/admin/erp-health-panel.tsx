"use client";

import { Activity, AlertTriangle, CheckCircle2, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Badge } from "@/components/shared/status-badge";

interface ERPHealth {
  ok: boolean;
  configured: boolean;
  adapter: string;
  lastSuccessfulImport: { reference: string; at: string } | null;
  failedSyncJobs: number;
  mappings?: Array<{ id: string; physicalWarehouse: string; erpWarehouse: string; condition: string }>;
  error?: string;
}

export function ERPHealthPanel() {
  const { t } = useI18n();
  const [health, setHealth] = useState<ERPHealth>();
  useEffect(() => {
    fetch("/api/erp/health", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        setHealth(body);
      })
      .catch(() => setHealth({ ok: false, configured: false, adapter: "Unavailable", lastSuccessfulImport: null, failedSyncJobs: 0 }));
  }, []);
  return (
    <section className="erp-health">
      <div className="erp-health-title"><div><PlugZap /><span><small>{t("erp.integration")}</small><strong>{health?.adapter ?? t("common.loading")}</strong></span></div>{health && <Badge tone={health.ok ? "teal" : "red"}>{health.ok ? t("erp.connected") : t("erp.notConnected")}</Badge>}</div>
      <div className="erp-health-grid">
        <div>{health?.ok ? <CheckCircle2 /> : <AlertTriangle />}<span>{t("erp.connection")}<strong>{health?.configured ? (health.ok ? t("erp.connected") : t("erp.needsAttention")) : t("erp.notConfigured")}</strong></span></div>
        <div><Activity /><span>{t("erp.lastImport")}<strong>{health?.lastSuccessfulImport?.reference ?? "—"}</strong></span></div>
        <div><AlertTriangle /><span>{t("erp.failedSyncJobs")}<strong>{health?.failedSyncJobs ?? "—"}</strong></span></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("common.physicalWarehouse")}</th><th>{t("common.erpWarehouse")}</th><th>{t("common.mappedCondition")}</th></tr></thead>
          <tbody>{health?.mappings?.map((mapping) => <tr key={mapping.id}><td>{mapping.physicalWarehouse}</td><td>{mapping.erpWarehouse}</td><td><Badge tone="blue">{mapping.condition}</Badge></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
