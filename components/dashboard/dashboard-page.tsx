"use client";

import { AlertTriangle, ArrowRight, PackageCheck, Truck, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { WarehouseCode } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { formatWarehouseTime } from "@/lib/warehouse-time";
import { PageHeader } from "@/components/shared/ui";

interface DashboardData {
  warehouse: { code: string; timezone: string };
  tasks: {
    needsAllocation: number; allocated: number; prepared: number; readyForPickup: number;
    outboundToday: number; faultyReturns: number; repairQueue: number; transfersInTransit: number;
    exceptions: number; erpSyncFailures: number;
  };
  availableProduct: number;
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
  if (!data) return <div className="loading-shell"><div className="loading-bar" /><div>{t("common.loading")}</div></div>;
  const timeZone = data.warehouse.timezone;
  const tasks = data.tasks;
  const primary = [
    ["dashboard.needsAllocation", tasks.needsAllocation, "/outbound", "blue"],
    ["dashboard.allocated", tasks.allocated, "/outbound", "blue"],
    ["dashboard.prepared", tasks.prepared, "/outbound", "amber"],
    ["dashboard.readyPickup", tasks.readyForPickup, "/outbound", "amber"],
    ["dashboard.faultyReturns", tasks.faultyReturns, "/repair", "blue"],
    ["dashboard.repairQueue", tasks.repairQueue, "/repair", "blue"],
    ["dashboard.transfers", tasks.transfersInTransit, "/transfers", "amber"],
    ["dashboard.exceptions", tasks.exceptions, "/exceptions", "red"],
  ] as const;
  const secondary = [
    ["dashboard.outboundToday", tasks.outboundToday],
    ["dashboard.inboundToday", data.inboundToday],
    ["dashboard.repairToday", data.repairToday],
    ["dashboard.availableProduct", data.availableProduct],
  ] as const;
  const attention = [
    tasks.needsAllocation
      ? { text: t("dashboard.ordersNeedAllocation", { count: tasks.needsAllocation }), href: "/outbound" }
      : null,
    tasks.repairQueue
      ? { text: t("dashboard.repairsWaiting", { count: tasks.repairQueue }), href: "/repair" }
      : null,
    tasks.exceptions
      ? {
          text: t("dashboard.exceptionsOpen", {
            count: tasks.exceptions,
          }),
          href: "/exceptions",
        }
      : null,
  ].filter(Boolean) as Array<{ text: string; href: string }>;

  return (
    <>
      <PageHeader
        title={t("dashboard.heading", { warehouse })}
        subtitle={t("dashboard.subtitle")}
        actions={<Link className="btn primary" href="/outbound"><PackageCheck />{t("nav.outbound")}</Link>}
      />
      <div className="grid task-metrics">
        {primary.map(([key, value, href, tone]) => (
          <Link className={`metric task-card ${tone}`} href={href} key={key}>
            <div className="metric-label">{t(key)}</div>
            <div className="metric-value">{value}</div>
            <ArrowRight aria-hidden />
          </Link>
        ))}
      </div>
      <div className="grid secondary-metrics">
        {secondary.map(([key, value]) => (
          <div className="metric" key={key}><div className="metric-label">{t(key)}</div><div className="metric-value">{value}</div></div>
        ))}
      </div>
      <div className="grid dashboard-grid">
        <section className="panel">
          <div className="panel-head"><h3>{t("dashboard.needsAttention")}</h3><AlertTriangle /></div>
          <div className="attention-list">
            {attention.map((item) => <Link href={item.href} key={item.href + item.text}><span>{item.text}</span><ArrowRight /></Link>)}
            {!attention.length && <div className="empty compact">{t("dashboard.noAttention")}</div>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h3>{t("dashboard.recentActivity")}</h3><Link className="subtle" href="/audit">{t("nav.audit")}</Link></div>
          <div className="panel-body timeline">
            {data.recentAudit.map((row) => (
              <div className="timeline-item" key={row.id}><strong>{row.operation}</strong><p>{row.businessReference ?? row.entityType} · {formatWarehouseTime(row.at, locale, timeZone)}</p></div>
            ))}
          </div>
        </section>
      </div>
      <div className="scanner-shortcuts">
        <Link href="/repair"><Wrench />{t("nav.repair")}</Link>
        <Link href="/transfers"><Truck />{t("nav.transfers")}</Link>
      </div>
    </>
  );
}
