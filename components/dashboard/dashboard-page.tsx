"use client";

import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CloudDownload,
  Map,
  PackageCheck,
  PackagePlus,
  ScanLine,
  Search,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { WarehouseCode } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { translateAuditOperation } from "@/i18n/config";
import { formatWarehouseTime } from "@/lib/warehouse-time";
import { PageHeader } from "@/components/shared/ui";

interface DashboardData {
  warehouse: { code: string; timezone: string };
  tasks: {
    needsAllocation: number; allocated: number; prepared: number; readyForPickup: number;
    toPrepare: number; awaitingPickup: number;
    outboundToday: number; faultyReturns: number; repairQueue: number; transfersInTransit: number;
    exceptions: number; erpSyncFailures: number;
  };
  availableUnits: number;
  inboundToday: number;
  repairToday: number;
  recentAudit: Array<{ id: string; operation: string; businessReference?: string; entityType?: string; at: string; actor: string }>;
}

export function DashboardPage({ warehouse }: { warehouse: WarehouseCode }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?warehouse=${encodeURIComponent(warehouse)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        setData(await response.json());
      })
      .catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : t("common.loadFailed")); });
    return () => controller.abort();
  }, [t, warehouse]);
  if (error) return <div className="notice error">{error}</div>;
  if (!data) return <div className="page-loading"><div className="loading-bar" /><div>{t("common.loading")}</div></div>;
  const timeZone = data.warehouse.timezone;
  const tasks = data.tasks;
  const primary = [
    ["dashboard.toPrepare", tasks.toPrepare, "/outbound", "blue"],
    ["dashboard.awaitingPickup", tasks.awaitingPickup, "/outbound", "amber"],
    ["dashboard.repairQueue", tasks.repairQueue, "/repair", "blue"],
    ["dashboard.transfers", tasks.transfersInTransit, "/transfers", "amber"],
    ["dashboard.exceptions", tasks.exceptions, "/exceptions", "red"],
  ] as const;
  const attention = [
    tasks.toPrepare ? { text: t("dashboard.ordersToPrepare", { count: tasks.toPrepare }), href: "/outbound" } : null,
    tasks.repairQueue ? { text: t("dashboard.repairsWaiting", { count: tasks.repairQueue }), href: "/repair" } : null,
    tasks.exceptions ? { text: t("dashboard.exceptionsOpen", { count: tasks.exceptions }), href: "/exceptions" } : null,
    tasks.erpSyncFailures ? { text: t("dashboard.erpFailures", { count: tasks.erpSyncFailures }), href: "/exceptions" } : null,
  ].filter(Boolean) as Array<{ text: string; href: string }>;
  const quickOperations = [
    ["dashboard.quick.importErp", "/outbound#import-erp", CloudDownload],
    ["dashboard.quick.newInbound", "/bulk-sn?mode=NEW_INBOUND", PackagePlus],
    ["dashboard.quick.faulty", "/bulk-sn?mode=FAULTY_RECEIVING", Wrench],
    ["dashboard.quick.outboundSn", "/bulk-sn?mode=OUTBOUND", ScanLine],
    ["dashboard.quick.searchSn", "/sn-search", Search],
    ["dashboard.quick.map", "/warehouse-map", Map],
  ] as const;

  return (
    <>
      <PageHeader
        title={t("dashboard.heading", { warehouse })}
        subtitle={t("dashboard.subtitle")}
        actions={<Link className="btn primary" href="/outbound#import-erp"><CloudDownload />{t("erp.importTitle")}</Link>}
      />
      <section className="priority-board">
        <div className="section-heading">
          <div><span>{t("dashboard.nowKicker")}</span><h3>{t("dashboard.nowTitle")}</h3></div>
          <small>{t("dashboard.nowHelp")}</small>
        </div>
        <div className="priority-lanes">
          {primary.map(([key, value, href, tone]) => (
            <Link className={`priority-lane ${tone} ${value > 0 ? "has-work" : ""}`} href={href} key={key}>
              <span>{t(key)}</span><strong>{value}</strong><ArrowRight />
            </Link>
          ))}
        </div>
      </section>
      <div className="operational-strip">
        <div title={t("dashboard.availableUnitsHelp")}><Boxes /><span className="kpi-label">{t("dashboard.availableUnits")}<small>{t("dashboard.availableUnitsHelp")}</small></span><strong>{data.availableUnits}</strong></div>
        <div><PackageCheck /><span>{t("dashboard.outboundToday")}</span><strong>{tasks.outboundToday}</strong></div>
        <div><PackagePlus /><span>{t("dashboard.inboundToday")}</span><strong>{data.inboundToday}</strong></div>
        <div><Wrench /><span>{t("dashboard.repairToday")}</span><strong>{data.repairToday}</strong></div>
      </div>
      <div className="grid dashboard-grid">
        <section className="attention-board">
          <div className="section-heading compact"><div><span>{t("dashboard.attentionKicker")}</span><h3>{t("dashboard.needsAttention")}</h3></div><AlertTriangle /></div>
          <div className="attention-table">
            {attention.map((item, index) => <Link href={item.href} key={item.href + item.text}><b>{String(index + 1).padStart(2, "0")}</b><span>{item.text}</span><small>{t("dashboard.openQueue")}</small><ArrowRight /></Link>)}
            {!attention.length && <div className="empty compact">{t("dashboard.noAttention")}</div>}
          </div>
        </section>
        <section className="activity-board">
          <div className="section-heading compact"><div><span>{t("dashboard.activityKicker")}</span><h3>{t("dashboard.recentActivity")}</h3></div><Link className="subtle" href="/audit">{t("nav.audit")}</Link></div>
          <div className="timeline">
            {data.recentAudit.map((row) => (
              <div className="timeline-item" key={row.id}><strong>{translateAuditOperation(locale, row.operation)}</strong><p>{row.businessReference ?? row.entityType} · {formatWarehouseTime(row.at, locale, timeZone)}</p></div>
            ))}
          </div>
        </section>
      </div>
      <section className="quick-operations">
        <div className="section-heading compact"><div><span>{t("dashboard.quickKicker")}</span><h3>{t("dashboard.quickTitle")}</h3></div></div>
        <div>{quickOperations.map(([key, href, Icon]) => <Link href={href} key={key}><Icon /><span>{t(key)}</span><ArrowRight /></Link>)}</div>
      </section>
      <div className="scanner-shortcuts">
        <Link href="/repair"><Wrench />{t("nav.repair")}</Link>
        <Link href="/transfers"><Truck />{t("nav.transfers")}</Link>
      </div>
    </>
  );
}
