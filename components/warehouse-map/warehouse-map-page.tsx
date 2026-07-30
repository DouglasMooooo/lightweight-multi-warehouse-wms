"use client";

import {
  AlertTriangle,
  Boxes,
  Layers3,
  MapPin,
  MoveRight,
  Search,
  Snowflake,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemType, StockCondition, WarehouseCode } from "@/domain/types";
import type { WarehouseLocationState } from "@/domain/warehouse-map";
import { useI18n } from "@/i18n/provider";
import { Button, EmptyState, PageHeader } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/status-badge";

interface MapLocation {
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
  itemTypes: ItemType[];
  containerCount: number;
  exceptionCount: number;
  primarySku?: string;
  primaryModel?: string;
  state: WarehouseLocationState;
}

interface MapData {
  warehouse: { code: string; name: string; timezone: string };
  summary: { occupied: number; empty: number; mixed: number; repair: number; prepared: number };
  locations: MapLocation[];
  matchingLocationCodes: string[];
}

interface LocationDetail {
  location: Pick<MapLocation, "id" | "code" | "zone" | "rack" | "row" | "bay" | "side" | "serviceZone"> & { warehouseCode: string };
  inventory: Array<{
    id: string; sku?: string; model: string; itemType: ItemType; condition: StockCondition;
    physicalQty: number; frozenQty: number; availableQty: number; containerCode?: string;
  }>;
  serialCount: number;
  exceptionCount: number;
  movements: Array<{
    id: string; operation: string; sku?: string; quantity: number; condition: StockCondition;
    fromLocation?: string; toLocation?: string; businessReference?: string; effectiveAt: string;
  }>;
}

const stateIcon = {
  Empty: MapPin,
  Occupied: Boxes,
  Repair_Good: Boxes,
  Mixed: Layers3,
  Repair: Wrench,
  Frozen: Snowflake,
  Exception: AlertTriangle,
};

const sideRank = (value?: string) => ({ L: 0, M: 1, R: 2 }[value?.toUpperCase() as "L"] ?? 3);

export function WarehouseMapPage({ warehouse }: { warehouse: WarehouseCode }) {
  const { t } = useI18n();
  const [data, setData] = useState<MapData>();
  const [error, setError] = useState("");
  const [query, setQuery] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") || "");
  const initialSearch = useRef(query);
  const [condition, setCondition] = useState("");
  const [itemType, setItemType] = useState("");
  const [status, setStatus] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [detail, setDetail] = useState<LocationDetail>();

  async function loadMap(search = "") {
    const response = await fetch(`/api/warehouse-map?warehouse=${warehouse}&q=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(t("common.loadFailed"));
    const body = await response.json() as MapData;
    setData(body);
    if (search && body.matchingLocationCodes.length === 1) setSelectedCode(body.matchingLocationCodes[0]);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/warehouse-map?warehouse=${warehouse}&q=${encodeURIComponent(initialSearch.current)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        setData(await response.json());
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError")
          setError(reason instanceof Error ? reason.message : t("common.loadFailed"));
      });
    return () => controller.abort();
  }, [t, warehouse]);

  useEffect(() => {
    if (!selectedCode) return;
    fetch(`/api/warehouse-map?warehouse=${warehouse}&location=${encodeURIComponent(selectedCode)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("common.loadFailed"));
        setDetail(await response.json());
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : t("common.loadFailed")));
  }, [selectedCode, t, warehouse]);

  const filtered = useMemo(() => (data?.locations ?? []).filter((location) =>
    (!condition || location.conditions.includes(condition as StockCondition)) &&
    (!itemType || location.itemTypes.includes(itemType as ItemType)) &&
    (!status ||
      (status === "Occupied" && location.state !== "Empty") ||
      (status === "Empty" && location.state === "Empty") ||
      (status === "Frozen" && location.frozenQty > 0) ||
      (status === "Exception" && location.exceptionCount > 0) ||
      (status === "Mixed" && location.state === "Mixed"))
  ), [condition, data?.locations, itemType, status]);
  const rackGroups = useMemo(() => {
    const groups = new Map<string, MapLocation[]>();
    for (const location of filtered.filter((row) => !row.serviceZone && row.rack)) {
      const rows = groups.get(location.rack!) ?? [];
      rows.push(location);
      groups.set(location.rack!, rows);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  const serviceLocations = filtered.filter((location) => location.serviceZone || !location.rack);
  const highlighted = new Set(data?.matchingLocationCodes ?? []);

  if (error && !data) return <div className="notice error">{error}</div>;
  return (
    <>
      <PageHeader
        title={t("map.title")}
        subtitle={t("map.subtitle")}
        badge={<span className="map-live"><span />{t("map.liveInventory")}</span>}
      />
      <form className="map-searchbar" onSubmit={(event) => {
        event.preventDefault();
        loadMap(query).catch((reason) => setError(reason instanceof Error ? reason.message : t("common.loadFailed")));
      }}>
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("map.searchPlaceholder")} />
        <Button className="primary" type="submit">{t("map.highlight")}</Button>
      </form>
      <div className="map-filterbar">
        <select aria-label={t("common.condition")} value={condition} onChange={(event) => setCondition(event.target.value)}>
          <option value="">{t("map.allConditions")}</option>
          {["New", "Repair_Good", "Repair", "Material"].map((value) => <option value={value} key={value}>{t(`status.${value}`)}</option>)}
        </select>
        <select aria-label={t("field.itemType")} value={itemType} onChange={(event) => setItemType(event.target.value)}>
          <option value="">{t("map.allItemTypes")}</option>
          <option value="Product">{t("status.Product")}</option>
          <option value="Material">{t("status.Material")}</option>
        </select>
        <select aria-label={t("common.status")} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t("map.allStates")}</option>
          {["Occupied", "Empty", "Frozen", "Exception", "Mixed"].map((value) => <option value={value} key={value}>{t(`map.state.${value}`)}</option>)}
        </select>
        {(condition || itemType || status) && <Button type="button" onClick={() => { setCondition(""); setItemType(""); setStatus(""); }}>{t("map.clearFilters")}</Button>}
      </div>
      {data ? (
        <>
          <div className="map-summary-strip">
            {[
              ["occupied", data.summary.occupied],
              ["empty", data.summary.empty],
              ["mixed", data.summary.mixed],
              ["repair", data.summary.repair],
              ["frozen", data.summary.prepared],
            ].map(([key, value]) => <div key={key}><strong>{value}</strong><span>{t(`map.summary.${key}`)}</span></div>)}
          </div>
          <div className="warehouse-floor">
            <section className="service-area">
              <div className="map-section-head"><div><span>{t("map.serviceZones")}</span><strong>{t("map.operationalAreas")}</strong></div></div>
              <div className="service-grid">
                {serviceLocations.map((location) => (
                  <LocationCell
                    location={location}
                    highlighted={highlighted.has(location.code)}
                    dimmed={highlighted.size > 0 && !highlighted.has(location.code)}
                    selected={selectedCode === location.code}
                    onSelect={setSelectedCode}
                    t={t}
                    service
                    key={location.id}
                  />
                ))}
              </div>
            </section>
            <section className="rack-area">
              <div className="map-section-head"><div><span>{t("map.rackStorage")}</span><strong>{data.warehouse.code} · {data.warehouse.name}</strong></div><small>{t("map.rowOrientation")}</small></div>
              {rackGroups.map(([rack, locations]) => {
                const rows = [...new Set(locations.map((location) => location.row).filter((value): value is number => value !== undefined))].sort((a, b) => b - a);
                const bays = [...new Set(locations.map((location) => location.bay).filter((value): value is number => value !== undefined))].sort((a, b) => a - b);
                return (
                  <div className="rack-block" key={rack}>
                    <div className="rack-name"><Warehouse />{rack}</div>
                    <div className="rack-grid" style={{ gridTemplateColumns: `64px repeat(${Math.max(1, bays.length)}, minmax(118px, 1fr))` }}>
                      <div />
                      {bays.map((bay) => <div className="bay-heading" key={bay}>{t("map.bay", { bay })}</div>)}
                      {rows.flatMap((row) => [
                        <div className="row-heading" key={`row:${row}`}>{t("map.row", { row })}</div>,
                        ...bays.map((bay) => {
                          const slots = locations
                            .filter((location) => location.row === row && location.bay === bay)
                            .sort((a, b) => sideRank(a.side) - sideRank(b.side));
                          return (
                            <div className="bay-cell" key={`${row}:${bay}`}>
                              {slots.map((location) => (
                                <LocationCell
                                  location={location}
                                  highlighted={highlighted.has(location.code)}
                                  dimmed={highlighted.size > 0 && !highlighted.has(location.code)}
                                  selected={selectedCode === location.code}
                                  onSelect={setSelectedCode}
                                  t={t}
                                  key={location.id}
                                />
                              ))}
                              {!slots.length && <span className="bay-empty">—</span>}
                            </div>
                          );
                        }),
                      ])}
                    </div>
                  </div>
                );
              })}
              {!rackGroups.length && <EmptyState label={t("map.noRackLocations")} />}
            </section>
          </div>
        </>
      ) : <div className="map-skeleton" aria-label={t("common.loading")} />}
      {selectedCode && (
        <aside className="location-drawer" aria-label={t("map.locationDetail")}>
          <div className="drawer-head"><div><span>{t("map.locationDetail")}</span><h3 className="mono">{selectedCode}</h3></div><button type="button" onClick={() => { setSelectedCode(""); setDetail(undefined); }} aria-label={t("common.cancel")}><X /></button></div>
          {detail ? (
            <div className="drawer-content">
              <div className="drawer-balance-summary">
                <div><span>{t("common.physical")}</span><strong>{detail.inventory.reduce((sum, row) => sum + row.physicalQty, 0)}</strong></div>
                <div><span>{t("common.frozen")}</span><strong>{detail.inventory.reduce((sum, row) => sum + row.frozenQty, 0)}</strong></div>
                <div><span>{t("common.available")}</span><strong>{detail.inventory.reduce((sum, row) => sum + row.availableQty, 0)}</strong></div>
              </div>
              <dl className="location-attributes">
                <div><dt>{t("common.zone")}</dt><dd>{detail.location.zone}</dd></div>
                <div><dt>{t("map.coordinates")}</dt><dd>{[detail.location.rack, detail.location.row, detail.location.bay, detail.location.side].filter((value) => value !== null && value !== undefined).join(" / ") || t("map.serviceZone")}</dd></div>
                <div><dt>{t("map.snCount")}</dt><dd>{detail.serialCount}</dd></div>
                <div><dt>{t("map.exceptions")}</dt><dd>{detail.exceptionCount}</dd></div>
              </dl>
              <div className="drawer-section-title">{t("nav.inventory")}</div>
              {detail.inventory.length ? <div className="drawer-stock-table"><table>
                <thead><tr><th>{t("report.sku")}</th><th>{t("common.condition")}</th><th className="number">{t("common.physical")}</th><th className="number">{t("common.frozen")}</th><th className="number">{t("common.available")}</th></tr></thead>
                <tbody>{detail.inventory.map((row) => <tr key={row.id}>
                  <td><strong className="mono">{row.sku ?? "—"}</strong><span>{row.model}</span></td>
                  <td><StatusBadge code={row.condition} /></td>
                  <td className="number">{row.physicalQty}</td>
                  <td className="number">{row.frozenQty}</td>
                  <td className="number strong">{row.availableQty}</td>
                </tr>)}</tbody>
              </table></div> : <EmptyState label={t("map.emptyLocation")} />}
              {detail.inventory.some((row) => row.containerCode) && <>
                <div className="drawer-section-title">{t("map.containers")}</div>
                <div className="container-chips">{[...new Set(detail.inventory.flatMap((row) => row.containerCode ? [row.containerCode] : []))].map((code) => <span className="mono" key={code}>{code}</span>)}</div>
              </>}
              <div className="drawer-actions">
                <Link className="btn primary" href={`/inventory?location=${encodeURIComponent(selectedCode)}`}>{t("map.openInventory")}</Link>
                <Link className="btn" href={`/move?from=${encodeURIComponent(selectedCode)}`}><MoveRight />{t("map.moveStock")}</Link>
              </div>
              <div className="drawer-section-title">{t("map.lastMovements")}</div>
              <div className="movement-list">
                {detail.movements.map((movement) => <div key={movement.id}><strong>{movement.operation}</strong><span>{movement.sku ?? "—"} · {movement.quantity} · {movement.businessReference ?? "—"}</span></div>)}
                {!detail.movements.length && <div className="subtle">{t("map.noMovements")}</div>}
              </div>
            </div>
          ) : <div className="drawer-loading">{t("common.loading")}</div>}
        </aside>
      )}
    </>
  );
}

function LocationCell({
  location,
  highlighted,
  dimmed,
  selected,
  onSelect,
  t,
  service = false,
}: {
  location: MapLocation;
  highlighted: boolean;
  dimmed: boolean;
  selected: boolean;
  onSelect: (code: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  service?: boolean;
}) {
  const Icon = stateIcon[location.state];
  return (
    <button
      className={`map-location state-${location.state.toLowerCase()} ${service ? "service" : ""} ${highlighted ? "highlighted" : ""} ${dimmed ? "dimmed" : ""} ${selected ? "selected" : ""}`}
      type="button"
      onClick={() => onSelect(location.code)}
      aria-label={`${location.code} · ${t(`map.state.${location.state}`)}`}
    >
      <div className="location-code"><span>{location.side ?? location.code}</span><Icon /></div>
      {!service && <small className="mono">{location.code}</small>}
      <strong>{location.skuCount > 1 ? t("map.mixedSku", { count: location.skuCount }) : location.primaryModel ?? t("map.empty")}</strong>
      <div className="location-qty">{location.physicalQty > 0 ? `× ${location.physicalQty}` : "—"}<span>{t(`map.state.${location.state}`)}</span></div>
      <span className="location-tooltip" role="tooltip">
        <b className="mono">{location.code}</b>
        <span>{location.skuCount > 1 ? t("map.mixedSku", { count: location.skuCount }) : location.primarySku ?? t("map.empty")}</span>
        <span>{t(`map.state.${location.state}`)}</span>
        <dl>
          <div><dt>{t("common.physical")}</dt><dd>{location.physicalQty}</dd></div>
          <div><dt>{t("common.frozen")}</dt><dd>{location.frozenQty}</dd></div>
          <div><dt>{t("common.available")}</dt><dd>{location.availableQty}</dd></div>
        </dl>
      </span>
    </button>
  );
}
