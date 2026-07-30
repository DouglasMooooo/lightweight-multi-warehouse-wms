"use client";

import { Plus, ScanLine, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { InventoryBalance, WarehouseCode } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { Badge, StatusBadge } from "@/components/shared/status-badge";
import { Button, cn, EmptyState, PageHeader } from "@/components/shared/ui";

export function InventoryPage({ warehouse }: { warehouse: WarehouseCode }) {
  const { t } = useI18n();
  const initialParams = () => typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(() => initialParams().get("location") || initialParams().get("sku") || "");
  const [locationFilter, setLocationFilter] = useState(() => initialParams().get("location") || "");
  const [condition, setCondition] = useState("All");
  const [showRepair, setShowRepair] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: InventoryBalance[]; total: number; totalPages: number }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page), pageSize: "50", warehouse,
        positiveOnly: String(!showZero),
      });
      if (query) params.set(locationFilter ? "location" : "sku", query);
      if (condition !== "All") params.set("condition", condition);
      if (!showMaterial) params.set("itemType", "Product");
      if (!showRepair && condition === "All") params.set("excludeRepair", "true");
      fetch(`/api/inventory?${params}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(t("common.loadFailed"));
          const body = await response.json();
          setData(body);
        })
        .catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : t("common.loadFailed")); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [condition, locationFilter, page, query, showMaterial, showRepair, showZero, t, warehouse]);
  const rows = data?.rows ?? [];
  return (
    <>
      <PageHeader
        title={t("title.inventory")}
        subtitle={t("inventory.subtitle")}
        actions={<><Link className="btn" href="/sn-search"><ScanLine />{t("nav.snSearch")}</Link><Link className="btn primary" href="/receiving"><Plus />{t("nav.receiving")}</Link></>}
      />
      <div className="notice">{t("inventory.formula")}</div>
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap"><Search /><input placeholder={t("inventory.search")} value={query} onChange={(event) => { setQuery(event.target.value); setLocationFilter(""); }} /></div>
          <select aria-label={t("common.condition")} value={condition} onChange={(event) => setCondition(event.target.value)}>
            <option value="All">{t("common.all")}</option>
            <option value="New">{t("status.New")}</option>
            <option value="Repair_Good">{t("status.Repair_Good")}</option>
            <option value="Repair">{t("status.Repair")}</option>
            <option value="Material">{t("status.Material")}</option>
          </select>
          <label className="toggle"><input type="checkbox" checked={showMaterial} onChange={(event) => setShowMaterial(event.target.checked)} />{t("inventory.material")}</label>
          <label className="toggle"><input type="checkbox" checked={showRepair} onChange={(event) => setShowRepair(event.target.checked)} />{t("inventory.repair")}</label>
          <label className="toggle"><input type="checkbox" checked={showZero} onChange={(event) => setShowZero(event.target.checked)} />{t("inventory.zero")}</label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>{t("common.warehouse")}</th><th>{t("common.location")}</th><th>{t("table.container")}</th><th>SKU</th>
              <th>{t("common.model")}</th><th>{t("table.type")}</th><th>{t("common.condition")}</th>
              <th className="number">{t("common.physical")}</th><th className="number">{t("common.frozen")}</th>
              <th className="number">{t("common.available")}</th><th className="number">{t("common.inTransit")}</th>
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr className={cn(row.availableQty < 0 && "anomaly", row.frozenQty > 0 && "frozen-row")} key={row.id}>
                <td><Badge tone="blue">{row.warehouseCode}</Badge></td><td className="mono strong">{row.locationCode}</td>
                <td>{row.containerCode ? <span className="mono">{row.containerCode}</span> : "—"}</td>
                <td className="mono">{row.sku ?? "NO-SKU"}</td><td>{row.model}</td><td>{t(`status.${row.itemType}`)}</td>
                <td><StatusBadge code={row.condition} /></td><td className="number strong">{row.physicalQty}</td>
                <td className="number">{row.frozenQty}</td><td className="number strong">{row.availableQty}</td><td className="number">{row.inTransitQty}</td>
              </tr>
            ))}</tbody>
          </table>
          {!rows.length && <EmptyState label={t("inventory.empty")} />}
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="toolbar">
          <span className="subtle">{t("common.rowsPage", { rows: data?.total ?? 0, page, pages: data?.totalPages ?? 1 })}</span>
          <Button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous")}</Button>
          <Button type="button" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button>
        </div>
      </div>
    </>
  );
}
