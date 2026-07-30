"use client";

import {
  AlertTriangle,
  Boxes,
  Download,
  MapPin,
  PackageCheck,
  Search,
  Snowflake,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ItemType, StockCondition, WarehouseCode } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, EmptyState, PageHeader } from "@/components/shared/ui";

interface ReportRow {
  warehouseCode: string;
  productId: string;
  sku: string;
  model: string;
  itemType: ItemType;
  serialTrackingRequired: boolean;
  physicalQty: number;
  availableQty: number;
  frozenQty: number;
  inTransitQty: number;
  newQty: number;
  repairGoodQty: number;
  repairQty: number;
  scrapQty: number;
  locationCount: number;
  knownSerialCount: number;
  legacySerialGap: boolean;
  serialCoverageGap: number;
}

interface ReportData {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: {
    physicalQty: number;
    availableQty: number;
    frozenQty: number;
    inTransitQty: number;
    newQty: number;
    repairGoodQty: number;
    repairQty: number;
  };
  rows: ReportRow[];
}

interface ProductDetail {
  product: { sku: string; model: string; itemType: ItemType; serialTrackingRequired: boolean };
  warehouse: { code: string; name: string };
  totals: ReportRow;
  locations: Array<{
    locationCode: string;
    zone: string;
    physicalQty: number;
    availableQty: number;
    frozenQty: number;
    inTransitQty: number;
    newQty: number;
    repairGoodQty: number;
    repairQty: number;
    scrapQty: number;
    knownSerialCount: number;
    legacySerialGap: boolean;
  }>;
}

type SortField = "sku" | "physical" | "available" | "frozen" | "inTransit";

export function InventoryReportPage({ warehouse }: { warehouse: WarehouseCode }) {
  const { t } = useI18n();
  const initialQuery = () => typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [itemType, setItemType] = useState<ItemType | "All">("Product");
  const [condition, setCondition] = useState<StockCondition | "">("");
  const [location, setLocation] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [frozenOnly, setFrozenOnly] = useState(false);
  const [legacyOnly, setLegacyOnly] = useState(false);
  const [sort, setSort] = useState<SortField>("physical");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReportData>();
  const [error, setError] = useState("");
  const [selectedSku, setSelectedSku] = useState("");
  const [detail, setDetail] = useState<ProductDetail>();

  const params = useMemo(() => {
    const value = new URLSearchParams({
      warehouse,
      page: String(page),
      pageSize: "50",
      itemType,
      sort,
      order,
    });
    if (query.trim()) value.set("q", query.trim());
    if (condition) value.set("condition", condition);
    if (location.trim()) value.set("location", location.trim());
    if (availableOnly) value.set("availableOnly", "true");
    if (frozenOnly) value.set("frozenOnly", "true");
    if (legacyOnly) value.set("legacyOnly", "true");
    return value;
  }, [availableOnly, condition, frozenOnly, itemType, legacyOnly, location, order, page, query, sort, warehouse]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/reports/inventory?${params}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(t("common.loadFailed"));
          setData(await response.json());
          setError("");
        })
        .catch((reason) => {
          if (reason?.name !== "AbortError")
            setError(reason instanceof Error ? reason.message : t("common.loadFailed"));
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [params, t]);

  useEffect(() => {
    if (!selectedSku) return;
    const detailParams = new URLSearchParams({ warehouse });
    if (condition) detailParams.set("condition", condition);
    fetch(`/api/reports/inventory/${encodeURIComponent(selectedSku)}/locations?${detailParams}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        setDetail(await response.json());
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : t("common.loadFailed")));
  }, [condition, selectedSku, t, warehouse]);

  function changeSort(field: SortField) {
    setPage(1);
    if (sort === field) setOrder((value) => value === "desc" ? "asc" : "desc");
    else {
      setSort(field);
      setOrder(field === "sku" ? "asc" : "desc");
    }
  }

  const exportParams = new URLSearchParams(params);
  exportParams.delete("page");
  exportParams.delete("pageSize");
  exportParams.set("format", "csv");
  const summary = data?.summary;
  return (
    <>
      <PageHeader
        title={t("report.title")}
        subtitle={t("report.subtitle")}
        actions={<a className="btn" href={`/api/reports/inventory?${exportParams}`}><Download />{t("report.exportCsv")}</a>}
      />
      <div className="report-type-switch" role="group" aria-label={t("report.itemScope")}>
        {(["Product", "Material", "All"] as const).map((value) => (
          <button
            className={itemType === value ? "active" : ""}
            type="button"
            onClick={() => { setItemType(value); setPage(1); }}
            key={value}
          >
            {t(`report.scope.${value}`)}
          </button>
        ))}
      </div>
      <div className="report-summary">
        {([
          ["physical", summary?.physicalQty ?? 0, Boxes],
          ["available", summary?.availableQty ?? 0, PackageCheck],
          ["frozen", summary?.frozenQty ?? 0, Snowflake],
          ["inTransit", summary?.inTransitQty ?? 0, Truck],
          ["new", summary?.newQty ?? 0, Boxes],
          ["repairGood", summary?.repairGoodQty ?? 0, PackageCheck],
          ["repair", summary?.repairQty ?? 0, AlertTriangle],
        ] as Array<[string, number, typeof Boxes]>).map(([key, value, Icon]) => (
          <div key={String(key)}><Icon /><span>{t(`report.summary.${key}`)}</span><strong>{String(value)}</strong></div>
        ))}
      </div>
      <div className="report-controls">
        <div className="search-wrap">
          <Search />
          <input
            value={query}
            placeholder={t("report.search")}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          />
        </div>
        <input
          aria-label={t("report.locationFilter")}
          value={location}
          placeholder={t("report.locationFilter")}
          onChange={(event) => { setLocation(event.target.value); setPage(1); }}
        />
        <select
          aria-label={t("common.condition")}
          value={condition}
          onChange={(event) => { setCondition(event.target.value as StockCondition | ""); setPage(1); setDetail(undefined); }}
        >
          <option value="">{t("map.allConditions")}</option>
          {(["New", "Repair_Good", "Repair", "Scrap", "Material"] as const).map((value) => (
            <option value={value} key={value}>{t(`status.${value}`)}</option>
          ))}
        </select>
        <label><input type="checkbox" checked={availableOnly} onChange={(event) => { setAvailableOnly(event.target.checked); setPage(1); }} />{t("report.availableOnly")}</label>
        <label><input type="checkbox" checked={frozenOnly} onChange={(event) => { setFrozenOnly(event.target.checked); setPage(1); }} />{t("report.frozenOnly")}</label>
        <label><input type="checkbox" checked={legacyOnly} onChange={(event) => { setLegacyOnly(event.target.checked); setPage(1); }} />{t("report.legacyOnly")}</label>
      </div>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead><tr>
            <th>{t("report.sku")}</th>
            <th>{t("common.model")}</th>
            <th>{t("common.warehouse")}</th>
            {([
              ["physical", "report.summary.physical"],
              ["available", "report.summary.available"],
              ["frozen", "report.summary.frozen"],
            ] as Array<[SortField, string]>).map(([field, key]) => (
              <th className="number" key={field}><button type="button" onClick={() => changeSort(field)}>{t(key)}{sort === field ? order === "desc" ? " ↓" : " ↑" : ""}</button></th>
            ))}
            <th className="number">{t("report.summary.new")}</th>
            <th className="number">{t("report.summary.repairGood")}</th>
            <th className="number">{t("report.summary.repair")}</th>
            <th className="number"><button type="button" onClick={() => changeSort("inTransit")}>{t("report.summary.inTransit")}{sort === "inTransit" ? order === "desc" ? " ↓" : " ↑" : ""}</button></th>
            <th className="number">{t("report.locations")}</th>
            <th className="number">{t("report.knownSn")}</th>
            <th>{t("report.coverage")}</th>
          </tr></thead>
          <tbody>{(data?.rows ?? []).map((row) => (
            <tr key={`${row.warehouseCode}:${row.productId}`}>
              <td><button className="report-product-link mono" type="button" onClick={() => { setSelectedSku(row.sku); setDetail(undefined); }}>{row.sku}</button></td>
              <td>{row.model}</td>
              <td className="mono">{row.warehouseCode}</td>
              <td className="number strong">{row.physicalQty}</td>
              <td className="number strong available-number">{row.availableQty}</td>
              <td className="number">{row.frozenQty}</td>
              <td className="number">{row.newQty}</td>
              <td className="number">{row.repairGoodQty}</td>
              <td className="number">{row.repairQty}</td>
              <td className="number">{row.inTransitQty}</td>
              <td className="number">{row.locationCount}</td>
              <td className="number">{row.knownSerialCount}</td>
              <td>{row.legacySerialGap
                ? <StatusBadge code="Legacy_Gap" label={t("report.legacyGap")} tone="amber" />
                : <span className="subtle">{row.serialTrackingRequired
                  ? t("report.currentCoverage", { count: row.serialCoverageGap })
                  : t("report.notTracked")}</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {!data?.rows.length && <EmptyState label={t("report.empty")} />}
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="report-pagination">
        <span>{t("common.rowsPage", { rows: data?.total ?? 0, page, pages: data?.totalPages ?? 1 })}</span>
        <Button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous")}</Button>
        <Button type="button" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button>
      </div>
      {selectedSku && (
        <aside className="report-drawer" aria-label={t("report.productDetail")}>
          <div className="drawer-head">
            <div><span>{t("report.productDetail")}</span><h3 className="mono">{selectedSku}</h3></div>
            <button type="button" aria-label={t("common.cancel")} onClick={() => { setSelectedSku(""); setDetail(undefined); }}><X /></button>
          </div>
          {detail ? <div className="report-drawer-content">
            <div className="report-product-name"><strong>{detail.product.model}</strong><span>{t(`status.${detail.product.itemType}`)} · {detail.warehouse.code}</span></div>
            <div className="report-detail-metrics">
              {[
                ["physical", detail.totals.physicalQty],
                ["available", detail.totals.availableQty],
                ["frozen", detail.totals.frozenQty],
                ["inTransit", detail.totals.inTransitQty],
              ].map(([key, value]) => <div key={key}><span>{t(`report.summary.${key}`)}</span><strong>{value}</strong></div>)}
            </div>
            <h4>{t("common.condition")}</h4>
            <div className="report-condition-list">
              {[
                ["New", detail.totals.newQty],
                ["Repair_Good", detail.totals.repairGoodQty],
                ["Repair", detail.totals.repairQty],
                ["Scrap", detail.totals.scrapQty],
              ].filter(([, value]) => Number(value) > 0).map(([key, value]) => (
                <div key={key}><StatusBadge code={String(key)} /><strong>{value}</strong></div>
              ))}
            </div>
            <h4>{t("report.snCoverage")}</h4>
            <dl className="report-coverage">
              <div><dt>{t("report.knownSn")}</dt><dd>{detail.totals.knownSerialCount}</dd></div>
              <div><dt>{t("report.summary.physical")}</dt><dd>{detail.totals.physicalQty}</dd></div>
              <div><dt>{t("report.uncovered")}</dt><dd>{detail.product.serialTrackingRequired ? detail.totals.serialCoverageGap : t("report.notTracked")}</dd></div>
            </dl>
            {detail.totals.legacySerialGap && <div className="notice warning">{t("report.legacyGapHelp")}</div>}
            <h4>{t("report.locations")}</h4>
            <div className="report-location-list">
              {detail.locations.map((row) => (
                <div key={row.locationCode}>
                  <MapPin />
                  <div><strong className="mono">{row.locationCode}</strong><span>{row.zone}</span></div>
                  <dl><div><dt>{t("common.physical")}</dt><dd>{row.physicalQty}</dd></div><div><dt>{t("common.frozen")}</dt><dd>{row.frozenQty}</dd></div><div><dt>{t("common.available")}</dt><dd>{row.availableQty}</dd></div></dl>
                </div>
              ))}
            </div>
          </div> : <div className="drawer-loading">{t("common.loading")}</div>}
        </aside>
      )}
    </>
  );
}
