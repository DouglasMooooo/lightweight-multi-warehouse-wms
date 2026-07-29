"use client";

import { AlertTriangle, ArrowRight, PackageCheck, Truck, Wrench } from "lucide-react";
import Link from "next/link";
import type { WarehouseCode, WmsState } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { formatWarehouseTime, warehouseDateKey } from "@/lib/warehouse-time";
import { PageHeader } from "@/components/shared/ui";

export function DashboardPage({ state, warehouse }: { state: WmsState; warehouse: WarehouseCode }) {
  const { locale, t } = useI18n();
  const warehouseRecord = state.warehouses.find((row) => row.code === warehouse);
  const timeZone = warehouseRecord?.timezone ?? "Australia/Sydney";
  const today = warehouseDateKey(new Date(), timeZone);
  const inventory = state.inventory.filter((row) => row.warehouseCode === warehouse);
  const availableProduct = inventory
    .filter((row) => row.itemType === "Product" && ["New", "Repair_Good"].includes(row.condition))
    .reduce((sum, row) => sum + row.availableQty, 0);
  const outboundToday = state.outboundOrders.filter(
    (row) => row.warehouseCode === warehouse && row.outboundAt && warehouseDateKey(row.outboundAt, timeZone) === today,
  ).length;
  const inboundToday = state.transactions.filter(
    (row) => row.warehouseCode === warehouse && row.type === "Inbound" && warehouseDateKey(row.effectiveAt ?? row.at, timeZone) === today,
  ).reduce((sum, row) => sum + row.qty, 0);
  const repairToday = (state.repairJobs ?? []).filter(
    (row) => row.warehouseCode === warehouse && row.repairCompletedAt && warehouseDateKey(row.repairCompletedAt, timeZone) === today,
  ).length;
  const tasks = state.dashboardTasks;
  const primary = [
    ["dashboard.needsAllocation", tasks?.needsAllocation ?? 0, "/outbound", "blue"],
    ["dashboard.allocated", tasks?.allocated ?? 0, "/outbound", "blue"],
    ["dashboard.prepared", tasks?.prepared ?? 0, "/outbound", "amber"],
    ["dashboard.readyPickup", tasks?.readyForPickup ?? 0, "/outbound", "amber"],
    ["dashboard.faultyReturns", tasks?.faultyReturns ?? 0, "/repair", "blue"],
    ["dashboard.repairQueue", tasks?.repairQueue ?? 0, "/repair", "blue"],
    ["dashboard.transfers", tasks?.transfersInTransit ?? 0, "/transfers", "amber"],
    ["dashboard.exceptions", state.exceptions.filter((row) => row.status !== "Resolved").length, "/exceptions", "red"],
  ] as const;
  const secondary = [
    ["dashboard.outboundToday", outboundToday],
    ["dashboard.inboundToday", inboundToday],
    ["dashboard.repairToday", repairToday],
    ["dashboard.availableProduct", availableProduct],
  ] as const;
  const attention = [
    tasks?.needsAllocation
      ? { text: t("dashboard.ordersNeedAllocation", { count: tasks.needsAllocation }), href: "/outbound" }
      : null,
    tasks?.repairQueue
      ? { text: t("dashboard.repairsWaiting", { count: tasks.repairQueue }), href: "/repair" }
      : null,
    state.exceptions.some((row) => row.status !== "Resolved")
      ? {
          text: t("dashboard.exceptionsOpen", {
            count: state.exceptions.filter((row) => row.status !== "Resolved").length,
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
            {state.audit.slice(0, 6).map((row) => (
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
