"use client";

import {
  ArrowLeft,
  ArrowRight,
  Move,
  PackageOpen,
  Plus,
  Printer,
  ScanLine,
  Search,
  SlidersHorizontal,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type {
  AuditEntry,
  InventoryBalance,
  OutboundOrder,
  SerialNumber,
  StockCondition,
  WarehouseCode,
  WmsState,
  WmsCommand,
} from "@/domain/types";
import type { ERPSerialLookup } from "@/integrations/erp-adapter";
import { ReconciliationView } from "@/components/reconciliation-view";
import { BulkSerialPage } from "@/components/bulk-serial-page";
import { ERPHealthPanel } from "@/components/admin/erp-health-panel";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { InventoryPage } from "@/components/inventory/inventory-page";
import { InventoryReportPage } from "@/components/reports/inventory-report-page";
import { OperationsReportPage } from "@/components/reports/operations-report-page";
import { AppShell } from "@/components/layout/app-shell";
import { ERPImportPanel } from "@/components/outbound/erp-import-panel";
import { OutboundPreparationWorkspace } from "@/components/outbound/outbound-preparation-workspace";
import { BatchLabelPreview } from "@/components/outbound/batch-label-preview";
import { Badge, StatusBadge } from "@/components/shared/status-badge";
import { WarehouseMapPage } from "@/components/warehouse-map/warehouse-map-page";
import { BatchTransferPanel } from "@/components/transfers/batch-transfer-panel";
import { TransferReceiptPanel } from "@/components/transfers/transfer-receipt-panel";
import { Button, cn, EmptyState as Empty, PageHeader as PageHead } from "@/components/shared/ui";
import { useI18n } from "@/i18n/provider";
import { translateAuditOperation } from "@/i18n/config";
import { shouldShowDemoReset } from "@/lib/environment";
import { restoreScannerFocus } from "@/lib/scanner";
import { formatWarehouseDateTime } from "@/lib/warehouse-time";
import { outboundOperatorStage, outboundQueueFor, outboundSerialMode, type OutboundQueue } from "@/domain/outbound-presentation";

const routeTitleKeys: Record<string, string> = {
  dashboard: "title.dashboard", inventory: "title.inventory", outbound: "title.outbound",
  receiving: "title.receiving", repair: "title.repair", move: "title.move",
  adjustment: "title.adjustment", "sn-search": "title.snSearch", transfers: "title.transfers",
  "bulk-sn": "title.bulkSn",
  "warehouse-map": "title.warehouseMap",
  reports: "title.inventoryReport",
  stocktake: "title.stocktake", audit: "title.audit", exceptions: "title.exceptions",
  reconciliation: "title.reconciliation", admin: "title.admin",
};

export function WmsApp({ path }: { path: string[] }) {
  const { t, error: friendlyError } = useI18n();
  const section = path[0] ?? "dashboard";
  const detailId = path[1];
  const subroute = path[2];
  const isBatchLabelPreview = section === "outbound" && detailId === "batch-labels" && subroute === "preview";
  const [state, setState] = useState<WmsState | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [warehouse, setWarehouse] = useState<"SYD" | "MEL" | "BNE">("SYD");
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    const operationsSections = ["receiving", "repair", "move", "adjustment", "transfers", "stocktake", "exceptions", "admin"];
    const boundedPage =
      ["dashboard", "inventory", "reports", "sn-search", "bulk-sn", "warehouse-map", "audit", "reconciliation"].includes(section) ||
      (section === "outbound" && !detailId);
    const readUrl =
      isBatchLabelPreview
        ? "/api/bootstrap"
        : section === "outbound" && detailId && subroute !== "label"
        ? `/api/outbound/${encodeURIComponent(detailId)}`
        : operationsSections.includes(section)
          ? `/api/operations?section=${encodeURIComponent(section)}&warehouse=${encodeURIComponent(warehouse)}`
        : boundedPage
          ? "/api/bootstrap"
          : "/api/wms";
    fetch(readUrl, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as WmsState | { error: string; code?: string };
        if (!response.ok) throw new Error(t("common.loadFailed"));
        if (active) setState(body as WmsState);
      })
      .catch(() => {
        if (active) {
          const message = t("common.loadFailed");
          setToast({ message, error: true });
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [detailId, friendlyError, isBatchLabelPreview, section, subroute, t, warehouse]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refreshCurrent() {
    const operationsSections = ["receiving", "repair", "move", "adjustment", "transfers", "stocktake", "exceptions", "admin"];
    const refreshUrl =
      section === "outbound" && detailId && subroute !== "label"
        ? `/api/outbound/${encodeURIComponent(detailId)}`
        : operationsSections.includes(section)
          ? `/api/operations?section=${encodeURIComponent(section)}&warehouse=${encodeURIComponent(warehouse)}`
        : ["dashboard", "inventory", "reports", "sn-search", "bulk-sn", "warehouse-map", "audit", "reconciliation"].includes(section) ||
            (section === "outbound" && !detailId)
          ? "/api/bootstrap"
          : "/api/wms";
    const refreshed = await fetch(refreshUrl, { cache: "no-store" });
    if (!refreshed.ok) throw new Error(t("common.loadFailed"));
    setState((await refreshed.json()) as WmsState);
  }

  async function commit(command: WmsCommand, success: string) {
    try {
      const response = await fetch("/api/wms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string; code?: string };
      if (!response.ok) throw new Error("error" in body ? friendlyError(body.code, body.error) : friendlyError());
      await refreshCurrent();
      setToast({ message: success });
      return true;
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : t("error.UNKNOWN"), error: true });
      return false;
    }
  }

  async function resetDemo() {
    await commit({ type: "resetDemo" }, t("success.demoReset"));
  }

  const title = t(
    section === "reports" && path[1] === "operations"
      ? "title.operationsReport"
      : routeTitleKeys[section] ?? "app.name",
  );
  const demoMode = shouldShowDemoReset({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    demoMode: process.env.NEXT_PUBLIC_DEMO_MODE,
  });
  if (!ready)
    return (
      <AppShell
        path={path}
        title={title}
        warehouses={[]}
        warehouse={warehouse}
        setWarehouse={setWarehouse}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        showDemoReset={false}
        onResetDemo={resetDemo}
      >
        <div className="page-loading"><div className="loading-bar" /><div>{t("common.loading")}</div></div>
      </AppShell>
    );
  if (!state)
    return (
      <div className="startup-error" role="alert">
        <strong>{t("common.loadFailed")}</strong>
        <Button className="primary" onClick={() => window.location.reload()}>{t("common.retry")}</Button>
      </div>
    );

  if (section === "outbound" && path[2] === "label") {
    const order = state.outboundOrders.find((row) => row.id === path[1]);
    return order ? <LabelView order={order} state={state} /> : <div className="empty">{t("common.orderNotFound")}</div>;
  }
  if (isBatchLabelPreview) return <BatchLabelPreview />;

  return (
    <AppShell
      path={path}
      title={title}
      warehouses={state.warehouses}
      warehouse={warehouse}
      setWarehouse={setWarehouse}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      showDemoReset={demoMode}
      onResetDemo={resetDemo}
      toast={toast}
      currentUser={state.currentUser}
    >
          {section === "dashboard" && <DashboardPage warehouse={warehouse} />}
          {section === "inventory" && <InventoryPage warehouse={warehouse} />}
          {section === "reports" && path[1] === "inventory" && <InventoryReportPage warehouse={warehouse} />}
          {section === "reports" && path[1] === "operations" && <OperationsReportPage key={warehouse} warehouse={warehouse} />}
          {section === "warehouse-map" && <WarehouseMapPage warehouse={warehouse} />}
          {section === "outbound" &&
            (path[1] ? (
              <OutboundDetail state={state} orderId={path[1]} commit={commit} refresh={refreshCurrent} />
            ) : (
              <OutboundList state={state} warehouse={warehouse} refresh={refreshCurrent} />
            ))}
          {section === "receiving" && <ReceivingView state={state} commit={commit} />}
          {section === "repair" && <RepairView state={state} commit={commit} />}
          {section === "move" && <MoveView state={state} commit={commit} />}
          {section === "adjustment" && <AdjustmentView state={state} commit={commit} />}
          {section === "sn-search" && <SerialSearchView state={state} />}
          {section === "bulk-sn" && (
            <BulkSerialPage warehouseCode={warehouse} />
          )}
          {section === "transfers" && <TransferView state={state} warehouse={warehouse} commit={commit} refresh={refreshCurrent} />}
          {section === "stocktake" && <StocktakeView state={state} warehouse={warehouse} />}
          {section === "audit" && <AuditView state={state} />}
          {section === "exceptions" && <ExceptionView state={state} />}
          {section === "reconciliation" && (
            <ReconciliationView warehouse={state.warehouses.find((row) => row.code === warehouse)!} />
          )}
          {section === "admin" && <AdminView state={state} resource={path[1] ?? "products"} />}
    </AppShell>
  );
}

function OutboundList({
  state,
  warehouse,
  refresh,
}: {
  state: WmsState;
  warehouse: "SYD" | "MEL" | "BNE";
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<OutboundQueue>("To_Prepare");
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [outboundPage, setOutboundPage] = useState<{ rows: OutboundOrder[]; total: number; totalPages: number }>({
    rows: state.outboundOrders,
    total: state.outboundOrders.length,
    totalPages: 1,
  });
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "50", warehouse });
    params.set("status", queue);
    fetch(`/api/outbound?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        setOutboundPage(await response.json());
        setSelectedOrderIds([]);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [page, queue, reloadToken, t, warehouse]);
  const orders = outboundPage.rows.filter(
    (order) =>
      order.warehouseCode === warehouse &&
      outboundQueueFor(order.status, order.erpSyncStatus) === queue &&
      `${order.shNo} ${order.pickupCode ?? ""} ${order.lines.map((line) => line.sku).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selectedOrders = outboundPage.rows.filter((order) => selectedOrderIds.includes(order.id));
  const selectedPickupCodes = new Set(
    selectedOrders.map((order) => order.pickupCode ? `PICKUP:${order.pickupCode}` : `SH:${order.shNo}`),
  ).size;
  const selectedUnits = selectedOrders.reduce(
    (sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.requiredQty, 0),
    0,
  );
  const awaitingPickup = queue === "Awaiting_Pickup";
  const toggleOrder = (orderId: string) =>
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId],
    );
  return (
    <>
      <PageHead
        title={t("title.outbound")}
        subtitle={t("outbound.subtitle")}
      />
      <ERPImportPanel onImported={async () => { await refresh(); setReloadToken((value) => value + 1); }} />
      <div className="queue-tabs" role="tablist">
        {[
          ["To_Prepare", t("outbound.queue.toPrepare")],
          ["Partially_Prepared", t("outbound.queue.partiallyPrepared")],
          ["SN_Pending", t("outbound.queue.snPending")],
          ["Awaiting_Pickup", t("outbound.queue.awaitingPickup")],
          ["Outbound", t("outbound.queue.outbound")],
          ["ERP_Issues", t("outbound.queue.erpIssues")],
        ].map(([value, label]) => (
          <button className={queue === value ? "active" : ""} key={value} onClick={() => {
            setSelectedOrderIds([]);
            setQueue(value as OutboundQueue);
          }}>{label}</button>
        ))}
      </div>
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              placeholder={t("outbound.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Badge tone="amber">{t("outbound.active", { count: orders.filter((row) => row.status !== "Outbound").length })}</Badge>
        </div>
        {awaitingPickup && (
          <div className="batch-selection-bar">
            <Button type="button" onClick={() => setSelectedOrderIds(orders.map((order) => order.id))}>
              {t("label.selectPage")}
            </Button>
            <Button type="button" onClick={() => setSelectedOrderIds(outboundPage.rows.map((order) => order.id))}>
              {t("label.selectEligible")}
            </Button>
            <Button type="button" disabled={!selectedOrderIds.length} onClick={() => setSelectedOrderIds([])}>
              {t("label.clearSelection")}
            </Button>
            <div className="batch-selection-summary">
              <span>{t("label.selectedOrders")}: <strong>{selectedOrders.length}</strong></span>
              <span>{t("label.pickupCodes")}: <strong>{selectedPickupCodes}</strong></span>
              <span>{t("label.labelPages")}: <strong>{selectedPickupCodes}</strong></span>
              <span>{t("label.totalUnits")}: <strong>{selectedUnits}</strong></span>
            </div>
            <Link
              className={cn("btn primary", !selectedOrderIds.length && "disabled")}
              aria-disabled={!selectedOrderIds.length}
              href={selectedOrderIds.length
                ? `/outbound/batch-labels/preview?orderIds=${encodeURIComponent(selectedOrderIds.join(","))}`
                : "#"}
            >
              <Printer /> {t("label.generateBatch")}
            </Link>
          </div>
        )}
        <div className="table-wrap outbound-queue-table">
          <table>
            <thead><tr>
              {awaitingPickup && <th className="selection-column"><span className="sr-only">{t("common.select")}</span></th>}
              <th>SH / {t("summary.pickupCode")}</th>
              <th>{t("outbound.skuSummary")}</th>
              <th>{t("common.condition")}</th>
              <th>{t("common.status")}</th>
              <th>{t("outbound.progress")}</th>
              <th>{t("outbound.nextAction")}</th>
            </tr></thead>
            <tbody>{orders.map((order) => {
              const required = order.lines.reduce((sum, row) => sum + row.requiredQty, 0);
              const prepared = order.lines.reduce((sum, row) => sum + row.preparedQty, 0);
              const conditions = [...new Set(order.lines.map((line) => line.requiredCondition))];
              const nextAction =
                ["Imported", "Pending_Allocation", "Allocated", "Partially_Prepared"].includes(order.status) ? t("outbound.action.confirmPreparation") :
                order.status === "Prepared" ? t("outbound.action.reviewLegacyException") :
                order.status === "Ready_for_Pickup" ? t("outbound.action.dispatch") : t("common.open");
              return (
                <tr key={order.id}>
                  {awaitingPickup && (
                    <td className="selection-column">
                      <input
                        type="checkbox"
                        aria-label={`${t("common.select")} ${order.shNo}`}
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => toggleOrder(order.id)}
                      />
                    </td>
                  )}
                  <td><Link className="queue-identifier mono" href={`/outbound/${order.id}`}>{order.shNo}</Link><span className="queue-secondary mono">{order.pickupCode ?? t("outbound.pickupWhenPrepared")}</span></td>
                  <td><strong>{order.lines.map((line) => line.sku).slice(0, 2).join(" · ")}</strong><span className="queue-secondary">{t("outbound.lineUnits", { lines: order.lines.length, units: required })}</span></td>
                  <td><div className="status-stack">{conditions.map((condition) => <StatusBadge code={condition} key={condition} />)}</div></td>
                  <td><StatusBadge code={order.status} label={t(`outbound.stage.${{
                    TO_PREPARE: "toPrepare",
                    PARTIALLY_PREPARED: "partiallyPrepared",
                    SN_PENDING: "snPending",
                    AWAITING_PICKUP: "awaitingPickup",
                    OUTBOUND: "outbound",
                    ERP_SYNCED: "erpSynced",
                    ERP_ISSUE: "erpIssues",
                  }[outboundOperatorStage(order.status, order.erpSyncStatus)]}`)} /></td>
                  <td className="queue-progress"><strong>{prepared} / {required}</strong><div className="progress"><span style={{ width: `${required ? Math.min(100, (prepared / required) * 100) : 0}%` }} /></div></td>
                  <td><Link className="btn small queue-action" href={`/outbound/${order.id}`}>{nextAction}<ArrowRight /></Link></td>
                </tr>
              );
            })}</tbody>
          </table>
          {!orders.length && <Empty label={t("common.noResults")} />}
        </div>
      </div>
      <div className="toolbar">
        <span className="subtle">{t("common.rowsPage", { rows: outboundPage.total, page, pages: outboundPage.totalPages || 1 })}</span>
        <Button type="button" disabled={page <= 1} onClick={() => {
          setSelectedOrderIds([]);
          setPage((value) => value - 1);
        }}>{t("common.previous")}</Button>
        <Button type="button" disabled={page >= outboundPage.totalPages} onClick={() => {
          setSelectedOrderIds([]);
          setPage((value) => value + 1);
        }}>{t("common.next")}</Button>
      </div>
    </>
  );
}

function OutboundDetail({
  state,
  orderId,
  commit,
  refresh,
}: {
  state: WmsState;
  orderId: string;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const order = state.outboundOrders.find((row) => row.id === orderId);
  const [activeLineId, setActiveLineId] = useState(order?.lines.at(0)?.id ?? "");
  const line = order?.lines.find((row) => row.id === activeLineId) ?? order?.lines.at(0);
  if (!order || !line) return <Empty label={t("common.orderNotFound")} />;
  const candidates = state.inventory.filter(
    (row) =>
      row.warehouseCode === order.warehouseCode &&
      row.sku === line.sku &&
      row.condition === line.requiredCondition &&
      row.availableQty > 0,
  );
  const serialRequired = state.products.find((row) => row.sku === line.sku)?.serialTrackingRequired;
  const canDispatch =
    order.status === "Ready_for_Pickup" &&
    order.lines.every((candidate) => {
      const requiresSerial = state.products.find((row) => row.sku === candidate.sku)?.serialTrackingRequired;
      return candidate.preparedQty === candidate.requiredQty &&
        (!requiresSerial || candidate.scannedSerials.length === candidate.requiredQty);
    });
  const allPrepared = order.lines.every((candidate) => candidate.preparedQty >= candidate.requiredQty);
  const allSerialsComplete = order.lines.every((candidate) => {
    const requiresSerial = state.products.find((row) => row.sku === candidate.sku)?.serialTrackingRequired;
    return !requiresSerial || candidate.scannedSerials.length === candidate.requiredQty;
  });
  const serialMode = outboundSerialMode(order.status, allPrepared, allSerialsComplete);
  const canUseAtomicPreparation =
    ["Imported", "Pending_Allocation", "Partially_Prepared", "Allocated"].includes(order.status) &&
    line.allocatedQty === 0 &&
    line.preparedQty === 0 &&
    line.allocations.length === 0;
  const selectedLineComplete =
    line.allocatedQty === line.requiredQty &&
    line.preparedQty === line.requiredQty &&
    (!serialRequired || line.scannedSerials.length === line.requiredQty);
  const dispatched = ["Outbound", "ERP_Synced"].includes(order.status);
  const readyForPickup = order.status === "Ready_for_Pickup" || dispatched;
  const workflow = [
    { key: "outbound.step.erpImported", complete: true },
    { key: "outbound.step.toPrepare", complete: allPrepared && allSerialsComplete },
    { key: "outbound.step.awaitingPickup", complete: readyForPickup },
    { key: "outbound.step.outbound", complete: dispatched },
  ];
  const currentWorkflowIndex = workflow.findIndex((stage) => !stage.complete);

  return (
    <>
      <PageHead
        title={order.shNo}
        subtitle={t("outbound.subtitle")}
        actions={
          <>
            <Link className="btn" href="/outbound">
              <ArrowLeft /> {t("outbound.orders")}
            </Link>
            <Link className="btn" href={`/outbound/${order.id}/label`}>
              <Printer /> {t("label.print")}
            </Link>
            <Button
              className="primary"
              disabled={!canDispatch}
              onClick={() => {
                const units = order.lines.reduce((sum, row) => sum + row.requiredQty, 0);
                if (!window.confirm(t("outbound.confirmDispatchBody", {
                  sh: order.shNo,
                  pickup: order.pickupCode ?? "—",
                  units,
                }))) return;
                commit({ type: "dispatchOutbound", orderId: order.id }, t("success.outboundDispatched", { sh: order.shNo }));
              }}
            >
              <Truck /> {t("outbound.confirmDispatch")}
            </Button>
          </>
        }
      />
      <div className="stepbar outbound-workflow">
        {workflow.map((stage, index) => (
          <div className={cn("step", stage.complete && "done", index === currentWorkflowIndex && "current", currentWorkflowIndex >= 0 && index > currentWorkflowIndex && "blocked")} key={stage.key}>
            <span>{index + 1}</span>{t(stage.key)}
          </div>
        ))}
      </div>
      {serialMode === "READ_ONLY" && order.status === "Ready_for_Pickup" && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>{t("outbound.assignedSnEvidence")}</h3>
              <span className="subtle">{t("outbound.assignedSnHelp")}</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>{t("common.model")}</th><th>{t("bulk.assigned")}</th></tr></thead>
              <tbody>{order.lines.map((candidate) => (
                <tr key={candidate.id}>
                  <td className="mono strong">{candidate.sku}</td>
                  <td>{candidate.model}</td>
                  <td><div className="serial-chips">{candidate.scannedSerials.map((serial) => (
                    <span className="serial-chip" key={serial}>{serial}</span>
                  ))}{!candidate.scannedSerials.length && <span className="subtle">{t("common.notRequired")}</span>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      <div className="split">
        <div className="grid">
          <div className="panel">
            <div className="panel-head">
              <h3>{t("outbound.requestedLine")}</h3>
              <StatusBadge code={order.status} label={t(`outbound.stage.${{
                TO_PREPARE: "toPrepare",
                PARTIALLY_PREPARED: "partiallyPrepared",
                SN_PENDING: "snPending",
                AWAITING_PICKUP: "awaitingPickup",
                OUTBOUND: "outbound",
                ERP_SYNCED: "erpSynced",
                ERP_ISSUE: "erpIssues",
              }[outboundOperatorStage(order.status, order.erpSyncStatus)]}`)} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>{t("common.model")}</th>
                    <th>{t("common.condition")}</th>
                    <th className="number">{t("common.required")}</th>
                    <th className="number">{t("common.allocated")}</th>
                    <th className="number">{t("common.prepared")}</th>
                    <th className="number">{t("common.dispatched")}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((candidate) => (
                    <tr
                      key={candidate.id}
                      className={candidate.id === line.id ? "selected-row" : ""}
                      onClick={() => setActiveLineId(candidate.id)}
                    >
                      <td className="mono strong">{candidate.sku}</td>
                      <td>{candidate.model}</td>
                      <td><StatusBadge code={candidate.requiredCondition} /></td>
                      <td className="number strong">{candidate.requiredQty}</td>
                      <td className="number">{candidate.allocatedQty}</td>
                      <td className="number">{candidate.preparedQty}</td>
                      <td className="number">{candidate.dispatchedQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {canUseAtomicPreparation && (
            <OutboundPreparationWorkspace
              order={order}
              line={line}
              candidates={candidates}
              serialTrackingRequired={Boolean(serialRequired)}
              onConfirmed={refresh}
            />
          )}
          {selectedLineComplete && !["Ready_for_Pickup", "Outbound", "ERP_Synced"].includes(order.status) && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>{t("outbound.linePreparationCompleted")}</h3>
                  <span className="subtle">{t("outbound.linePreparationCompletedHelp")}</span>
                </div>
                <PackageOpen />
              </div>
              <div className="panel-body summary-list">
                <Summary label={t("common.location")} value={line.allocationLocation ?? t("common.notAllocated")} mono />
                <Summary label={t("common.prepared")} value={line.preparedQty} />
                {Boolean(serialRequired) && <Summary label="SN" value={line.scannedSerials.join(" · ")} mono />}
              </div>
            </div>
          )}
          {!canUseAtomicPreparation && !selectedLineComplete && !["Ready_for_Pickup", "Outbound", "ERP_Synced"].includes(order.status) && (
            <div className="notice warn">{t("outbound.legacyPreparationException")}</div>
          )}
        </div>
        <div className="grid">
          <div className="panel">
            <div className="panel-head">
              <h3>{t("outbound.orderSummary")}</h3>
            </div>
            <div className="panel-body summary-list">
              <Summary label="SH" value={order.shNo} mono />
              <Summary label={t("summary.pickupCode")} value={order.pickupCode ?? t("outbound.pickupWhenPrepared")} mono />
              <Summary label={t("summary.erpWarehouse")} value={order.erpWarehouse === "Unmapped" ? t("status.Unmapped") : order.erpWarehouse} />
              <Summary label={t("summary.physicalWarehouse")} value={order.warehouseCode} />
              <Summary label={t("summary.allocation")} value={line.allocationLocation ?? t("common.notAllocated")} />
              <Summary
                label={t("summary.allocationDetail")}
                value={
                  line.allocations.length
                    ? line.allocations.map((row) => `${row.locationCode} × ${row.quantity}`).join("; ")
                    : t("common.notAllocated")
                }
              />
              <Summary label={t("summary.erpSync")} value={<StatusBadge code={order.erpSyncStatus} />} />
            </div>
          </div>
          {line.preparedQty > 0 && (
            <div className="notice warn">
              {t("outbound.preparedPhysicalHelp", { frozen: line.preparedQty })}
            </div>
          )}
          {!canDispatch && order.status !== "Outbound" && (
            <div className="notice error">
              {t("outbound.dispatchBlocked")}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Summary({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  const { t } = useI18n();
  const keys: Record<string, string> = {
    Model: "common.model",
    Warehouse: "common.warehouse",
    Location: "common.location",
    Condition: "common.condition",
    "Pickup code": "summary.pickupCode",
    "ERP warehouse": "summary.erpWarehouse",
    "Physical warehouse": "summary.physicalWarehouse",
    Allocation: "summary.allocation",
    "Allocation detail": "summary.allocationDetail",
    "ERP sync": "summary.erpSync",
    "Related SH": "summary.relatedSH",
    "Related transfer": "summary.relatedTransfer",
    "Original outbound": "summary.originalOutbound",
    "Default warehouse": "summary.defaultWarehouse",
    "Default location": "summary.defaultLocation",
    "Inventory condition": "summary.inventoryCondition",
    "SN status": "summary.snStatus",
    Transaction: "summary.transaction",
  };
  return (
    <div className="summary-row">
      <span>{keys[label] ? t(keys[label]) : label}</span>
      <strong className={cn(mono && "mono")}>{value}</strong>
    </div>
  );
}

function ReceivingView({
  state,
  commit,
}: {
  state: WmsState;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState("Standard Inbound");
  const tabs = [
    ["Standard Inbound", t("nav.receiving")],
    ["Faulty Return", t("nav.repair")],
    ["Transfer Receive", t("nav.transfers")],
  ];
  function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sku = String(data.get("sku"));
    const serial = String(data.get("serial") ?? "").trim();
    commit(
      {
        type: "adjustStock",
        direction: "In",
        warehouseCode: "SYD",
        locationCode: String(data.get("location")),
        sku,
        itemType: state.products.find((row) => row.sku === sku)?.itemType ?? "Product",
        condition: String(data.get("condition")) as StockCondition,
        qty: Number(data.get("qty")),
        reason: "Standard inbound",
        remark: String(data.get("remark")),
        serialNumber: serial ? serial.toUpperCase() : undefined,
      },
      t("receiving.standardSuccess"),
    );
  }
  return (
    <>
      <PageHead title={t("title.receiving")} subtitle={t("page.receivingSubtitle")} />
      <div className="panel">
        <div className="tabs">
          {tabs.map(([value, label]) => (
            <button className={cn("tab", tab === value && "active")} onClick={() => setTab(value)} key={value}>
              {label}
            </button>
          ))}
        </div>
        {tab === "Standard Inbound" && (
          <form className="panel-body" onSubmit={receive}>
            <div className="form-grid">
              <Field label={t("field.warehouse")}>
                <select disabled>
                  <option>{state.warehouses.find((row) => row.code === "SYD")?.code} · {state.warehouses.find((row) => row.code === "SYD")?.name}</option>
                </select>
              </Field>
              <Field label={t("field.destinationLocation")}>
                <select name="location" defaultValue="FLEX-01">
                  {state.locations
                    .filter((row) => row.warehouseCode === "SYD")
                    .map((row) => (
                      <option key={row.id}>{row.code}</option>
                    ))}
                </select>
              </Field>
              <Field label="SKU">
                <select name="sku" defaultValue="97-223-00108-00">
                  {state.products.map((row) => (
                    <option key={row.id} value={row.sku}>
                      {row.sku} · {row.model}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("field.condition")}>
                <select name="condition" defaultValue="New">
                  <option value="New">{t("status.New")}</option>
                  <option value="Repair_Good">{t("status.Repair_Good")}</option>
                  <option value="Material">{t("status.Material")}</option>
                </select>
              </Field>
              <Field label={t("field.quantity")}>
                <input name="qty" type="number" min="1" defaultValue="1" />
              </Field>
              <Field label={t("field.serialNumber")} help={t("receiving.traceableHelp")}>
                <input name="serial" placeholder={t("receiving.scanPlaceholder")} />
              </Field>
              <Field label={t("field.remark")} full>
                <textarea name="remark" defaultValue="Standard ERP inbound receipt." />
              </Field>
            </div>
            <div className="form-actions">
              <Button className="primary" type="submit">
                <PackageOpen /> {t("action.confirmReceipt")}
              </Button>
            </div>
          </form>
        )}
        {tab === "Faulty Return" && (
          <div className="panel-body">
            <div className="notice">{t("receiving.faultyNotice")}</div>
            <Link className="btn primary" href="/repair">
              <Wrench /> {t("action.openFaulty")}
            </Link>
          </div>
        )}
        {tab === "Transfer Receive" && (
          <div className="panel-body">
            <div className="notice">{t("receiving.transferNotice")}</div>
            <Link className="btn primary" href="/transfers">
              <Truck /> {t("receiving.openTransfers")}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function Field({
  label,
  help,
  full,
  children,
}: {
  label: string;
  help?: string;
  full?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const fieldKeys: Record<string, string> = {
    Warehouse: "field.warehouse",
    "Destination location": "field.destinationLocation",
    Location: "field.location",
    "From location": "field.fromLocation",
    "To location": "field.toLocation",
    Condition: "field.condition",
    Quantity: "field.quantity",
    "Serial number": "field.serialNumber",
    Remark: "field.remark",
    Direction: "field.direction",
    "Item type": "field.itemType",
    Reason: "field.reason",
  };
  return (
    <div className={cn("field", full && "full")}>
      <label>{fieldKeys[label] ? t(fieldKeys[label]) : label}</label>
      {children}
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}

function RepairView({
  state,
  commit,
}: {
  state: WmsState;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [serial, setSerial] = useState("");
  const [record, setRecord] = useState<ERPSerialLookup | null>(null);
  const [searched, setSearched] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ tone: "success" | "error"; message: string }>();
  const faultyScannerRef = useRef<HTMLInputElement>(null);
  const lastLookup = useRef<{ value: string; at: number } | undefined>(undefined);
  async function lookup(event: FormEvent) {
    event.preventDefault();
    const value = serial.trim().toUpperCase();
    const now = Date.now();
    if (!value || lookupBusy) return;
    if (lastLookup.current?.value === value && now - lastLookup.current.at < 800) {
      setScanFeedback({ tone: "error", message: t("scanner.duplicate") });
      restoreScannerFocus(faultyScannerRef.current);
      return;
    }
    lastLookup.current = { value, at: now };
    setLookupBusy(true);
    try {
      const response = await fetch(`/api/wms/faulty-lookup?serialNumber=${encodeURIComponent(value)}`, { cache: "no-store" });
      const result = (await response.json()) as ERPSerialLookup | { error: string };
      setRecord(response.ok ? (result as ERPSerialLookup) : null);
      setSearched(true);
      if (response.ok) {
        setSerial("");
        setScanFeedback({ tone: "success", message: t("scanner.accepted") });
      } else {
        setScanFeedback({ tone: "error", message: "error" in result ? result.error : "SN not found" });
      }
    } finally {
      setLookupBusy(false);
      window.setTimeout(() => restoreScannerFocus(faultyScannerRef.current), 0);
    }
  }
  return (
    <>
      <PageHead
        title={t("title.repair")}
        subtitle={t("page.repairSubtitle")}
      />
      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <h3>{t("repair.scanReturnedStep")}</h3>
          </div>
          <div className="panel-body">
            <form className="scanner" onSubmit={lookup}>
              <div className="scanner-title">
                <ScanLine /> {t("repair.faultySN")}
              </div>
              <div className="scanner-row">
                <input
                  ref={faultyScannerRef}
                  autoFocus
                  autoComplete="off"
                  value={serial}
                  onChange={(event) => setSerial(event.target.value.toUpperCase())}
                  placeholder={`${t("scanner.scanSerial")} → Enter`}
                />
                <Button className="primary" type="submit" disabled={lookupBusy}>
                  {t("action.queryERP")}
                </Button>
              </div>
              {scanFeedback && <div className={`scan-feedback ${scanFeedback.tone}`} aria-live="polite">{scanFeedback.message}</div>}
            </form>
            {searched && !record && (
              <div className="notice error" style={{ marginTop: 14 }}>
                {t("repair.erpNotFound")}
              </div>
            )}
            {record && (
              <div style={{ marginTop: 16 }}>
                <div className="notice">
                  {t("repair.erpFound")}
                </div>
                <div className="summary-list">
                  <Summary label={t("field.serialNumber")} value={record.serialNumber} mono />
                  <Summary label={t("summary.relatedSH")} value={record.relatedShNo} mono />
                  <Summary label="SKU" value={record.sku} mono />
                  <Summary label={t("common.model")} value={record.model} />
                  <Summary label={t("summary.originalOutbound")} value={record.originalOutboundDate} />
                  <Summary label={t("summary.erpStatus")} value={<StatusBadge code={record.erpStatus} />} />
                </div>
                <div className="form-actions">
                  <Button
                    className="primary"
                    onClick={() =>
                      commit(
                        { type: "receiveFaulty", serialNumber: record.serialNumber },
                        t("success.faultyReceived", { sn: record.serialNumber }),
                      )
                    }
                  >
                    <PackageOpen /> {t("action.confirmFaulty")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>{t("repair.receivingPolicy")}</h3>
          </div>
          <div className="panel-body summary-list">
            <Summary label={t("summary.defaultWarehouse")} value="SYD" />
            <Summary label={t("summary.defaultLocation")} value="REPAIR-01" />
            <Summary label={t("summary.inventoryCondition")} value={<StatusBadge code="Repair" />} />
            <Summary label={t("summary.snStatus")} value={<StatusBadge code="Repair" />} />
            <Summary label={t("summary.transaction")} value={<StatusBadge code="Return_to_Repair" />} />
            <Summary label={t("summary.faultyReceipts")} value={state.faultyReceivedCount} />
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h3>{t("repair.lifecycleQueue")}</h3>
          <span className="subtle">{t("repair.preserveSn")}</span>
        </div>
        <div className="panel-body grid">
          {(state.repairJobs ?? []).map((job) => (
            <div className="allocation-card" key={job.id}>
              <div className="strong mono">{job.serialNumber ?? t("repair.unknownLegacySn")}</div>
              <div className="subtle">{job.model} · <StatusBadge code={job.status} /> · {job.currentLocation}</div>
              <Button
                disabled={!["Received", "Pending_Repair"].includes(job.status)}
                onClick={() =>
                  commit(
                    {
                      type: "startRepair",
                      repairJobId: job.id,
                      remark: "Warehouse repair work started.",
                    },
                    t("success.repairStarted", { item: job.serialNumber ?? job.sku }),
                  )
                }
              >
                <Wrench /> {t("action.startRepair")}
              </Button>
              <Button
                className="primary"
                disabled={job.status !== "In_Repair"}
                onClick={() => {
                  if (!window.confirm(t("confirm.repairComplete", { sn: job.serialNumber ?? job.sku }))) return;
                  commit(
                    {
                      type: "completeRepair",
                      repairJobId: job.id,
                      targetLocationCode: "FLEX-01",
                      outcome: "Repair_Good",
                      remark: "Technician repair completed; returned to serviceable stock.",
                    },
                    t("success.repairCompleted", { item: job.serialNumber ?? job.sku }),
                  );
                }}
              >
                <Wrench /> {t("action.completeRepair")}
              </Button>
            </div>
          ))}
          {!state.repairJobs?.length && <Empty label={t("repair.empty")} />}
        </div>
      </div>
    </>
  );
}

function MoveView({
  state,
  commit,
}: {
  state: WmsState;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (
      String(data.get("direction")) === "Out" &&
      !window.confirm(t("confirm.adjustmentOut", {
        sku: String(data.get("sku") || "NO-SKU"),
        location: String(data.get("location")),
        units: Number(data.get("qty")),
      }))
    ) return;
    commit(
      {
        type: "moveStock",
          warehouseCode: "SYD",
          sku: String(data.get("sku")),
          condition: String(data.get("condition")) as StockCondition,
          fromLocation: String(data.get("from")),
          toLocation: String(data.get("to")),
          qty: Number(data.get("qty")),
          remark: String(data.get("remark")),
      },
      t("success.move"),
    );
  }
  const product = state.products.find((row) => row.sku === "10-105-00346-00");
  return (
    <>
      <PageHead title={t("title.move")} subtitle={t("page.moveSubtitle")} />
      <div className="notice warn">
        {t("move.warning")}
      </div>
      <div className="split">
        <form className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h3>{t("move.details")}</h3>
            <Badge tone="teal">{t("common.atomic")}</Badge>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <Field label={t("field.warehouse")}>
                <input value={state.warehouses.find((row) => row.code === "SYD")?.name ?? "SYD"} readOnly />
              </Field>
              <Field label="SKU">
                <select name="sku" defaultValue="10-105-00346-00">
                  {state.products.map((row) => (
                    <option value={row.sku} key={row.id}>
                      {row.sku} · {row.model}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("field.fromLocation")}>
                <select name="from" defaultValue="R1-4-2-L">
                  {state.locations
                    .filter((row) => row.warehouseCode === "SYD")
                    .map((row) => (
                      <option key={row.id}>{row.code}</option>
                    ))}
                </select>
              </Field>
              <Field label={t("field.toLocation")}>
                <select name="to" defaultValue="FLEX-01">
                  {state.locations
                    .filter((row) => row.warehouseCode === "SYD")
                    .map((row) => (
                      <option key={row.id}>{row.code}</option>
                    ))}
                </select>
              </Field>
              <Field label={t("field.condition")}>
                <select name="condition" defaultValue="Material">
                  <option value="Material">{t("status.Material")}</option>
                  <option value="New">{t("status.New")}</option>
                  <option value="Repair_Good">{t("status.Repair_Good")}</option>
                  <option value="Repair">{t("status.Repair")}</option>
                </select>
              </Field>
              <Field label={t("field.quantity")}>
                <input name="qty" type="number" min="1" defaultValue="10" />
              </Field>
              <Field label={t("field.remark")} full>
                <textarea name="remark" defaultValue="Replenishment move from rack to FLEX staging." />
              </Field>
            </div>
            <div className="form-actions">
              <Button className="primary" type="submit">
                <Move /> {t("action.confirmMove")}
              </Button>
            </div>
          </div>
        </form>
        <div className="panel">
          <div className="panel-head">
            <h3>{t("move.sourcePreview")}</h3>
          </div>
          <div className="panel-body">
            <Summary label="SKU" value={product?.sku ?? "—"} mono />
            <Summary label="Model" value={product?.model ?? "—"} />
            <Summary
              label={t("move.availableAt", { location: "R1-4-2-L" })}
              value={
                state.inventory.find(
                  (row) => row.locationCode === "R1-4-2-L" && row.sku === "10-105-00346-00",
                )?.availableQty ?? 0
              }
            />
            <div className="notice" style={{ marginTop: 14 }}>
              Source decreases and destination increases in the same operation. Adjustment is not used.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AdjustmentView({
  state,
  commit,
}: {
  state: WmsState;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [noSku, setNoSku] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const itemType = String(data.get("itemType")) as "Product" | "Material";
    commit(
      {
        type: "adjustStock",
          direction: String(data.get("direction")) as "In" | "Out",
          warehouseCode: "SYD",
          locationCode: String(data.get("location")),
          sku: noSku ? undefined : String(data.get("sku")),
          itemType,
          condition: String(data.get("condition")) as StockCondition,
          qty: Number(data.get("qty")),
          reason: String(data.get("reason")),
          remark: String(data.get("remark")),
      },
      t("success.adjustment"),
    );
  }
  return (
    <>
      <PageHead title={t("title.adjustment")} subtitle={t("page.adjustmentSubtitle")} />
      <div className="split">
        <form className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h3>{t("adjustment.details")}</h3>
            <Badge tone="amber">{t("common.supervisor")}</Badge>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <Field label={t("field.direction")}>
                <select name="direction">
                  <option value="In">{t("operation.in")}</option>
                  <option value="Out">{t("operation.out")}</option>
                </select>
              </Field>
              <Field label={t("field.warehouse")}>
                <input value="SYD" readOnly />
              </Field>
              <Field label={t("field.itemType")}>
                <select name="itemType" defaultValue="Material">
                  <option value="Material">{t("status.Material")}</option>
                  <option value="Product">{t("status.Product")}</option>
                </select>
              </Field>
              <Field label={t("field.location")}>
                <select name="location" defaultValue="R1-4-3-L">
                  {state.locations
                    .filter((row) => row.warehouseCode === "SYD")
                    .map((row) => (
                      <option key={row.id}>{row.code}</option>
                    ))}
                </select>
              </Field>
              <Field label="SKU" help={t("adjustment.skuHelp")}>
                <select name="sku" defaultValue="20-012-10219-08" disabled={noSku}>
                  {state.products.map((row) => (
                    <option value={row.sku} key={row.id}>
                      {row.sku} · {row.model}
                    </option>
                  ))}
                </select>
                <label className="toggle">
                  <input type="checkbox" checked={noSku} onChange={(event) => setNoSku(event.target.checked)} />
                  Unmonitored no-SKU material
                </label>
              </Field>
              <Field label={t("field.condition")}>
                <select name="condition" defaultValue="Material">
                  <option value="Material">{t("status.Material")}</option>
                  <option value="New">{t("status.New")}</option>
                  <option value="Repair_Good">{t("status.Repair_Good")}</option>
                  <option value="Repair">{t("status.Repair")}</option>
                  <option value="Scrap">{t("status.Scrap")}</option>
                </select>
              </Field>
              <Field label={t("field.quantity")}>
                <input name="qty" type="number" min="1" defaultValue="12" />
              </Field>
              <Field label={t("field.reason")}>
                <select name="reason" defaultValue={noSku ? "Unmonitored material" : "Count correction"}>
                  <option value="Count correction">{t("reason.countCorrection")}</option>
                  <option value="Repair completion">{t("reason.repairCompletion")}</option>
                  <option value="Damage write-off">{t("reason.damageWriteOff")}</option>
                  <option value="Unmonitored material">{t("reason.unmonitoredMaterial")}</option>
                </select>
              </Field>
              <Field label={t("field.remark")} full>
                <textarea name="remark" defaultValue="Supervisor-approved stock correction." />
              </Field>
            </div>
            <div className="form-actions">
              <Button className="primary" type="submit">
                <SlidersHorizontal /> {t("action.postAdjustment")}
              </Button>
            </div>
          </div>
        </form>
        <div className="panel">
          <div className="panel-head">
            <h3>{t("adjustment.guardrails")}</h3>
          </div>
          <div className="panel-body">
            <div className="timeline">
              <div className="timeline-item">
                <strong>{t("adjustment.neverOverwrite")}</strong>
                <p>{t("adjustment.neverOverwriteHelp")}</p>
              </div>
              <div className="timeline-item">
                <strong>{t("adjustment.productRequiresSku")}</strong>
                <p>{t("adjustment.productRequiresSkuHelp")}</p>
              </div>
              <div className="timeline-item">
                <strong>{t("adjustment.moveSeparate")}</strong>
                <p>{t("adjustment.moveSeparateHelp")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SerialSearchView({ state }: { state: WmsState }) {
  const { locale, t } = useI18n();
  const initialQuery = () => typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("query")?.trim().toUpperCase() ?? "";
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [remoteResults, setRemoteResults] = useState<SerialNumber[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastSearch = useRef<{ value: string; at: number } | undefined>(undefined);
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim().toUpperCase();
    const now = Date.now();
    if (!value) return;
    if (lastSearch.current?.value === value && now - lastSearch.current.at < 800) return;
    lastSearch.current = { value, at: now };
    setQuery(value);
    setDraft("");
    window.setTimeout(() => restoreScannerFocus(searchRef.current), 0);
  }
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/serials/search?q=${encodeURIComponent(query)}&limit=25`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        const body = await response.json();
        setRemoteResults(body.rows);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setRemoteResults([]);
      });
    return () => controller.abort();
  }, [query, t]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return state.serials.filter(
      (row) =>
        `${row.serialNumber} ${row.sku} ${row.relatedShNo ?? ""} ${row.relatedTransferNo ?? ""}`
          .toLowerCase()
          .includes(needle) ||
        state.outboundOrders.some(
          (order) =>
            (order.shNo.toLowerCase().includes(needle) || order.pickupCode?.toLowerCase().includes(needle)) &&
            order.lines.some((line) => line.sku === row.sku),
        ),
    );
  }, [query, state]);
  const selected = remoteResults[0] ?? results[0];
  const transactions = selected
    ? state.transactions.filter(
        (row) =>
          row.serialNumber === selected.serialNumber ||
          row.businessReference === selected.relatedShNo ||
          row.businessReference === selected.relatedTransferNo,
      )
    : [];
  return (
    <>
      <PageHead title={t("title.snSearch")} subtitle={t("page.snSubtitle")} />
      <form className="scanner" style={{ marginBottom: 16 }} onSubmit={submitSearch}>
        <div className="scanner-title">
          <Search /> Trace inventory
        </div>
        <div className="scanner-row">
          <input ref={searchRef} autoFocus autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("scanner.searchPlaceholder")} />
          <Button className="primary" type="submit">{t("common.search")}</Button>
        </div>
      </form>
      {selected ? (
        <div className="split">
          <div className="panel">
            <div className="panel-head">
              <h3 className="mono">{selected.serialNumber}</h3>
              <StatusBadge code={selected.status} />
            </div>
            <div className="panel-body summary-list">
              <Summary label="SKU" value={selected.sku} mono />
              <Summary label={t("common.model")} value={selected.model} />
              <Summary label={t("common.warehouse")} value={selected.warehouseCode ?? t("common.outsideWms")} />
              <Summary label={t("common.location")} value={selected.locationCode ?? "—"} />
              <Summary label={t("common.condition")} value={<StatusBadge code={selected.condition} />} />
              <Summary label={t("summary.relatedSH")} value={selected.relatedShNo ?? "—"} mono />
              <Summary label={t("summary.relatedTransfer")} value={selected.relatedTransferNo ?? "—"} mono />
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>{t("scanner.transactionTimeline")}</h3>
            </div>
            <div className="panel-body timeline">
              {transactions.map((row) => (
                <div className="timeline-item" key={row.id}>
                  <strong>{row.type.replaceAll("_", " ")}</strong>
                  {(row.sourceCondition || row.targetCondition || row.repairOutcome) && (
                    <p>
                      {row.sourceCondition ?? row.condition} → {row.targetCondition ?? row.condition}
                      {row.repairOutcome
                        ? ` · ${row.repairOutcome.replaceAll("_", " ")}`
                        : ""}
                    </p>
                  )}
                  <p>
                    {formatWarehouseDateTime(row.at, locale, "Australia/Sydney")} · {row.fromLocation ?? "—"} → {row.toLocation ?? "—"}
                  </p>
                </div>
              ))}
              <div className="timeline-item">
                <strong>{t("common.status")} · {t(`status.${selected.status}`)}</strong>
                <p>{selected.locationCode ?? "No current physical location"}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel">
          <Empty label={t("scanner.noTrace")} />
        </div>
      )}
    </>
  );
}

function TransferView({
  state,
  warehouse,
  commit,
  refresh,
}: {
  state: WmsState;
  warehouse: WarehouseCode;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <>
      <PageHead title={t("title.transfers")} subtitle={t("page.transferSubtitle")} />
      <BatchTransferPanel sourceWarehouse={warehouse} onConfirmed={refresh} />
      {state.transfers
        .filter((transfer, index, rows) =>
          transfer.status === "In_Transit" &&
          transfer.destinationWarehouse === warehouse &&
          rows.findIndex((candidate) => candidate.id === transfer.id) === index
        )
        .map((transfer) => (
          <TransferReceiptPanel
            key={`receipt-${transfer.id}`}
            transferId={transfer.id}
            transferNo={transfer.transferNo}
            destinationWarehouse={transfer.destinationWarehouse}
            expectedCount={state.transfers
              .filter((candidate) => candidate.id === transfer.id)
              .reduce((sum, candidate) => sum + candidate.serials.length, 0)}
            onConfirmed={refresh}
          />
        ))}
      <div className="notice">{t("transfer.notice")}</div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("table.transfer")}</th>
                <th>{t("table.route")}</th>
                <th>SKU / {t("common.model")}</th>
                <th className="number">{t("common.quantityShort")}</th>
                <th>{t("table.serials")}</th>
                <th>{t("common.status")}</th>
                <th>{t("table.action")}</th>
              </tr>
            </thead>
            <tbody>
              {state.transfers.map((transfer) => (
                <tr key={`${transfer.id}:${transfer.sku}:${transfer.condition}`}>
                  <td className="mono strong">{transfer.transferNo}</td>
                  <td>
                    <span className="strong">{transfer.sourceWarehouse}</span> →{" "}
                    <span className="strong">{transfer.destinationWarehouse}</span>
                    <div className="subtle">
                      {transfer.sourceLocation ?? "—"} → {transfer.destinationLocation ?? t("transfer.destinationPending")}
                    </div>
                  </td>
                  <td>
                    <span className="mono">{transfer.sku}</span>
                    <div className="subtle">{transfer.model}</div>
                  </td>
                  <td className="number">{transfer.qty}</td>
                  <td>
                    {transfer.serials.map((sn) => (
                      <span className="serial-chip" key={sn}>
                        {sn}
                      </span>
                    ))}
                  </td>
                  <td>
                    <StatusBadge code={transfer.status} />
                  </td>
                  <td>
                    {transfer.status === "Draft" && (
                      <Button
                        className="primary small"
                        onClick={() => {
                          if (!window.confirm(t("confirm.transferDispatch", {
                            transfer: transfer.transferNo,
                            route: `${transfer.sourceWarehouse} → ${transfer.destinationWarehouse}`,
                            units: transfer.qty,
                          }))) return;
                          commit(
                            { type: "dispatchTransfer", transferId: transfer.id },
                            t("success.transferDispatched", { transfer: transfer.transferNo }),
                          );
                        }}
                      >
                        {t("action.transferOut")}
                      </Button>
                    )}
                    {transfer.status === "In_Transit" && <span className="subtle">{t("transfer.receiveTitle")}</span>}
                    {transfer.status === "Received" && <span className="subtle">{t("transfer.complete")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StocktakeView({ state, warehouse }: { state: WmsState; warehouse: "SYD" | "MEL" | "BNE" }) {
  const { t } = useI18n();
  const rows = state.inventory.filter((row) => row.warehouseCode === warehouse).slice(0, 6);
  const [counts, setCounts] = useState<Record<string, string>>({});
  return (
    <>
      <PageHead
        title={t("title.stocktake")}
        subtitle={t("page.stocktakeSubtitle")}
        actions={
          <Button className="primary">
            <Plus /> {t("action.createStocktake")}
          </Button>
        }
      />
      <div className="notice warn">{t("stocktake.preview")}</div>
      <div className="panel">
        <div className="panel-head">
          <h3>ST-{warehouse}-0008 · Cycle count</h3>
          <Badge tone="blue">{t("common.counting")}</Badge>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.location")}</th>
                <th>SKU</th>
                <th>{t("common.condition")}</th>
                <th className="number">{t("common.physical")}</th>
                <th className="number">{t("common.frozen")}</th>
                <th className="number">{t("common.available")}</th>
                <th>{t("table.counted")}</th>
                <th className="number">{t("table.variance")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const counted = counts[row.id];
                const variance = counted === undefined || counted === "" ? null : Number(counted) - row.physicalQty;
                return (
                  <tr className={cn(variance !== null && variance !== 0 && "anomaly")} key={row.id}>
                    <td className="strong">{row.locationCode}</td>
                    <td className="mono">{row.sku ?? "NO-SKU"}</td>
                    <td>
                      <StatusBadge code={row.condition} />
                    </td>
                    <td className="number">{row.physicalQty}</td>
                    <td className="number">{row.frozenQty}</td>
                    <td className="number">{row.availableQty}</td>
                    <td>
                      <input
                        style={{ width: 90 }}
                        type="number"
                        min="0"
                        value={counted ?? ""}
                        onChange={(event) => setCounts((current) => ({ ...current, [row.id]: event.target.value }))}
                        placeholder={t("common.counting")}
                      />
                    </td>
                    <td className="number strong">{variance ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AuditView({ state }: { state: WmsState }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [auditPage, setAuditPage] = useState<{ rows: AuditEntry[]; total: number; totalPages: number }>({
    rows: state.audit,
    total: state.audit.length,
    totalPages: 1,
  });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (query) params.set("operation", query);
      fetch(`/api/audit?${params}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(t("common.loadFailed"));
          setAuditPage(await response.json());
        })
        .catch(() => undefined);
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [page, query, t]);
  const rows = auditPage.rows;
  return (
    <>
      <PageHead title={t("title.audit")} subtitle={t("page.auditSubtitle")} />
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input placeholder={t("audit.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("table.timestamp")}</th>
                <th>{t("table.operation")}</th>
                <th>{t("table.actor")}</th>
                <th>{t("table.entity")}</th>
                <th>{t("table.businessReference")}</th>
                <th>{t("table.remark")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AuditRow row={row} key={row.id} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <span className="subtle">{t("common.rowsPage", { rows: auditPage.total, page, pages: auditPage.totalPages || 1 })}</span>
          <Button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous")}</Button>
          <Button type="button" disabled={page >= auditPage.totalPages} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button>
        </div>
      </div>
    </>
  );
}

function AuditRow({ row }: { row: AuditEntry }) {
  const { locale } = useI18n();
  return (
    <tr>
      <td>{formatWarehouseDateTime(row.at, locale, "Australia/Sydney")}</td>
      <td className="strong">{translateAuditOperation(locale, row.operation)}</td>
      <td>{row.actor}</td>
      <td>
        {row.entityType}
        <div className="subtle mono">{row.entityId}</div>
      </td>
      <td className="mono">{row.businessReference ?? "—"}</td>
      <td>{row.remark}</td>
    </tr>
  );
}

function ExceptionView({ state }: { state: WmsState }) {
  const { locale, t } = useI18n();
  return (
    <>
      <PageHead title={t("title.exceptions")} subtitle={t("page.exceptionSubtitle")} />
      <div className="grid metrics" style={{ gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", marginBottom: 16 }}>
        {(["Critical", "High", "Medium", "Low"] as const).map((severity) => (
          <div className={cn("metric", severity === "Critical" && "alert")} key={severity}>
            <div className="metric-label">{t("exception.severityLabel", { severity: t(`status.${severity}`) })}</div>
            <div className="metric-value">
              {state.exceptions.filter((row) => row.severity === severity && row.status !== "Resolved").length}
            </div>
            <div className="metric-meta">{t("exception.open")}</div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("table.severity")}</th>
                <th>{t("table.type")}</th>
                <th>{t("common.entityReference")}</th>
                <th>{t("table.message")}</th>
                <th>{t("common.status")}</th>
                <th>{t("table.created")}</th>
              </tr>
            </thead>
            <tbody>
              {state.exceptions.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Badge tone={row.severity === "Critical" || row.severity === "High" ? "red" : "amber"}>
                      {row.severity}
                    </Badge>
                  </td>
                  <td className="strong">{row.type}</td>
                  <td className="mono">{row.entityReference}</td>
                  <td>{row.message}</td>
                  <td>
                    <StatusBadge code={row.status} />
                  </td>
                  <td>{formatWarehouseDateTime(row.createdAt, locale, "Australia/Sydney")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AdminView({ state, resource }: { state: WmsState; resource: string }) {
  const { t } = useI18n();
  const title = resource === "erp-mapping" ? t("nav.erpMapping") : t(`nav.${resource}`);
  return (
    <>
      <PageHead
        title={title}
        subtitle={t("admin.subtitle")}
      />
      <div className="panel">
        {resource === "products" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>{t("common.model")}</th>
                  <th>{t("table.type")}</th>
                  <th>{t("common.category")}</th>
                  <th>{t("common.snTracking")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {state.products.map((row) => (
                  <tr key={row.id}>
                    <td className="mono strong">{row.sku}</td>
                    <td>{row.model}</td>
                    <td>{row.itemType}</td>
                    <td>{row.category}</td>
                    <td>{row.serialTrackingRequired ? t("common.requiredValue") : t("common.notRequired")}</td>
                    <td>
                      <StatusBadge code={row.active ? "Active" : "Inactive"} label={row.active ? t("common.active") : t("common.inactive")} tone="teal" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {resource === "locations" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("common.warehouse")}</th>
                  <th>{t("common.location")}</th>
                  <th>{t("common.zone")}</th>
                  <th>{t("common.serviceZone")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {state.locations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.warehouseCode}</td>
                    <td className="mono strong">{row.code}</td>
                    <td>{row.zone}</td>
                    <td>{row.serviceZone ? t("common.yes") : t("common.no")}</td>
                    <td>
                      <StatusBadge code={row.active ? "Active" : "Inactive"} label={row.active ? t("common.active") : t("common.inactive")} tone="teal" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {resource === "warehouses" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("common.code")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("reconciliation.timezone")}</th>
                  <th>{t("nav.locations")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {state.warehouses.map((row) => (
                  <tr key={row.id}>
                    <td className="mono strong">{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.timezone}</td>
                    <td>{state.locations.filter((location) => location.warehouseCode === row.code).length}</td>
                    <td>
                      <StatusBadge code={row.active ? "Active" : "Inactive"} label={row.active ? t("common.active") : t("common.inactive")} tone="teal" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {resource === "erp-mapping" && (
          <ERPHealthPanel />
        )}
      </div>
    </>
  );
}

function LabelView({ order }: { order: OutboundOrder; state: WmsState }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"BATCH_LABEL" | "UNIT_SN_LABEL">("BATCH_LABEL");
  const [labels, setLabels] = useState<Array<{
    groupKey: string;
    pickupCode?: string;
    shNos: string[];
    serialNumber?: string;
    totalQty: number;
    lines: Array<{ sku: string; model: string; erpWarehouse: string; qty: number }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/labels/preview?orderId=${encodeURIComponent(order.id)}&mode=${mode}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        const body = await response.json();
        setLabels(body.labels);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setLabels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, order.id, t]);
  return (
    <div className="label-page">
      <div className="print-controls">
        <Link className="btn" href={`/outbound/${order.id}`}>
          <ArrowLeft /> {t("label.backToOrder")}
        </Link>
        <div className="label-mode-switch" role="group" aria-label={t("label.previewTitle")}>
          <Button className={mode === "BATCH_LABEL" ? "primary" : ""} onClick={() => { setLoading(true); setMode("BATCH_LABEL"); }}>
            {t("label.pickupBatch")}
          </Button>
          <Button className={mode === "UNIT_SN_LABEL" ? "primary" : ""} onClick={() => { setLoading(true); setMode("UNIT_SN_LABEL"); }}>
            {t("label.unitSn")}
          </Button>
        </div>
        <Button className="primary" disabled={loading || !labels.length} onClick={() => window.print()}>
          <Printer /> {t("action.printA4")}
        </Button>
      </div>
      <div className="notice">{t("label.previewHelp")}</div>
      {loading && <div className="page-loading">{t("common.loading")}</div>}
      {!loading && !labels.length && <Empty label={mode === "UNIT_SN_LABEL" ? t("scanner.waiting") : t("common.noResults")} />}
      {labels.map((label) => (
      <article className="label-sheet" key={label.groupKey}>
        <div className="label-brand">FOXESS · {t("label.warehouseOperations")}</div>
        <div>
          <section className="label-main">
            <div className="label-kicker">{mode === "BATCH_LABEL" ? t("label.pickupBatch") : t("label.unitSn")}</div>
            <div className="label-sh">{label.shNos.join(" · ")}</div>
            <div className="label-pickup">
              <span>{label.pickupCode ? t("common.pickup") : t("label.shNumbers")}</span>
              <strong>{label.pickupCode ?? label.shNos.join(" · ")}</strong>
            </div>
            {label.serialNumber && <div className="label-serial mono">{label.serialNumber}</div>}
          </section>
          <section className="label-details">
            {label.lines.map((line) => (
              <div className="label-detail" key={`${line.sku}:${line.model}:${line.erpWarehouse}`}>
                <span>{line.sku} · {line.model}</span>
                <strong>{line.erpWarehouse === "Unmapped" ? t("status.Unmapped") : line.erpWarehouse} · {t("common.quantityShort")} {line.qty}</strong>
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

// Exported for focused UI tests and future server/client separation.
export type { InventoryBalance, SerialNumber };
