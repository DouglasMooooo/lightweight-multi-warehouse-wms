"use client";

import {
  ArrowLeft,
  ArrowRight,
  Move,
  PackageCheck,
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
  WmsState,
  WmsCommand,
} from "@/domain/types";
import type { ERPSerialLookup } from "@/integrations/erp-adapter";
import { ReconciliationView } from "@/components/reconciliation-view";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { InventoryPage } from "@/components/inventory/inventory-page";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, StatusBadge } from "@/components/shared/status-badge";
import { Button, cn, EmptyState as Empty, PageHeader as PageHead } from "@/components/shared/ui";
import { useI18n } from "@/i18n/provider";
import { shouldShowDemoReset } from "@/lib/environment";
import {
  beginScanSubmission,
  completeScanSubmission,
  restoreScannerFocus,
  type ScannerState,
} from "@/lib/scanner";
import { formatWarehouseDateTime } from "@/lib/warehouse-time";

const routeTitleKeys: Record<string, string> = {
  dashboard: "title.dashboard", inventory: "title.inventory", outbound: "title.outbound",
  receiving: "title.receiving", repair: "title.repair", move: "title.move",
  adjustment: "title.adjustment", "sn-search": "title.snSearch", transfers: "title.transfers",
  stocktake: "title.stocktake", audit: "title.audit", exceptions: "title.exceptions",
  reconciliation: "title.reconciliation", admin: "title.admin",
};

export function WmsApp({ path }: { path: string[] }) {
  const { t, error: friendlyError } = useI18n();
  const section = path[0] ?? "dashboard";
  const [state, setState] = useState<WmsState | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [warehouse, setWarehouse] = useState<"SYD" | "MEL" | "BNE">("SYD");
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/wms", { cache: "no-store" })
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
  }, [friendlyError, t]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function commit(command: WmsCommand, success: string) {
    try {
      const response = await fetch("/api/wms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = (await response.json()) as WmsState | { error: string; code?: string };
      if (!response.ok) throw new Error("error" in body ? friendlyError(body.code, body.error) : friendlyError());
      setState(body as WmsState);
      setToast({ message: success });
      return true;
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Operation failed.", error: true });
      return false;
    }
  }

  async function resetDemo() {
    await commit({ type: "resetDemo" }, "Demo database restored to the validated starting state.");
  }

  if (!ready) return <div className="loading-shell"><div className="loading-bar" /><div>{t("common.loading")}</div></div>;
  if (!state)
    return (
      <div className="startup-error" role="alert">
        <strong>{t("common.loadFailed")}</strong>
        <Button className="primary" onClick={() => window.location.reload()}>{t("common.retry")}</Button>
      </div>
    );

  if (section === "outbound" && path[2] === "label") {
    const order = state.outboundOrders.find((row) => row.id === path[1]);
    return order ? <LabelView order={order} state={state} /> : <div className="empty">Order not found.</div>;
  }

  const title = t(routeTitleKeys[section] ?? "app.name");
  const demoMode = shouldShowDemoReset({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    demoMode: process.env.NEXT_PUBLIC_DEMO_MODE,
  });

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
          {section === "dashboard" && <DashboardPage state={state} warehouse={warehouse} />}
          {section === "inventory" && <InventoryPage state={state} warehouse={warehouse} />}
          {section === "outbound" &&
            (path[1] ? (
              <OutboundDetail state={state} orderId={path[1]} commit={commit} />
            ) : (
              <OutboundList state={state} warehouse={warehouse} commit={commit} />
            ))}
          {section === "receiving" && <ReceivingView state={state} commit={commit} />}
          {section === "repair" && <RepairView state={state} commit={commit} />}
          {section === "move" && <MoveView state={state} commit={commit} />}
          {section === "adjustment" && <AdjustmentView state={state} commit={commit} />}
          {section === "sn-search" && <SerialSearchView state={state} />}
          {section === "transfers" && <TransferView state={state} commit={commit} />}
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
  commit,
}: {
  state: WmsState;
  warehouse: "SYD" | "MEL" | "BNE";
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [importSh, setImportSh] = useState("");
  const [queue, setQueue] = useState("Active");
  const orders = state.outboundOrders.filter(
    (order) =>
      order.warehouseCode === warehouse &&
      (queue === "Active"
        ? order.status !== "Outbound"
        : queue === "Needs"
          ? ["Imported", "Pending_Allocation"].includes(order.status)
          : queue === "Outbound"
            ? order.status === "Outbound"
            : order.status === queue) &&
      `${order.shNo} ${order.pickupCode ?? ""} ${order.lines.map((line) => line.sku).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHead
        title={t("title.outbound")}
        subtitle={t("outbound.subtitle")}
        actions={
          <form
            className="scanner-row"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!importSh.trim()) return;
              const accepted = await commit(
                { type: "importOutbound", shNo: importSh.trim().toUpperCase() },
                `${importSh.trim().toUpperCase()} imported as Pending Allocation; no stock frozen.`,
              );
              if (accepted) setImportSh("");
            }}
          >
            <input
              aria-label="SH number to import"
              placeholder="Try SH-2607-00175722"
              value={importSh}
              onChange={(event) => setImportSh(event.target.value.toUpperCase())}
            />
            <Button className="primary" type="submit">
              <Plus /> {t("outbound.import")}
            </Button>
          </form>
        }
      />
      <div className="queue-tabs" role="tablist">
        {[
          ["Active", t("common.active")],
          ["Needs", t("status.Pending_Allocation")],
          ["Allocated", t("status.Allocated")],
          ["Prepared", t("status.Prepared")],
          ["Ready_for_Pickup", t("status.Ready_for_Pickup")],
          ["Outbound", t("status.Outbound")],
        ].map(([value, label]) => (
          <button className={queue === value ? "active" : ""} key={value} onClick={() => setQueue(value)}>{label}</button>
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
        {orders.map((order) => {
          const required = order.lines.reduce((sum, row) => sum + row.requiredQty, 0);
          const prepared = order.lines.reduce((sum, row) => sum + row.preparedQty, 0);
          return (
            <div className="order-card" key={order.id}>
              <div>
                <div className="title mono">{order.shNo}</div>
                <div className="subtle">{order.customerLabel}</div>
              </div>
              <div>
                <span className="subtle">Pickup</span>
                <div className="strong mono">{order.pickupCode ?? "Not generated"}</div>
              </div>
              <div>
                <StatusBadge code={order.status} />
              </div>
              <div>
                <span className="subtle">
                  Prepared {prepared}/{required}
                </span>
                <div className="progress">
                  <span style={{ width: `${Math.min(100, (prepared / required) * 100)}%` }} />
                </div>
              </div>
              <Link className="btn small" href={`/outbound/${order.id}`}>
                {t("common.open")} <ArrowRight />
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}

function OutboundDetail({
  state,
  orderId,
  commit,
}: {
  state: WmsState;
  orderId: string;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
}) {
  const { locale, t } = useI18n();
  const order = state.outboundOrders.find((row) => row.id === orderId);
  const [scanner, setScanner] = useState<ScannerState>({ value: "", inFlight: false });
  const scannerRef = useRef<HTMLInputElement>(null);
  if (!order) return <Empty label="Outbound order not found." />;
  const line = order.lines[0];
  const candidates = state.inventory.filter(
    (row) =>
      row.warehouseCode === order.warehouseCode &&
      row.sku === line.sku &&
      row.condition === line.requiredCondition &&
      row.availableQty > 0,
  );
  const serialRequired = state.products.find((row) => row.sku === line.sku)?.serialTrackingRequired;
  const activeOrderId = order.id;
  const activeOrderShNo = order.shNo;
  const activeLineId = line.id;
  const canDispatch =
    line.preparedQty === line.requiredQty &&
    (!serialRequired || line.scannedSerials.length === line.requiredQty) &&
    order.status !== "Outbound";
  const canPrepare = line.allocatedQty > line.preparedQty && order.status !== "Outbound";
  const step =
    order.status === "Outbound"
      ? 5
      : line.scannedSerials.length === line.requiredQty
        ? 4
        : line.preparedQty
          ? 3
          : line.allocatedQty
            ? 2
            : 1;

  async function scanSerial(event: FormEvent) {
    event.preventDefault();
    const started = beginScanSubmission(scanner);
    if (!started.accepted) {
      setScanner(
        started.state.feedback?.message === "DUPLICATE_SCAN"
          ? { ...started.state, feedback: { tone: "error", message: t("scanner.duplicate") } }
          : started.state,
      );
      restoreScannerFocus(scannerRef.current);
      return;
    }
    setScanner(started.state);
    const accepted = await commit(
      { type: "scanOutboundSerial", orderId: activeOrderId, lineId: activeLineId, serialNumber: started.value },
      `${t("scanner.accepted")}: ${started.value} · ${activeOrderShNo}`,
    );
    setScanner((current) =>
      completeScanSubmission(current, {
        accepted,
        message: accepted ? t("scanner.accepted") : locale === "zh-CN" ? "扫描未通过，请查看上方错误。" : "Scan rejected; review the error above.",
      }),
    );
    window.setTimeout(() => restoreScannerFocus(scannerRef.current), 0);
  }

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
              <Printer /> {t("outbound.printLabel")}
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
                commit({ type: "dispatchOutbound", orderId: order.id }, `${order.shNo} dispatched; ERP sync queued.`);
              }}
            >
              <Truck /> {t("outbound.confirmDispatch")}
            </Button>
            <Button
              disabled={!canPrepare}
              onClick={() =>
                commit(
                  {
                    type: "prepareOutbound",
                    orderId: order.id,
                    lineId: line.id,
                    allocationIds: line.allocations.filter((row) => !row.preparedAt).map((row) => row.id),
                  },
                  `${order.shNo} physical preparation confirmed; frozen stock updated.`,
                )
              }
            >
              <PackageCheck /> {t("outbound.confirmPrepared")}
            </Button>
          </>
        }
      />
      <div className="stepbar">
        {["ERP order", "Allocated", "Prepared", "SN scanned", "Dispatched"].map((label, index) => (
          <div className={cn("step", index + 1 <= step && "done")} key={label}>
            {label}
          </div>
        ))}
      </div>
      <div className="split">
        <div className="grid">
          <div className="panel">
            <div className="panel-head">
              <h3>{t("outbound.requestedLine")}</h3>
              <StatusBadge code={order.status} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Model</th>
                    <th>Condition</th>
                    <th className="number">Required</th>
                    <th className="number">Allocated</th>
                    <th className="number">Prepared</th>
                    <th className="number">Dispatched</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono strong">{line.sku}</td>
                    <td>{line.model}</td>
                    <td>
                      <Badge>{line.requiredCondition}</Badge>
                    </td>
                    <td className="number strong">{line.requiredQty}</td>
                    <td className="number">{line.allocatedQty}</td>
                    <td className="number">{line.preparedQty}</td>
                    <td className="number">{line.dispatchedQty}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {line.allocatedQty < line.requiredQty && (
            <div className="panel">
              <div className="panel-head">
                <h3>{t("outbound.eligibleInventory")}</h3>
                <span className="subtle">Only available stock matching condition</span>
              </div>
              <div className="panel-body grid">
                {candidates.map((row) => (
                  <div className="allocation-card" key={row.id}>
                    <div className="strong">{row.locationCode}</div>
                    <div className="subtle">
                      {row.model} · {row.condition}
                    </div>
                    <div className="allocation-meta">
                      <div>
                        <span>Physical</span>
                        <strong>{row.physicalQty}</strong>
                      </div>
                      <div>
                        <span>Frozen</span>
                        <strong>{row.frozenQty}</strong>
                      </div>
                      <div>
                        <span>Available</span>
                        <strong>{row.availableQty}</strong>
                      </div>
                    </div>
                    <Button
                      className="primary"
                      onClick={() =>
                        commit(
                          {
                            type: "allocateOutbound",
                            orderId: order.id,
                            lineId: line.id,
                            locationCode: row.locationCode,
                            qty: Math.min(row.availableQty, line.requiredQty - line.allocatedQty),
                          },
                          `${Math.min(row.availableQty, line.requiredQty - line.allocatedQty)} units allocated at ${row.locationCode}; physical and frozen quantities unchanged.`,
                        )
                      }
                    >
                      <PackageCheck /> Allocate
                    </Button>
                  </div>
                ))}
                {!candidates.length && <Empty label={t("outbound.noEligible")} />}
              </div>
            </div>
          )}
          {line.preparedQty > 0 && order.status !== "Outbound" && serialRequired && (
            <div className="scanner">
              <div className="scanner-title">
                <ScanLine /> {t("scanner.scanSerial")}
              </div>
              <form className="scanner-row" onSubmit={scanSerial}>
                <input
                  ref={scannerRef}
                  autoFocus
                  autoComplete="off"
                  placeholder={`${t("scanner.scanSerial")} → Enter`}
                  value={scanner.value}
                  disabled={scanner.inFlight}
                  onChange={(event) => setScanner((current) => ({ ...current, value: event.target.value }))}
                />
                <Button className="primary" type="submit" disabled={scanner.inFlight}>
                  {t("scanner.scanSerial")}
                </Button>
              </form>
              <div className="scanner-progress">
                <div><span>{t("scanner.required")}</span><strong>{line.requiredQty}</strong></div>
                <div><span>{t("scanner.scanned")}</span><strong>{line.scannedSerials.length} / {line.requiredQty}</strong></div>
              </div>
              {scanner.feedback && <div className={`scan-feedback ${scanner.feedback.tone}`} aria-live="polite">{scanner.feedback.message}</div>}
              <div className="serial-chips">
                {line.scannedSerials.map((serial) => (
                  <span className="serial-chip" key={serial}>
                    {serial}
                  </span>
                ))}
                {!line.scannedSerials.length && (
                  <span className="subtle">{t("scanner.waiting")}</span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid">
          <div className="panel">
            <div className="panel-head">
              <h3>{t("outbound.orderSummary")}</h3>
            </div>
            <div className="panel-body summary-list">
              <Summary label="SH No" value={order.shNo} mono />
              <Summary label="Pickup code" value={order.pickupCode ?? "Generated when fully prepared"} mono />
              <Summary label="ERP warehouse" value={order.erpWarehouse} />
              <Summary label="Physical warehouse" value={order.warehouseCode} />
              <Summary label="Allocation" value={line.allocationLocation ?? "Not allocated"} />
              <Summary
                label="Allocation detail"
                value={
                  line.allocations.length
                    ? line.allocations.map((row) => `${row.locationCode} × ${row.quantity}`).join("; ")
                    : "Not allocated"
                }
              />
              <Summary label="ERP sync" value={order.erpSyncStatus} />
            </div>
          </div>
          {line.preparedQty > 0 && (
            <div className="notice warn">
              Frozen {line.preparedQty}. Physical stock remains unchanged until Confirm Dispatch.
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
      "Standard inbound recorded and inventory updated.",
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
              <Field label="Warehouse">
                <select disabled>
                  <option>SYD · Sydney Service Warehouse</option>
                </select>
              </Field>
              <Field label="Destination location">
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
              <Field label="Condition">
                <select name="condition" defaultValue="New">
                  <option value="New">{t("status.New")}</option>
                  <option value="Repair_Good">{t("status.Repair_Good")}</option>
                  <option value="Material">{t("status.Material")}</option>
                </select>
              </Field>
              <Field label="Quantity">
                <input name="qty" type="number" min="1" defaultValue="1" />
              </Field>
              <Field label="Serial number" help="Required for a traceable Product unit. Scanner input behaves as keyboard entry.">
                <input name="serial" placeholder="Scan or enter SN" />
              </Field>
              <Field label="Remark" full>
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
            <div className="notice">Faulty receipts use ERP SN lookup and default to the Sydney repair location.</div>
            <Link className="btn primary" href="/repair">
              <Wrench /> {t("action.openFaulty")}
            </Link>
          </div>
        )}
        {tab === "Transfer Receive" && (
          <div className="panel-body">
            <div className="notice">Transfer receipt reduces In Transit and increases destination physical inventory.</div>
            <Link className="btn primary" href="/transfers">
              <Truck /> Open transfers
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
            <h3>1 · Scan returned unit</h3>
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
                  <Summary label="Serial number" value={record.serialNumber} mono />
                  <Summary label="Related SH" value={record.relatedShNo} mono />
                  <Summary label="SKU" value={record.sku} mono />
                  <Summary label="Model" value={record.model} />
                  <Summary label="Original outbound" value={record.originalOutboundDate} />
                  <Summary label="ERP status" value={record.erpStatus} />
                </div>
                <div className="form-actions">
                  <Button
                    className="primary"
                    onClick={() =>
                      commit(
                        { type: "receiveFaulty", serialNumber: record.serialNumber },
                        `${record.serialNumber} received to REPAIR-01 with status Repair.`,
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
            <Summary label="Default warehouse" value="SYD" />
            <Summary label="Default location" value="REPAIR-01" />
            <Summary label="Inventory condition" value={<StatusBadge code="Repair" />} />
            <Summary label="SN status" value={<StatusBadge code="Repair" />} />
            <Summary label="Transaction" value="Return_to_Repair" />
            <Summary label="Faulty receipts recorded" value={state.faultyReceivedCount} />
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h3>{t("repair.lifecycleQueue")}</h3>
          <span className="subtle">Same known SN is preserved through Repair → Repair_Good</span>
        </div>
        <div className="panel-body grid">
          {(state.repairJobs ?? []).map((job) => (
            <div className="allocation-card" key={job.id}>
              <div className="strong mono">{job.serialNumber ?? "Unknown legacy SN"}</div>
              <div className="subtle">{job.model} · {job.status} · {job.currentLocation}</div>
              <Button
                disabled={!["Received", "Pending_Repair"].includes(job.status)}
                onClick={() =>
                  commit(
                    {
                      type: "startRepair",
                      repairJobId: job.id,
                      remark: "Warehouse repair work started.",
                    },
                    `${job.serialNumber ?? job.sku} moved to In Repair.`,
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
                    `${job.serialNumber ?? job.sku} completed as Repair_Good at FLEX-01.`,
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
      "Move completed atomically. Warehouse total is unchanged.",
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
            <Badge tone="teal">Atomic</Badge>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <Field label="Warehouse">
                <input value="SYD · Sydney Service Warehouse" readOnly />
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
              <Field label="From location">
                <select name="from" defaultValue="R1-4-2-L">
                  {state.locations
                    .filter((row) => row.warehouseCode === "SYD")
                    .map((row) => (
                      <option key={row.id}>{row.code}</option>
                    ))}
                </select>
              </Field>
              <Field label="To location">
                <select name="to" defaultValue="FLEX-01">
                  {state.locations
                    .filter((row) => row.warehouseCode === "SYD")
                    .map((row) => (
                      <option key={row.id}>{row.code}</option>
                    ))}
                </select>
              </Field>
              <Field label="Condition">
                <select name="condition" defaultValue="Material">
                  <option value="Material">{t("status.Material")}</option>
                  <option value="New">{t("status.New")}</option>
                  <option value="Repair_Good">{t("status.Repair_Good")}</option>
                  <option value="Repair">{t("status.Repair")}</option>
                </select>
              </Field>
              <Field label="Quantity">
                <input name="qty" type="number" min="1" defaultValue="10" />
              </Field>
              <Field label="Remark" full>
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
              label="Available at R1-4-2-L"
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
      "Adjustment transaction recorded and current stock updated.",
    );
  }
  return (
    <>
      <PageHead title={t("title.adjustment")} subtitle={t("page.adjustmentSubtitle")} />
      <div className="split">
        <form className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h3>{t("adjustment.details")}</h3>
            <Badge tone="amber">Supervisor</Badge>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <Field label="Direction">
                <select name="direction">
                  <option value="In">{t("operation.in")}</option>
                  <option value="Out">{t("operation.out")}</option>
                </select>
              </Field>
              <Field label="Warehouse">
                <input value="SYD" readOnly />
              </Field>
              <Field label="Item type">
                <select name="itemType" defaultValue="Material">
                  <option value="Material">{t("status.Material")}</option>
                  <option value="Product">{t("status.Product")}</option>
                </select>
              </Field>
              <Field label="Location">
                <select name="location" defaultValue="R1-4-3-L">
                  {state.locations
                    .filter((row) => row.warehouseCode === "SYD")
                    .map((row) => (
                      <option key={row.id}>{row.code}</option>
                    ))}
                </select>
              </Field>
              <Field label="SKU" help="May be omitted only for controlled unmonitored Material.">
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
              <Field label="Condition">
                <select name="condition" defaultValue="Material">
                  <option value="Material">{t("status.Material")}</option>
                  <option value="New">{t("status.New")}</option>
                  <option value="Repair_Good">{t("status.Repair_Good")}</option>
                  <option value="Repair">{t("status.Repair")}</option>
                  <option value="Scrap">{t("status.Scrap")}</option>
                </select>
              </Field>
              <Field label="Quantity">
                <input name="qty" type="number" min="1" defaultValue="12" />
              </Field>
              <Field label="Reason">
                <select name="reason" defaultValue={noSku ? "Unmonitored material" : "Count correction"}>
                  <option value="Count correction">{t("reason.countCorrection")}</option>
                  <option value="Repair completion">{t("reason.repairCompletion")}</option>
                  <option value="Damage write-off">{t("reason.damageWriteOff")}</option>
                  <option value="Unmonitored material">{t("reason.unmonitoredMaterial")}</option>
                </select>
              </Field>
              <Field label="Remark" full>
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
                <strong>Never overwrite a balance</strong>
                <p>Every correction creates an Adjustment_In or Adjustment_Out ledger entry.</p>
              </div>
              <div className="timeline-item">
                <strong>Product requires SKU</strong>
                <p>Blank SKU is permitted only for unmonitored material with the exact controlled reason.</p>
              </div>
              <div className="timeline-item">
                <strong>Move is separate</strong>
                <p>Use Move when stock has a known source and destination.</p>
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
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
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
  const selected = results[0];
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
          <input ref={searchRef} autoFocus autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="SN, SH, Pickup Code or SKU → Enter" />
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
              <Summary label="Model" value={selected.model} />
              <Summary label="Warehouse" value={selected.warehouseCode ?? "Outside WMS inventory"} />
              <Summary label="Location" value={selected.locationCode ?? "—"} />
              <Summary label="Condition" value={<StatusBadge code={selected.condition} />} />
              <Summary label="Related SH" value={selected.relatedShNo ?? "—"} mono />
              <Summary label="Related transfer" value={selected.relatedTransferNo ?? "—"} mono />
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
  commit,
}: {
  state: WmsState;
  commit: (command: WmsCommand, success: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  return (
    <>
      <PageHead title={t("title.transfers")} subtitle={t("page.transferSubtitle")} />
      <div className="notice">{t("transfer.notice")}</div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("table.transfer")}</th>
                <th>{t("table.route")}</th>
                <th>SKU / {t("common.model")}</th>
                <th className="number">Qty</th>
                <th>{t("table.serials")}</th>
                <th>{t("common.status")}</th>
                <th>{t("table.action")}</th>
              </tr>
            </thead>
            <tbody>
              {state.transfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="mono strong">{transfer.transferNo}</td>
                  <td>
                    <span className="strong">{transfer.sourceWarehouse}</span> →{" "}
                    <span className="strong">{transfer.destinationWarehouse}</span>
                    <div className="subtle">
                      {transfer.sourceLocation} → {transfer.destinationLocation ?? "destination pending"}
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
                            `${transfer.transferNo} dispatched; serial now In Transit.`,
                          );
                        }}
                      >
                        {t("action.transferOut")}
                      </Button>
                    )}
                    {transfer.status === "In_Transit" && (
                      <Button
                        className="primary small"
                        onClick={() =>
                          commit(
                            { type: "receiveTransfer", transferId: transfer.id, destinationLocation: "M1-1-1-L" },
                            `${transfer.transferNo} received into MEL at M1-1-1-L.`,
                          )
                        }
                      >
                        {t("action.transferIn")}
                      </Button>
                    )}
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
          <Badge tone="blue">Counting</Badge>
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
                        placeholder="Count"
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
  const rows = state.audit.filter((row) =>
    `${row.operation} ${row.actor} ${row.businessReference ?? ""} ${row.remark}`.toLowerCase().includes(query.toLowerCase()),
  );
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
      </div>
    </>
  );
}

function AuditRow({ row }: { row: AuditEntry }) {
  const { locale } = useI18n();
  return (
    <tr>
      <td>{formatWarehouseDateTime(row.at, locale, "Australia/Sydney")}</td>
      <td className="strong">{row.operation}</td>
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
            <div className="metric-label">{severity} severity</div>
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
                <th>Entity reference</th>
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
                  <th>Category</th>
                  <th>SN tracking</th>
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
                    <td>{row.serialTrackingRequired ? "Required" : "Not required"}</td>
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
                  <th>Zone</th>
                  <th>Service zone</th>
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
                  <th>Code</th>
                  <th>Name</th>
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Physical warehouse</th>
                  <th>ERP warehouse</th>
                  <th>Mapped condition</th>
                  <th>Allocation policy</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>SYD</td>
                  <td>悉尼物料仓</td>
                  <td>
                    <StatusBadge code="New" />
                  </td>
                  <td>Normal allocatable product inventory</td>
                </tr>
                <tr>
                  <td>SYD</td>
                  <td>悉尼良品仓</td>
                  <td>
                    <StatusBadge code="Repair_Good" />
                  </td>
                  <td>Repair-good allocation only</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function LabelView({ order, state }: { order: OutboundOrder; state: WmsState }) {
  const { t } = useI18n();
  const batch = state.pickupBatches?.find((row) => row.code === order.pickupCode);
  const shNos = batch?.shNos ?? [order.shNo];
  const lines =
    batch?.lines ??
    order.lines.map((line) => ({
      sku: line.sku,
      model: line.model,
      erpWarehouse: line.erpWarehouse ?? order.erpWarehouse,
      qty: line.requiredQty,
    }));
  return (
    <div className="label-page">
      <div className="print-controls">
        <Link className="btn" href={`/outbound/${order.id}`}>
          <ArrowLeft /> Back to order
        </Link>
        <Button className="primary" onClick={() => window.print()}>
          <Printer /> {t("action.printA4")}
        </Button>
      </div>
      <article className="label-sheet">
        <div className="label-brand">FOXESS · WAREHOUSE OPERATIONS</div>
        <div>
          <section className="label-main">
            <div className="label-kicker">Service outbound · SH</div>
            <div className="label-sh">{shNos.join(" · ")}</div>
            <div className="label-pickup">
              <span>Pickup</span>
              <strong>{order.pickupCode ?? "PENDING"}</strong>
            </div>
          </section>
          <section className="label-details">
            {lines.map((line) => (
              <div className="label-detail" key={`${line.sku}:${line.model}:${line.erpWarehouse}`}>
                <span>{line.sku} · {line.model}</span>
                <strong>{line.erpWarehouse} · Qty {line.qty}</strong>
              </div>
            ))}
          </section>
        </div>
        <div className="label-brand">BATCH LABEL · 1 LABEL / 1 A4 PAGE</div>
      </article>
    </div>
  );
}

// Exported for focused UI tests and future server/client separation.
export type { InventoryBalance, SerialNumber };
