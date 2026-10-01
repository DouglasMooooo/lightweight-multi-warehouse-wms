"use client";

import { ArrowLeft, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { StockCondition, WarehouseCode } from "@/domain/types";
import { sortRackLocations } from "@/domain/warehouse-map";
import { useI18n } from "@/i18n/provider";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, EmptyState, PageHeader } from "@/components/shared/ui";
import { formatWarehouseDateTime } from "@/lib/warehouse-time";

type MapView = "Stock" | "Condition" | "Frozen" | "Activity";

interface FloorArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: "horizontal" | "vertical";
  kind: "rack" | "service";
  physicalQty: number;
  frozenQty: number;
  occupiedLocations: number;
  locationCount: number;
  conditionCounts: Record<string, number>;
  matchingLocationCodes: string[];
  matching: boolean;
}

interface FloorData {
  warehouse: { code: string; name: string; timezone: string };
  summary: { occupied: number; empty: number; mixed: number; repair: number; prepared: number };
  areas: FloorArea[];
  query: string;
  focusArea?: string;
  focusLocationCode?: string;
}

interface RackLocation {
  id: string;
  code: string;
  zone: string;
  rack?: string;
  row?: number;
  bay?: number;
  side?: string;
  serviceZone: boolean;
  physicalQty: number;
  frozenQty: number;
  availableQty: number;
  skuCount: number;
  conditions: StockCondition[];
  itemTypes: string[];
  containerCount: number;
  exceptionCount: number;
  primarySku?: string;
  primaryModel?: string;
  state: string;
}

interface RackData {
  warehouse: FloorData["warehouse"];
  rack: string;
  locations: RackLocation[];
  matchingLocationCodes: string[];
}

interface LocationDetail {
  location: {
    code: string;
    warehouseCode: string;
    zone: string;
    rack?: string;
    row?: number;
    bay?: number;
    side?: string;
    serviceZone: boolean;
  };
  inventory: Array<{
    id: string;
    sku?: string;
    model: string;
    itemType: string;
    condition: StockCondition;
    physicalQty: number;
    frozenQty: number;
    availableQty: number;
    containerCode?: string;
  }>;
  serialCount: number;
  exceptionCount: number;
  movements: Array<{
    id: string;
    operation: string;
    sku?: string;
    quantity: number;
    condition: StockCondition;
    fromLocation?: string;
    toLocation?: string;
    businessReference?: string;
    effectiveAt: string;
  }>;
}

const viewClass = (view: MapView, location: RackLocation) => {
  if (view === "Frozen") return location.frozenQty > 0 ? "awaiting-pickup" : location.physicalQty > 0 ? "muted-stock" : "empty";
  if (view === "Condition") {
    if (location.skuCount > 1 || new Set(location.conditions).size > 1) return "condition-mixed";
    if (location.conditions.includes("Repair_Good")) return "condition-repair-good";
    if (location.conditions.includes("Repair")) return "condition-repair";
    if (location.conditions.includes("Material")) return "condition-material";
    if (location.conditions.includes("New")) return "condition-new";
  }
  if (location.exceptionCount > 0) return "exception";
  return location.physicalQty > 0 ? "occupied" : "empty";
};

export function WarehouseMapPage({ warehouse }: { warehouse: WarehouseCode }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MapView>("Stock");
  const [level, setLevel] = useState<"floor" | "rack">("floor");
  const [floor, setFloor] = useState<FloorData>();
  const [selectedArea, setSelectedArea] = useState("");
  const [rack, setRack] = useState<RackData>();
  const [selectedCode, setSelectedCode] = useState("");
  const [detail, setDetail] = useState<LocationDetail>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ warehouse });
      if (query) params.set("q", query);
      fetch(`/api/warehouse-map?${params}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(t("common.loadFailed"));
          const body: FloorData = await response.json();
          setFloor(body);
          setError("");
          if (body.focusArea) {
            setSelectedArea(body.focusArea);
            if (body.focusLocationCode) setSelectedCode(body.focusLocationCode);
          } else setSelectedArea((current) => current || body.areas.find((area) => area.kind === "rack")?.id || body.areas[0]?.id || "");
        })
        .catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : t("common.loadFailed")); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, t, warehouse]);

  const selectedLayout = floor?.areas.find((area) => area.id === selectedArea);
  useEffect(() => {
    if (!selectedArea) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      warehouse,
      [selectedLayout?.kind === "rack" ? "rack" : "area"]: selectedArea,
    });
    if (query) params.set("q", query);
    fetch(`/api/warehouse-map?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        setRack(await response.json());
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [query, selectedArea, selectedLayout?.kind, t, warehouse]);

  useEffect(() => {
    if (!selectedCode) return;
    const controller = new AbortController();
    fetch(`/api/warehouse-map?warehouse=${warehouse}&location=${encodeURIComponent(selectedCode)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        setDetail(await response.json());
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [selectedCode, t, warehouse]);

  const serviceLocations = useMemo(
    () => selectedLayout?.kind === "service" ? rack?.locations ?? [] : [],
    [rack?.locations, selectedLayout?.kind],
  );
  const floorTotals = useMemo(() => floor?.areas.reduce((totals, area) => ({
    physical: totals.physical + area.physicalQty,
    frozen: totals.frozen + area.frozenQty,
    locations: totals.locations + area.locationCount,
  }), { physical: 0, frozen: 0, locations: 0 }), [floor?.areas]);

  return (
    <>
      <PageHeader
        title={t("map.floorPlan")}
        subtitle={t("map.floorHelp")}
        actions={<div className="map-view-switch" role="group" aria-label={t("map.title")}>
          {(["Stock", "Condition", "Frozen", "Activity"] as MapView[]).map((value) => (
            <Button
              type="button"
              className={view === value ? "primary" : ""}
              disabled={value === "Activity"}
              title={value === "Activity" ? t("map.activityExperimental") : undefined}
              onClick={() => setView(value)}
              key={value}
            >
              {t(value === "Stock" ? "map.stockView" : value === "Condition" ? "map.conditionView" : value === "Frozen" ? "map.frozenView" : "map.activityView")}
            </Button>
          ))}
        </div>}
      />
      <div className="map-command-band">
        <div className="warehouse-map-toolbar">
          <div className="search-wrap map-search"><Search /><input id="warehouse-map-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("map.searchPlaceholder")} /></div>
          {floor && floorTotals && <div className="map-summary-strip">
            <span><b>{t("map.inventoryScopeAll")}</b></span>
            <span><b>{floorTotals.physical}</b>{t("common.physical")}</span>
            <span><b>{floorTotals.physical - floorTotals.frozen}</b>{t("common.available")}</span>
            <span><b>{floorTotals.frozen}</b>{t("common.frozen")}</span>
            <span><b>{floorTotals.locations}</b>{t("map.locations")}</span>
          </div>}
        </div>
        <MapLegend view={view} t={t} />
      </div>
      <div className="map-level-path" aria-label={t("map.levelPath")}>
        <button className={level === "floor" ? "active" : ""} type="button" onClick={() => setLevel("floor")}>{t("map.levelFloor")}</button>
        <span>→</span>
        <button className={level === "rack" ? "active" : ""} type="button" disabled={!selectedArea} onClick={() => setLevel("rack")}>{t("map.levelRack")}</button>
        <span>→</span>
        <button type="button" disabled={!selectedCode}>{t("map.levelLocation")}</button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!floor && !error && <div className="map-skeleton" aria-label={t("common.loading")} />}
      {floor && (
        <section className="warehouse-visual-shell">
          {level === "floor" ? (
            <div className="map-floor-stage">
              <WarehouseFloorPlan
                areas={floor.areas}
                hasQuery={Boolean(query)}
                selectedArea={selectedArea}
                view={view}
                onSelect={(area) => setSelectedArea(area)}
                t={t}
              />
              <AreaInspector
                area={selectedLayout}
                onOpen={() => setLevel("rack")}
                onSearch={() => document.getElementById("warehouse-map-search")?.focus()}
                t={t}
              />
            </div>
          ) : (
            <div className="warehouse-level-two">
              <div className="map-level-head">
                <Button type="button" onClick={() => setLevel("floor")}>
                  <ArrowLeft /> {t("map.backToFloor")}
                </Button>
                <div><span>{selectedLayout?.kind === "rack" ? t("map.rackView") : t("map.floorPlan")}</span><h2>{selectedArea}</h2></div>
                {query && <div className="map-focus-note">{t("map.searchFocus", { location: floor.focusLocationCode ?? selectedArea })}</div>}
              </div>
              {selectedLayout?.kind === "rack" && rack
                ? <RackElevation
                    rack={rack}
                    view={view}
                    hasQuery={Boolean(query)}
                    selectedCode={selectedCode}
                    onSelect={setSelectedCode}
                    t={t}
                  />
                : <ServiceAreaView area={selectedLayout} locations={serviceLocations} onSelect={setSelectedCode} t={t} />}
            </div>
          )}
        </section>
      )}
      {selectedCode && (
        <LocationDrawer
          detail={detail}
          locale={locale}
          timeZone={floor?.warehouse.timezone ?? "Australia/Sydney"}
          onClose={() => { setSelectedCode(""); setDetail(undefined); }}
          t={t}
        />
      )}
    </>
  );
}

function WarehouseFloorPlan({
  areas,
  hasQuery,
  selectedArea,
  view,
  onSelect,
  t,
}: {
  areas: FloorArea[];
  hasQuery: boolean;
  selectedArea: string;
  view: MapView;
  onSelect: (area: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className={`warehouse-floor-plan view-${view.toLowerCase()}`}>
      <svg viewBox="0 0 824 460" role="img" aria-label={t("map.floorPlan")} preserveAspectRatio="xMidYMid meet">
        <rect className="floor-boundary" x="12" y="12" width="800" height="436" rx="2" />
        <path className="floor-aisle" d="M580 24V436 M24 222H800" />
        <path className="floor-flow" d="M72 222H742 M505 222l-16-10v20z" />
        {areas.map((area) => {
          const conditionEntries = Object.entries(area.conditionCounts).filter(([, quantity]) => quantity > 0);
          const dominant = conditionEntries.length > 1
            ? "mixed"
            : conditionEntries[0]?.[0]?.toLowerCase().replace("_", "-");
          const state = view === "Frozen"
            ? area.frozenQty > 0 ? "awaiting-pickup" : "quiet"
            : view === "Condition" && dominant ? `condition-${dominant}` : area.physicalQty > 0 ? "occupied" : "empty";
          return (
            <g
              className={`floor-area ${state} ${area.kind} ${area.id === selectedArea ? "selected" : ""} ${area.matching ? "matched" : ""} ${hasQuery && !area.matching ? "dimmed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${area.id}, ${area.physicalQty}`}
              onClick={() => onSelect(area.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(area.id); }}
              key={area.id}
            >
              <rect x={area.x} y={area.y} width={area.width} height={area.height} rx="3" />
              {area.kind === "rack" && Array.from({ length: 12 }, (_, index) => (
                <line x1={area.x + 28 + index * ((area.width - 56) / 11)} y1={area.y + 42} x2={area.x + 28 + index * ((area.width - 56) / 11)} y2={area.y + area.height - 18} key={index} />
              ))}
              <text className="area-name" x={area.x + 16} y={area.y + 26}>{area.id}</text>
              <text className="area-stat" x={area.x + 16} y={area.y + area.height - 30}>{t("map.occupiedLocations", { count: area.occupiedLocations })}</text>
              <text className="area-stat secondary" x={area.x + 16} y={area.y + area.height - 14}>{t("map.frozenLocations", { count: area.frozenQty })}</text>
              {area.matching && <circle className="area-match-pulse" cx={area.x + area.width - 18} cy={area.y + 20} r="7" />}
            </g>
          );
        })}
        <text className="floor-caption" x="26" y="440">{t("map.floorCaption")}</text>
      </svg>
    </div>
  );
}

function AreaInspector({
  area,
  onOpen,
  onSearch,
  t,
}: {
  area?: FloorArea;
  onOpen: () => void;
  onSearch: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const conditions = area
    ? Object.entries(area.conditionCounts).filter(([, quantity]) => quantity > 0)
    : [];
  return (
    <aside className="map-area-inspector" aria-label={t("map.selectedArea")}>
      <div className="map-inspector-head">
        <span>{t("map.selectedArea")}</span>
        <h3>{area?.id ?? "—"}</h3>
      </div>
      <dl className="map-inspector-meta">
        <div><dt>{t("map.areaType")}</dt><dd>{area ? t(area.kind === "rack" ? "map.rackView" : "map.serviceArea") : "—"}</dd></div>
        <div><dt>{t("common.status")}</dt><dd><i />{t("map.statusActive")}</dd></div>
        <div><dt>{t("map.locations")}</dt><dd>{area?.locationCount ?? "—"}</dd></div>
        <div><dt>{t("map.occupied")}</dt><dd>{area?.occupiedLocations ?? "—"}</dd></div>
      </dl>
      <div className="map-inspector-actions">
        <Button className="primary" type="button" disabled={!area} onClick={onOpen}>{t("map.goToRack")}</Button>
        <Button type="button" onClick={onSearch}><Search />{t("map.searchArea")}</Button>
      </div>
      <div className="map-inspector-section">
        <h4>{t("map.areaSummary")}</h4>
        <div className="map-inspector-balances">
          <span><small>{t("common.physical")}</small><strong>{area?.physicalQty ?? "—"}</strong></span>
          <span><small>{t("common.available")}</small><strong>{area ? area.physicalQty - area.frozenQty : "—"}</strong></span>
          <span><small>{t("common.frozen")}</small><strong>{area?.frozenQty ?? "—"}</strong></span>
        </div>
      </div>
      <div className="map-inspector-section">
        <h4>{t("map.conditionMix")}</h4>
        <div className="map-condition-mix">
          {conditions.length
            ? conditions.map(([condition, quantity]) => <div key={condition}><StatusBadge code={condition} /><strong>{quantity}</strong></div>)
            : <span className="subtle">{t("map.empty")}</span>}
        </div>
      </div>
    </aside>
  );
}

function RackElevation({
  rack,
  view,
  hasQuery,
  selectedCode,
  onSelect,
  t,
}: {
  rack: RackData;
  view: MapView;
  hasQuery: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const locations = sortRackLocations(rack.locations);
  const rows = [...new Set(locations.map((location) => location.row).filter((value): value is number => value != null))].sort((a, b) => b - a);
  const bays = [...new Set(locations.map((location) => location.bay).filter((value): value is number => value != null))].sort((a, b) => a - b);
  const sideOrder = ["L", "M", "R"];
  const bayWidth = 156;
  const rowHeight = 78;
  const width = 110 + bays.length * bayWidth;
  const height = 92 + rows.length * rowHeight;
  return (
    <div className={`rack-elevation view-${view.toLowerCase()}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("map.rackElevation", { rack: rack.rack })}>
        <line className="rack-ground" x1="84" y1={height - 20} x2={width - 20} y2={height - 20} />
        {bays.map((bay, bayIndex) => (
          <text className="bay-label" x={110 + bayIndex * bayWidth + bayWidth / 2} y="30" textAnchor="middle" key={bay}>
            {t("map.bay", { bay })}
          </text>
        ))}
        {rows.map((row, rowIndex) => (
          <g key={row}>
            <text className="row-label" x="68" y={72 + rowIndex * rowHeight + 29} textAnchor="end">{t("map.row", { row })}</text>
            {bays.map((bay, bayIndex) => (
              <g key={bay}>
                {sideOrder.map((side, sideIndex) => {
                  const location = locations.find((candidate) => candidate.row === row && candidate.bay === bay && candidate.side === side);
                  if (!location) return null;
                  const x = 92 + bayIndex * bayWidth + sideIndex * 48;
                  const y = 52 + rowIndex * rowHeight;
                  const matching = rack.matchingLocationCodes.includes(location.code);
                  return (
                    <g
                      className={`rack-slot ${viewClass(view, location)} ${matching ? "matched" : ""} ${hasQuery && !matching ? "dimmed" : ""} ${selectedCode === location.code ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${location.code}, ${location.physicalQty}`}
                      onClick={() => onSelect(location.code)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(location.code); }}
                      key={location.code}
                    >
                      <title>{`${location.code}\n${location.skuCount > 1 ? `${t("map.tooltipMixed")} · ${location.skuCount} SKU` : `${location.primaryModel ?? t("map.tooltipEmpty")}\n${location.conditions.map((condition) => t(`status.${condition}`)).join(", ")}`}\n${t("map.tooltipPhysical")} ${location.physicalQty} · ${t("map.tooltipFrozen")} ${location.frozenQty} · ${t("map.tooltipAvailable")} ${location.availableQty}`}</title>
                      <rect x={x} y={y} width="43" height="58" rx="1" />
                      <text className="slot-side" x={x + 21.5} y={y + 19} textAnchor="middle">{side}</text>
                      <text className="slot-value" x={x + 21.5} y={y + 42} textAnchor="middle">
                        {location.skuCount > 1 ? t("map.slotMixed") : location.physicalQty || "—"}
                      </text>
                      {location.frozenQty > 0 && <path className="slot-frozen-mark" d={`M${x + 32} ${y}h11v11z`} />}
                    </g>
                  );
                })}
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ServiceAreaView({
  area,
  locations,
  onSelect,
  t,
}: {
  area?: FloorArea;
  locations: RackLocation[];
  onSelect: (code: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="service-area-view">
      <svg viewBox="0 0 820 260" role="img" aria-label={area?.id ?? ""}>
        <rect className="service-boundary" x="24" y="30" width="772" height="190" />
        <text className="service-title" x="50" y="70">{area?.id}</text>
        <text className="service-stat" x="50" y="108">{t("map.units", { count: area?.physicalQty ?? 0 })}</text>
        <text className="service-stat" x="50" y="138">{t("map.frozenLocations", { count: area?.frozenQty ?? 0 })}</text>
        <path className="service-flow" d="M260 126H710m-18-12 18 12-18 12" />
        {locations.map((location, index) => (
          <g role="button" tabIndex={0} onClick={() => onSelect(location.code)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(location.code); }} key={location.code}>
            <rect className="service-location" x={270 + index * 92} y="156" width="82" height="42" />
            <text className="service-location-code" x={311 + index * 92} y="181" textAnchor="middle">{location.code}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MapLegend({ view, t }: { view: MapView; t: (key: string) => string }) {
  const items = [
    ["condition-new", "map.legend.new"],
    ["condition-repair-good", "map.legend.repairGood"],
    ["condition-repair", "map.legend.repair"],
    ["condition-material", "map.legend.material"],
    [view === "Frozen" ? "awaiting-pickup" : "condition-mixed", view === "Frozen" ? "map.legend.awaitingPickup" : "map.legend.mixed"],
  ];
  return <div className="map-legend">{items.map(([className, key]) => <span key={key}><i className={className} />{t(key)}</span>)}</div>;
}

function LocationDrawer({
  detail,
  locale,
  timeZone,
  onClose,
  t,
}: {
  detail?: LocationDetail;
  locale: "en" | "zh-CN";
  timeZone: string;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const totals = detail?.inventory.reduce((sum, row) => ({
    physical: sum.physical + row.physicalQty,
    frozen: sum.frozen + row.frozenQty,
    available: sum.available + row.availableQty,
  }), { physical: 0, frozen: 0, available: 0 });
  return (
    <aside className="location-drawer" aria-label={t("map.locationDetail")}>
      <div className="drawer-head"><div><span>{t("map.locationDetail")}</span><h3 className="mono">{detail?.location.code ?? "…"}</h3></div><button type="button" onClick={onClose} aria-label={t("common.cancel")}><X /></button></div>
      {!detail ? <div className="drawer-loading">{t("common.loading")}</div> : <>
        <div className="drawer-coordinate">
          <span>{detail.location.rack ?? detail.location.zone}</span>
          <span>{detail.location.row != null ? t("map.row", { row: detail.location.row }) : detail.location.zone}</span>
          <span>{detail.location.bay != null ? t("map.bay", { bay: detail.location.bay }) : detail.location.warehouseCode}</span>
          <span>{detail.location.side ?? "—"}</span>
        </div>
        <div className="drawer-balance-summary">
          <div><span>{t("common.physical")}</span><strong>{totals?.physical ?? 0}</strong></div>
          <div><span>{t("common.frozen")}</span><strong>{totals?.frozen ?? 0}</strong></div>
          <div><span>{t("common.available")}</span><strong>{totals?.available ?? 0}</strong></div>
        </div>
        <div className="drawer-meta-strip"><span>SN {detail.serialCount}</span><span>{t("table.container")} {new Set(detail.inventory.flatMap((row) => row.containerCode ? [row.containerCode] : [])).size}</span><span>{t("nav.exceptions")} {detail.exceptionCount}</span></div>
        <h4>{t("map.inventoryHere")}</h4>
        {detail.inventory.length ? <div className="drawer-stock-table"><table><thead><tr><th>SKU / {t("common.model")}</th><th>{t("common.condition")}</th><th>{t("table.container")}</th><th>{t("common.physical")}</th><th>{t("common.frozen")}</th><th>{t("common.available")}</th></tr></thead><tbody>
          {detail.inventory.map((row) => <tr key={row.id}><td><b className="mono">{row.sku ?? "—"}</b><small>{row.model}</small></td><td><StatusBadge code={row.condition} /></td><td className="mono">{row.containerCode ?? "—"}</td><td>{row.physicalQty}</td><td>{row.frozenQty}</td><td>{row.availableQty}</td></tr>)}
        </tbody></table></div> : <EmptyState label={t("map.emptyLocation")} />}
        <h4>{t("map.recentMovements")}</h4>
        <div className="drawer-movements">{detail.movements.map((movement) => <div key={movement.id}><span><StatusBadge code={movement.operation} /> {movement.sku ?? movement.condition}</span><b>{movement.quantity}</b><small>{movement.fromLocation ?? "—"} → {movement.toLocation ?? "—"} · {formatWarehouseDateTime(movement.effectiveAt, locale, timeZone)}</small></div>)}</div>
      </>}
    </aside>
  );
}
