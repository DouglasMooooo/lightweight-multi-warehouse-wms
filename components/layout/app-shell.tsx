"use client";

import {
  Boxes,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  MapPin,
  Menu,
  Move,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  ScanLine,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Warehouse as WarehouseRecord, WarehouseCode } from "@/domain/types";
import type { TranslationKey } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { normalizeAppEnvironment, shouldShowEnvironmentBanner } from "@/lib/environment";
import { formatWarehouseDateTime } from "@/lib/warehouse-time";
import { Badge } from "@/components/shared/status-badge";
import { Button, cn } from "@/components/shared/ui";

const nav: Array<{
  label: TranslationKey;
  items: Array<[string, TranslationKey, typeof LayoutDashboard, string?]>;
}> = [
  {
    label: "nav.group.operations",
    items: [
      ["/dashboard", "nav.dashboard", LayoutDashboard],
      ["/inventory", "nav.inventory", Boxes],
      ["/outbound", "nav.outbound", PackageCheck],
      ["/receiving", "nav.receiving", PackageOpen],
      ["/repair", "nav.repair", Wrench],
      ["/move", "nav.move", Move],
      ["/adjustment", "nav.adjustment", SlidersHorizontal, "adjustment:create"],
      ["/sn-search", "nav.snSearch", ScanLine],
      ["/transfers", "nav.transfers", Truck],
      ["/stocktake", "nav.stocktake", ClipboardCheck, "stocktake:approve"],
    ],
  },
  {
    label: "nav.group.control",
    items: [
      ["/exceptions", "nav.exceptions", ShieldAlert],
      ["/reconciliation", "nav.reconciliation", ClipboardCheck, "stocktake:approve"],
      ["/audit", "nav.audit", FileClock],
    ],
  },
  {
    label: "nav.group.administration",
    items: [
      ["/admin/products", "nav.products", Boxes, "*"],
      ["/admin/locations", "nav.locations", MapPin, "*"],
      ["/admin/warehouses", "nav.warehouses", Warehouse, "*"],
      ["/admin/erp-mapping", "nav.erpMapping", Settings, "*"],
    ],
  },
];

export function AppShell({
  path,
  title,
  warehouses,
  warehouse,
  setWarehouse,
  sidebarOpen,
  setSidebarOpen,
  showDemoReset,
  onResetDemo,
  toast,
  currentUser,
  children,
}: {
  path: string[];
  title: string;
  warehouses: WarehouseRecord[];
  warehouse: WarehouseCode;
  setWarehouse: (warehouse: WarehouseCode) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  showDemoReset: boolean;
  onResetDemo: () => void;
  toast?: { message: string; error?: boolean } | null;
  currentUser?: { displayName: string; role: string; permissions: string[] };
  children: ReactNode;
}) {
  const { locale, setLocale, t } = useI18n();
  const selectedWarehouse = warehouses.find((row) => row.code === warehouse);
  const timeZone = selectedWarehouse?.timezone ?? "Australia/Sydney";
  const appEnv = normalizeAppEnvironment(process.env.NEXT_PUBLIC_APP_ENV);
  const can = (permission?: string) =>
    !permission || currentUser?.permissions.includes("*") || currentUser?.permissions.includes(permission);
  return (
    <div className="app-shell">
      <aside className={cn("sidebar", sidebarOpen && "open")}>
        <div className="brand">
          <div className="brand-mark">FX</div>
          <div><strong>{t("app.name")}</strong><span>{t("app.version")} · v0.1</span></div>
          {sidebarOpen && <Button className="ghost mobile-menu" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X /></Button>}
        </div>
        {nav.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{t(group.label)}</div>
            {group.items.filter(([, , , permission]) => can(permission)).map(([href, key, Icon]) => (
              <Link
                className={cn("nav-link", `/${path.join("/")}`.startsWith(href) && "active")}
                href={href}
                key={href}
                onClick={() => setSidebarOpen(false)}
              ><Icon />{t(key)}</Link>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="user-chip"><div className="avatar">{(currentUser?.displayName ?? "User").split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</div><div><strong>{currentUser?.displayName ?? "Warehouse User"}</strong><span>{currentUser?.role ?? "Viewer"}</span></div></div>
        </div>
      </aside>
      <main className="main">
        {shouldShowEnvironmentBanner(appEnv) && <div className="environment-banner">{appEnv.toUpperCase()}</div>}
        <header className="topbar">
          <div className="topbar-left">
            <Button className="ghost mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu /></Button>
            <div><h1>{title}</h1><div className="topbar-date">{formatWarehouseDateTime(new Date(), locale, timeZone)} · {timeZone}</div></div>
            {showDemoReset && <Badge tone="teal">DEMO</Badge>}
          </div>
          <div className="topbar-actions">
            <select className="warehouse-select" aria-label={t("common.warehouse")} value={warehouse} onChange={(event) => setWarehouse(event.target.value as WarehouseCode)}>
              {warehouses.map((row) => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}
            </select>
            <select className="language-select" aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value as "en" | "zh-CN")}>
              <option value="en">{t("language.en")}</option><option value="zh-CN">{t("language.zh-CN")}</option>
            </select>
            {showDemoReset && <Button className="ghost" onClick={onResetDemo} title="Reset demo data" aria-label="Reset demo data"><RotateCcw /></Button>}
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
      {toast && <div className={cn("toast", toast.error && "error")}><span aria-hidden>{toast.error ? "!" : "✓"}</span><span>{toast.message}</span></div>}
    </div>
  );
}
