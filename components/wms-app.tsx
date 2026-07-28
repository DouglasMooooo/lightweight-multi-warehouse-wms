"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  MapPin,
  Menu,
  Move,
  PackageCheck,
  PackageOpen,
  Plus,
  Printer,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
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

const nav = [
  {
    label: "Operations",
    items: [
      ["/dashboard", "Dashboard", LayoutDashboard],
      ["/inventory", "Current Stock", Boxes],
      ["/outbound", "Outbound", PackageCheck],
      ["/receiving", "Receiving", PackageOpen],
      ["/repair", "Faulty Returns", Wrench],
      ["/move", "Move Stock", Move],
      ["/adjustment", "Adjust Stock", SlidersHorizontal],
      ["/sn-search", "SN Search", ScanLine],
      ["/transfers", "Transfers", Truck],
      ["/stocktake", "Stocktake", ClipboardCheck],
    ],
  },
  {
    label: "Control",
    items: [
      ["/exceptions", "Exceptions", ShieldAlert],
      ["/audit", "Audit Log", FileClock],
    ],
  },
  {
    label: "Administration",
    items: [
      ["/admin/products", "Products", Boxes],
      ["/admin/locations", "Locations", MapPin],
      ["/admin/warehouses", "Warehouses", Warehouse],
      ["/admin/erp-mapping", "ERP Mapping", Settings],
    ],
  },
] as const;

const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const routeTitles: Record<string, string> = {
  dashboard: "Operations Dashboard",
  inventory: "Current Stock",
  outbound: "Outbound Orders",
  receiving: "Receive Stock",
  repair: "Faulty Unit Receiving",
  move: "Move Stock",
  adjustment: "Stock Adjustment",
  "sn-search": "Serial Number Search",
  transfers: "Inter-Warehouse Transfers",
  stocktake: "Stocktake",
  audit: "Audit Log",
  exceptions: "Exceptions",
  admin: "Master Data",
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("outbound") || normalized.includes("received") || normalized === "synced")
    return "teal";
  if (normalized.includes("exception") || normalized.includes("failed") || normalized.includes("critical"))
    return "red";
  if (normalized.includes("prepared") || normalized.includes("pickup") || normalized.includes("transit"))
    return "amber";
  return "blue";
}

function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={cn("badge dot", tone ?? statusTone(String(children)))}>{children}</span>;
}

function Button({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button className={cn("btn", className)} {...props}>
      {children}
    </button>
  );
}

function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="empty">
      <PackageOpen />
      <div>{label}</div>
    </div>
  );
}

export function WmsApp({ path }: { path: string[] }) {
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
        const body = (await response.json()) as WmsState | { error: string };
        if (!response.ok) throw new Error("error" in body ? body.error : "Unable to load warehouse data.");
        if (active) setState(body as WmsState);
      })
      .catch((error: unknown) => {
        if (active) setToast({ message: error instanceof Error ? error.message : "Unable to load warehouse data.", error: true });
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

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
      const body = (await response.json()) as WmsState | { error: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Operation failed.");
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

  if (!ready || !state) return <div className="empty">Loading database-backed warehouse data…</div>;

  if (section === "outbound" && path[2] === "label") {
    const order = state.outboundOrders.find((row) => row.id === path[1]);
    return order ? <LabelView order={order} state={state} /> : <div className="empty">Order not found.</div>;
  }

  const title = routeTitles[section] ?? "Warehouse Operations";

  return (
    <div className="app-shell">
      <aside className={cn("sidebar", sidebarOpen && "open")}>
        <div className="brand">
          <div className="brand-mark">FX</div>
          <div>
            <strong>Warehouse Ops</strong>
            <span>Multi-warehouse Preview · v0.1</span>
          </div>
          {sidebarOpen && (
            <Button className="ghost mobile-menu" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
              <X />
            </Button>
          )}
        </div>
        {nav.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map(([href, label, Icon]) => (
              <Link
                className={cn("nav-link", `/${path.join("/")}`.startsWith(href) && "active")}
                href={href}
                key={href}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon />
                {label}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">DS</div>
            <div>
              <strong>Demo Supervisor</strong>
              <span>Warehouse_Supervisor</span>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <Button className="ghost mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <h1>{title}</h1>
            <Badge tone="teal">Demo mode</Badge>
          </div>
          <div className="topbar-actions">
            <select
              className="warehouse-select"
              aria-label="Active warehouse"
              value={warehouse}
              onChange={(event) => setWarehouse(event.target.value as typeof warehouse)}
            >
              {state.warehouses.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} · {row.name}
                </option>
              ))}
            </select>
            {demoMode && (
              <Button className="ghost" onClick={resetDemo} title="Reset demo data" aria-label="Reset demo data">
                <RotateCcw />
              </Button>
            )}
          </div>
        </header>
        <div className="content">
          {section === "dashboard" && <Dashboard state={state} warehouse={warehouse} />}
          {section === "inventory" && <InventoryView state={state} warehouse={warehouse} />}
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
          {section === "admin" && <AdminView state={state} resource={path[1] ?? "products"} />}
        </div>
      </main>
      {toast && (
        <div className={cn("toast", toast.error && "error")}>
          {toast.error ? <AlertTriangle /> : <Check />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

function Dashboard({ state, warehouse }: { state: WmsState; warehouse: "SYD" | "MEL" | "BNE" }) {
  const rows = state.inventory.filter((row) => row.warehouseCode === warehouse);
  const availableProduct = rows
    .filter((row) => row.itemType === "Product" && ["New", "Repair_Good"].includes(row.condition))
    .reduce((sum, row) => sum + row.availableQty, 0);
  const frozen = rows.reduce((sum, row) => sum + row.frozenQty, 0);
  const prepared = state.outboundOrders.filter((row) =>
    ["Prepared", "Ready_for_Pickup", "Partially_Prepared"].includes(row.status),
  ).length;
  const inTransit = state.transfers.filter((row) => row.status === "In_Transit").length;
  const locations = state.locations
    .filter((row) => row.warehouseCode === warehouse)
    .slice(0, 12)
    .map((location) => ({
      ...location,
      stock: rows.filter((row) => row.locationCode === location.code && row.physicalQty > 0),
    }));

  const metrics = [
    ["Available Product Inventory", availableProduct, "New + Repair Good"],
    ["Frozen Inventory", frozen, "Prepared reservations"],
    ["Needs Allocation", state.dashboardTasks?.needsAllocation ?? 0, "Normal workflow queue"],
    ["Prepared", state.dashboardTasks?.prepared ?? prepared, "Physical unchanged; stock frozen"],
    ["Ready for Pickup", state.dashboardTasks?.readyForPickup ?? 0, "Pickup code issued"],
    ["Outbound Today", state.dashboardTasks?.outboundToday ?? 0, "Uses actual outboundAt"],
    ["Repair Queue", state.dashboardTasks?.repairQueue ?? 0, "Received / pending / in repair"],
    ["Repair Putaway", state.dashboardTasks?.repairCompletedAwaitingPutaway ?? 0, "Completed awaiting stock return"],
    ["Transfers In Transit", state.dashboardTasks?.transfersInTransit ?? inTransit, "Between warehouses"],
    ["Reconciliation Issues", state.dashboardTasks?.reconciliationIssues ?? 0, "Spreadsheet shadow comparison"],
    ["ERP Sync Failures", state.dashboardTasks?.erpSyncFailures ?? 0, "Physical operations remain confirmed"],
  ];
  const actions = [
    ["/outbound", "Prepare orders", "Allocate and freeze stock", PackageCheck],
    ["/receiving", "Receive stock", "Inbound and transfer receipt", PackageOpen],
    ["/repair", "Receive faulty unit", "Scan SN and query ERP", Wrench],
    ["/move", "Move stock", "Atomic location transfer", Move],
    ["/adjustment", "Adjust stock", "Supervisor controlled", SlidersHorizontal],
    ["/sn-search", "Search SN", "Trace complete history", ScanLine],
    ["/stocktake", "Stocktake", "Count and reconcile", ClipboardCheck],
    ["/exceptions", "Exceptions", "Investigate operational risks", ShieldAlert],
  ] as const;

  return (
    <>
      <PageHead
        title={`${warehouse} warehouse at a glance`}
        subtitle="Operational inventory, task queues and exceptions. Financial measures remain in ERP."
        actions={
          <Link className="btn primary" href="/outbound">
            <Plus /> Prepare order
          </Link>
        }
      />
      <div className="grid metrics">
        {metrics.map(([label, value, meta], index) => (
          <div className={cn("metric", index >= 9 && Number(value) > 0 && "alert")} key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
            <div className="metric-meta">{meta}</div>
          </div>
        ))}
      </div>
      <div className="grid dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <h3>Warehouse tasks</h3>
            <span className="subtle">Scanner-friendly shortcuts</span>
          </div>
          <div className="panel-body">
            <div className="grid quick-actions">
              {actions.map(([href, label, detail, Icon]) => (
                <Link className="quick-action" href={href} key={href}>
                  <Icon />
                  <div>
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Recent activity</h3>
            <Link className="subtle" href="/audit">
              Full audit
            </Link>
          </div>
          <div className="panel-body timeline">
            {state.audit.slice(0, 5).map((row) => (
              <div className="timeline-item" key={row.id}>
                <strong>{row.operation}</strong>
                <p>
                  {row.businessReference ?? row.entityType} · {formatTime(row.at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h3>Location pulse</h3>
          <span className="subtle">Visual summary only · inventory remains the source of truth</span>
        </div>
        <div className="panel-body">
          <div className="layout-grid">
            {locations.map((location) => {
              const total = location.stock.reduce((sum, row) => sum + row.physicalQty, 0);
              return (
                <div
                  className={cn("location-tile", total > 0 && "occupied", location.serviceZone && "service")}
                  key={location.id}
                >
                  <strong>{location.code}</strong>
                  <span>{total > 0 ? `${location.stock.length} SKU · ${total} units` : "Empty"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function InventoryView({ state, warehouse }: { state: WmsState; warehouse: "SYD" | "MEL" | "BNE" }) {
  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState("All");
  const [showRepair, setShowRepair] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const rows = state.inventory.filter((row) => {
    const haystack = `${row.locationCode} ${row.containerCode ?? ""} ${row.sku ?? ""} ${row.model}`.toLowerCase();
    return (
      row.warehouseCode === warehouse &&
      haystack.includes(query.toLowerCase()) &&
      (condition === "All" || row.condition === condition) &&
      (showZero || row.physicalQty !== 0) &&
      (showRepair || row.condition !== "Repair") &&
      (showMaterial || row.itemType !== "Material")
    );
  });
  return (
    <>
      <PageHead
        title="Current stock"
        subtitle="Database-shaped balances by warehouse, physical location, product, optional container and condition."
        actions={
          <>
            <Link className="btn" href="/sn-search">
              <ScanLine /> Search SN
            </Link>
            <Link className="btn primary" href="/receiving">
              <Plus /> Receive stock
            </Link>
          </>
        }
      />
      <div className="notice">
        Available Qty = Physical Qty − Frozen Qty. Prepared inventory remains physically present and visible.
      </div>
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              placeholder="Search SKU, model, location or container"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select value={condition} onChange={(event) => setCondition(event.target.value)}>
            <option>All</option>
            <option>New</option>
            <option>Repair_Good</option>
            <option>Repair</option>
            <option>Material</option>
          </select>
          <label className="toggle">
            <input type="checkbox" checked={showMaterial} onChange={(event) => setShowMaterial(event.target.checked)} />
            Material
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showRepair} onChange={(event) => setShowRepair(event.target.checked)} />
            Repair
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showZero} onChange={(event) => setShowZero(event.target.checked)} />
            Zero stock
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Location</th>
                <th>Container</th>
                <th>SKU</th>
                <th>Model</th>
                <th>Type</th>
                <th>Condition</th>
                <th className="number">Physical</th>
                <th className="number">Frozen</th>
                <th className="number">Available</th>
                <th className="number">In Transit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className={cn(row.availableQty < 0 && "anomaly", row.frozenQty > 0 && "frozen-row")} key={row.id}>
                  <td>
                    <Badge tone="blue">{row.warehouseCode}</Badge>
                  </td>
                  <td className="strong">{row.locationCode}</td>
                  <td>{row.containerCode ? <span className="mono">{row.containerCode}</span> : "—"}</td>
                  <td className="mono">{row.sku ?? "NO-SKU"}</td>
                  <td>{row.model}</td>
                  <td>{row.itemType}</td>
                  <td>
                    <Badge>{row.condition}</Badge>
                  </td>
                  <td className="number strong">{row.physicalQty}</td>
                  <td className="number">{row.frozenQty}</td>
                  <td className="number strong">{row.availableQty}</td>
                  <td className="number">{row.inTransitQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty label="No inventory matches these filters." />}
        </div>
      </div>
    </>
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
  const [query, setQuery] = useState("");
  const [importSh, setImportSh] = useState("");
  const orders = state.outboundOrders.filter(
    (order) =>
      order.warehouseCode === warehouse &&
      `${order.shNo} ${order.pickupCode ?? ""} ${order.lines.map((line) => line.sku).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHead
        title="Outbound orders"
        subtitle="Replacement fulfilment from ERP review through allocation, preparation, SN scan and dispatch."
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
              <Plus /> Import ERP order
            </Button>
          </form>
        }
      />
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              placeholder="Search SH, pickup code or SKU"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Badge tone="amber">{orders.filter((row) => row.status !== "Outbound").length} active</Badge>
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
                <Badge>{order.status.replaceAll("_", " ")}</Badge>
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
                Open <ArrowRight />
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
  const order = state.outboundOrders.find((row) => row.id === orderId);
  const [scan, setScan] = useState("");
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
    if (!scan.trim()) return;
    const accepted = await commit(
      { type: "scanOutboundSerial", orderId: activeOrderId, lineId: activeLineId, serialNumber: scan.trim().toUpperCase() },
      `Serial ${scan.trim().toUpperCase()} allocated to ${activeOrderShNo}.`,
    );
    if (accepted) setScan("");
  }

  return (
    <>
      <PageHead
        title={order.shNo}
        subtitle="Replacement Unit Information is the outbound source. Faulty Unit Information is never used as the replacement SKU."
        actions={
          <>
            <Link className="btn" href="/outbound">
              <ArrowLeft /> Orders
            </Link>
            <Link className="btn" href={`/outbound/${order.id}/label`}>
              <Printer /> Print label
            </Link>
            <Button
              className="primary"
              disabled={!canDispatch}
              onClick={() =>
                commit({ type: "dispatchOutbound", orderId: order.id }, `${order.shNo} dispatched; ERP sync queued.`)
              }
            >
              <Truck /> Confirm dispatch
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
              <PackageCheck /> Confirm prepared
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
              <h3>Requested line</h3>
              <Badge>{order.status.replaceAll("_", " ")}</Badge>
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
                <h3>Eligible inventory</h3>
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
                {!candidates.length && <Empty label="No eligible stock is available." />}
              </div>
            </div>
          )}
          {line.preparedQty > 0 && order.status !== "Outbound" && serialRequired && (
            <div className="scanner">
              <div className="scanner-title">
                <ScanLine /> Scan serial numbers
              </div>
              <form className="scanner-row" onSubmit={scanSerial}>
                <input
                  autoFocus
                  placeholder="Scan SN and press Enter"
                  value={scan}
                  onChange={(event) => setScan(event.target.value)}
                />
                <Button className="primary" type="submit">
                  Add SN
                </Button>
              </form>
              <div className="serial-chips">
                {line.scannedSerials.map((serial) => (
                  <span className="serial-chip" key={serial}>
                    {serial}
                  </span>
                ))}
                {!line.scannedSerials.length && (
                  <span className="subtle">Try EQ48S260700001 and EQ48S260700002.</span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid">
          <div className="panel">
            <div className="panel-head">
              <h3>Order summary</h3>
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
              Dispatch is blocked until all requested quantities are prepared and all required serial numbers are scanned.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Summary({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
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
  const [tab, setTab] = useState("Standard Inbound");
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
      <PageHead title="Receive stock" subtitle="Standard inbound, faulty returns and transfer receipts use distinct workflows." />
      <div className="panel">
        <div className="tabs">
          {["Standard Inbound", "Faulty Return", "Transfer Receive"].map((label) => (
            <button className={cn("tab", tab === label && "active")} onClick={() => setTab(label)} key={label}>
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
                  <option>New</option>
                  <option>Repair_Good</option>
                  <option>Material</option>
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
                <PackageOpen /> Confirm receipt
              </Button>
            </div>
          </form>
        )}
        {tab === "Faulty Return" && (
          <div className="panel-body">
            <div className="notice">Faulty receipts use ERP SN lookup and default to the Sydney repair location.</div>
            <Link className="btn primary" href="/repair">
              <Wrench /> Open faulty receiving
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
  return (
    <div className={cn("field", full && "full")}>
      <label>{label}</label>
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
  const [serial, setSerial] = useState("60E5M4805C3F242");
  const [record, setRecord] = useState<ERPSerialLookup | null>(null);
  const [searched, setSearched] = useState(false);
  async function lookup(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/wms/faulty-lookup?serialNumber=${encodeURIComponent(serial)}`, { cache: "no-store" });
    const result = (await response.json()) as ERPSerialLookup | { error: string };
    setRecord(response.ok ? (result as ERPSerialLookup) : null);
    setSearched(true);
  }
  return (
    <>
      <PageHead
        title="Faulty unit receiving"
        subtitle="Scan the returned unit. Mock ERP supplies related SH and replacement context without duplicate data entry."
      />
      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <h3>1 · Scan returned unit</h3>
          </div>
          <div className="panel-body">
            <form className="scanner" onSubmit={lookup}>
              <div className="scanner-title">
                <ScanLine /> Faulty serial number
              </div>
              <div className="scanner-row">
                <input
                  autoFocus
                  value={serial}
                  onChange={(event) => setSerial(event.target.value.toUpperCase())}
                  placeholder="Scan SN and press Enter"
                />
                <Button className="primary" type="submit">
                  Query ERP
                </Button>
              </div>
            </form>
            {searched && !record && (
              <div className="notice error" style={{ marginTop: 14 }}>
                ERP record not found. A Manual Review exception is required before controlled receipt.
              </div>
            )}
            {record && (
              <div style={{ marginTop: 16 }}>
                <div className="notice">
                  <strong>ERP match found.</strong> Review the supplied details, then receive to REPAIR-01.
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
                    <PackageOpen /> Confirm faulty receipt
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Repair receiving policy</h3>
          </div>
          <div className="panel-body summary-list">
            <Summary label="Default warehouse" value="SYD" />
            <Summary label="Default location" value="REPAIR-01" />
            <Summary label="Inventory condition" value={<Badge>Repair</Badge>} />
            <Summary label="SN status" value={<Badge>Repair</Badge>} />
            <Summary label="Transaction" value="Return_to_Repair" />
            <Summary label="Faulty receipts recorded" value={state.faultyReceivedCount} />
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h3>Repair lifecycle queue</h3>
          <span className="subtle">Same known SN is preserved through Repair → Repair_Good</span>
        </div>
        <div className="panel-body grid">
          {(state.repairJobs ?? []).map((job) => (
            <div className="allocation-card" key={job.id}>
              <div className="strong mono">{job.serialNumber ?? "Unknown legacy SN"}</div>
              <div className="subtle">{job.model} · {job.status} · {job.currentLocation}</div>
              <Button
                className="primary"
                disabled={!["Received", "Pending_Repair", "In_Repair"].includes(job.status)}
                onClick={() =>
                  commit(
                    {
                      type: "completeRepair",
                      repairJobId: job.id,
                      targetLocationCode: "FLEX-01",
                      outcome: "Repair_Good",
                      remark: "Technician repair completed; returned to serviceable stock.",
                    },
                    `${job.serialNumber ?? job.sku} completed as Repair_Good at FLEX-01.`,
                  )
                }
              >
                <Wrench /> Complete Repair
              </Button>
            </div>
          ))}
          {!state.repairJobs?.length && <Empty label="No active repair jobs." />}
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
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
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
      <PageHead title="Move stock" subtitle="One atomic business transaction moves stock between locations in the same warehouse." />
      <div className="notice warn">
        Cross-warehouse movement is blocked here. Use Transfer for SYD → MEL or any other warehouse pair.
      </div>
      <div className="split">
        <form className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h3>Move details</h3>
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
                  <option>Material</option>
                  <option>New</option>
                  <option>Repair_Good</option>
                  <option>Repair</option>
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
                <Move /> Confirm move
              </Button>
            </div>
          </div>
        </form>
        <div className="panel">
          <div className="panel-head">
            <h3>Source preview</h3>
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
      <PageHead title="Stock adjustment" subtitle="Supervisor-controlled correction with explicit reason and immutable audit history." />
      <div className="split">
        <form className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h3>Adjustment details</h3>
            <Badge tone="amber">Supervisor</Badge>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <Field label="Direction">
                <select name="direction">
                  <option>In</option>
                  <option>Out</option>
                </select>
              </Field>
              <Field label="Warehouse">
                <input value="SYD" readOnly />
              </Field>
              <Field label="Item type">
                <select name="itemType" defaultValue="Material">
                  <option>Material</option>
                  <option>Product</option>
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
                  <option>Material</option>
                  <option>New</option>
                  <option>Repair_Good</option>
                  <option>Repair</option>
                  <option>Scrap</option>
                </select>
              </Field>
              <Field label="Quantity">
                <input name="qty" type="number" min="1" defaultValue="12" />
              </Field>
              <Field label="Reason">
                <select name="reason" defaultValue={noSku ? "Unmonitored material" : "Count correction"}>
                  <option>Count correction</option>
                  <option>Repair completion</option>
                  <option>Damage write-off</option>
                  <option>Unmonitored material</option>
                </select>
              </Field>
              <Field label="Remark" full>
                <textarea name="remark" defaultValue="Supervisor-approved stock correction." />
              </Field>
            </div>
            <div className="form-actions">
              <Button className="primary" type="submit">
                <SlidersHorizontal /> Post adjustment
              </Button>
            </div>
          </div>
        </form>
        <div className="panel">
          <div className="panel-head">
            <h3>Adjustment guardrails</h3>
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
  const [query, setQuery] = useState("60E5M4805C3F242");
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
      <PageHead title="Serial number search" subtitle="Search SN, SH No, pickup code or SKU and inspect the traceability timeline." />
      <div className="scanner" style={{ marginBottom: 16 }}>
        <div className="scanner-title">
          <Search /> Trace inventory
        </div>
        <div className="scanner-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SN, SH, pickup code or SKU" />
          <Button className="primary">Search</Button>
        </div>
      </div>
      {selected ? (
        <div className="split">
          <div className="panel">
            <div className="panel-head">
              <h3 className="mono">{selected.serialNumber}</h3>
              <Badge>{selected.status.replaceAll("_", " ")}</Badge>
            </div>
            <div className="panel-body summary-list">
              <Summary label="SKU" value={selected.sku} mono />
              <Summary label="Model" value={selected.model} />
              <Summary label="Warehouse" value={selected.warehouseCode ?? "Outside WMS inventory"} />
              <Summary label="Location" value={selected.locationCode ?? "—"} />
              <Summary label="Condition" value={<Badge>{selected.condition}</Badge>} />
              <Summary label="Related SH" value={selected.relatedShNo ?? "—"} mono />
              <Summary label="Related transfer" value={selected.relatedTransferNo ?? "—"} mono />
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>Transaction timeline</h3>
            </div>
            <div className="panel-body timeline">
              {transactions.map((row) => (
                <div className="timeline-item" key={row.id}>
                  <strong>{row.type.replaceAll("_", " ")}</strong>
                  <p>
                    {formatDate(row.at)} · {row.fromLocation ?? "—"} → {row.toLocation ?? "—"}
                  </p>
                </div>
              ))}
              <div className="timeline-item">
                <strong>Current status · {selected.status.replaceAll("_", " ")}</strong>
                <p>{selected.locationCode ?? "No current physical location"}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel">
          <Empty label="No matching serial trace was found." />
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
  return (
    <>
      <PageHead title="Inter-warehouse transfers" subtitle="Transfer Out creates In Transit inventory; Transfer In receives it at the destination." />
      <div className="notice">Normal Move cannot cross warehouses. Transfer serials are relational records, never comma-separated text.</div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transfer</th>
                <th>Route</th>
                <th>SKU / Model</th>
                <th className="number">Qty</th>
                <th>Serials</th>
                <th>Status</th>
                <th>Action</th>
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
                    <Badge>{transfer.status.replaceAll("_", " ")}</Badge>
                  </td>
                  <td>
                    {transfer.status === "Draft" && (
                      <Button
                        className="primary small"
                        onClick={() =>
                          commit(
                            { type: "dispatchTransfer", transferId: transfer.id },
                            `${transfer.transferNo} dispatched; serial now In Transit.`,
                          )
                        }
                      >
                        Transfer Out
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
                        Transfer In
                      </Button>
                    )}
                    {transfer.status === "Received" && <span className="subtle">Complete</span>}
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
  const rows = state.inventory.filter((row) => row.warehouseCode === warehouse).slice(0, 6);
  const [counts, setCounts] = useState<Record<string, string>>({});
  return (
    <>
      <PageHead
        title="Stocktake"
        subtitle="Preview count sheet keeps Physical, Frozen and Available visible while operators record actual counts."
        actions={
          <Button className="primary">
            <Plus /> Create stocktake
          </Button>
        }
      />
      <div className="notice warn">Preview architecture only: posting variances as supervisor-approved adjustments is a next-sprint item.</div>
      <div className="panel">
        <div className="panel-head">
          <h3>ST-{warehouse}-0008 · Cycle count</h3>
          <Badge tone="blue">Counting</Badge>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>SKU</th>
                <th>Condition</th>
                <th className="number">Physical</th>
                <th className="number">Frozen</th>
                <th className="number">Available</th>
                <th>Counted</th>
                <th className="number">Variance</th>
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
                      <Badge>{row.condition}</Badge>
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
  const [query, setQuery] = useState("");
  const rows = state.audit.filter((row) =>
    `${row.operation} ${row.actor} ${row.businessReference ?? ""} ${row.remark}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHead title="Audit log" subtitle="Every important warehouse state change records actor, timestamp, entity and business reference." />
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input placeholder="Filter operation, actor or reference" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operation</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Business reference</th>
                <th>Remark</th>
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
  return (
    <tr>
      <td>{formatDate(row.at)}</td>
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
  return (
    <>
      <PageHead title="Operational exceptions" subtitle="Visible exception queues prevent ERP or inventory problems from disappearing silently." />
      <div className="grid metrics" style={{ gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", marginBottom: 16 }}>
        {(["Critical", "High", "Medium", "Low"] as const).map((severity) => (
          <div className={cn("metric", severity === "Critical" && "alert")} key={severity}>
            <div className="metric-label">{severity} severity</div>
            <div className="metric-value">
              {state.exceptions.filter((row) => row.severity === severity && row.status !== "Resolved").length}
            </div>
            <div className="metric-meta">Open or investigating</div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>Entity reference</th>
                <th>Message</th>
                <th>Status</th>
                <th>Created</th>
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
                    <Badge>{row.status}</Badge>
                  </td>
                  <td>{formatDate(row.createdAt)}</td>
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
  const title = resource === "erp-mapping" ? "ERP warehouse mapping" : resource[0].toUpperCase() + resource.slice(1);
  return (
    <>
      <PageHead
        title={title}
        subtitle="Preview master data is read-only in demo mode. Production writes require Admin permission and audit logging."
        actions={
          <Button className="primary">
            <Plus /> Add {resource.replace("-", " ")}
          </Button>
        }
      />
      <div className="panel">
        {resource === "products" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Model</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>SN tracking</th>
                  <th>Status</th>
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
                      <Badge tone="teal">{row.active ? "Active" : "Inactive"}</Badge>
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
                  <th>Warehouse</th>
                  <th>Location</th>
                  <th>Zone</th>
                  <th>Service zone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {state.locations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.warehouseCode}</td>
                    <td className="mono strong">{row.code}</td>
                    <td>{row.zone}</td>
                    <td>{row.serviceZone ? "Yes" : "No"}</td>
                    <td>
                      <Badge tone="teal">{row.active ? "Active" : "Inactive"}</Badge>
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
                  <th>Timezone</th>
                  <th>Locations</th>
                  <th>Status</th>
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
                      <Badge tone="teal">{row.active ? "Active" : "Inactive"}</Badge>
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
                    <Badge>New</Badge>
                  </td>
                  <td>Normal allocatable product inventory</td>
                </tr>
                <tr>
                  <td>SYD</td>
                  <td>悉尼良品仓</td>
                  <td>
                    <Badge>Repair_Good</Badge>
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
          <Printer /> Print A4 label
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

// Exported for focused UI tests and future server/client separation.
export type { InventoryBalance, SerialNumber };
