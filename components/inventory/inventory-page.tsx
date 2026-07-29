"use client";

import { Plus, ScanLine, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { WarehouseCode, WmsState } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { Badge, StatusBadge } from "@/components/shared/status-badge";
import { cn, EmptyState, PageHeader } from "@/components/shared/ui";

export function InventoryPage({ state, warehouse }: { state: WmsState; warehouse: WarehouseCode }) {
  const { t } = useI18n();
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
      <PageHeader
        title={t("title.inventory")}
        subtitle={t("inventory.subtitle")}
        actions={<><Link className="btn" href="/sn-search"><ScanLine />{t("nav.snSearch")}</Link><Link className="btn primary" href="/receiving"><Plus />{t("nav.receiving")}</Link></>}
      />
      <div className="notice">{t("inventory.formula")}</div>
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap"><Search /><input placeholder={t("inventory.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
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
      </div>
    </>
  );
}
