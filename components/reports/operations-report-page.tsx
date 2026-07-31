"use client";

import { BarChart3, CalendarRange } from "lucide-react";
import { useEffect, useState } from "react";
import type { WarehouseCode } from "@/domain/types";
import { Badge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/ui";
import { useI18n } from "@/i18n/provider";

type OperationsReport = {
  warehouse: {
    code: string;
    name: string;
    timezone: string;
    floorAreaSqm?: number;
  };
  period: { from: string; to: string };
  preparedShCount: number;
  outboundShCount: number;
  inboundQty: number;
  outboundQty: number;
  transferIn: number;
  transferOut: number;
  faultyReturns: number;
  repairCompleted: number;
  openingPhysical?: number;
  closingPhysical?: number;
  averagePhysical?: number;
  frozenAwaitingPickup: number;
  inTransit: number;
  repairInventory: number;
  operationalTurnover?: number;
  inventoryDays?: number;
  outboundDensity?: number;
  inventoryDensity?: number;
  areaConfigured: boolean;
  historyAvailable: boolean;
  openOperationalExceptions: number;
};

const businessToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const businessDate = (value: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export function OperationsReportPage({ warehouse }: { warehouse: WarehouseCode }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"Weekly" | "Monthly">("Weekly");
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseCode | "ALL">(warehouse);
  const [period, setPeriod] = useState(businessToday);
  const [reports, setReports] = useState<OperationsReport[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ mode, warehouse: warehouseFilter, period });
    fetch(`/api/reports/operations?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || t("common.loadFailed"));
        setReports(body.reports);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError")
          setError(reason instanceof Error ? reason.message : t("common.loadFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, period, t, warehouseFilter]);

  const value = (number: number | undefined, digits = 0) =>
    number === undefined ? t("report.unavailable") : number.toLocaleString(undefined, { maximumFractionDigits: digits });

  return (
    <>
      <PageHeader title={t("title.operationsReport")} subtitle={t("report.operationsSubtitle")} />
      <div className="panel report-filter-bar">
        <div className="field">
          <label>{t("report.period")}</label>
          <input type="date" value={period} onChange={(event) => {
            setLoading(true);
            setError("");
            setPeriod(event.target.value);
          }} />
        </div>
        <div className="field">
          <label>{t("common.warehouse")}</label>
          <select value={warehouseFilter} onChange={(event) => {
            setLoading(true);
            setError("");
            setWarehouseFilter(event.target.value as WarehouseCode | "ALL");
          }}>
            <option value="SYD">SYD · Sydney</option>
            <option value="MEL">MEL · Melbourne</option>
            <option value="BNE">BNE · Brisbane</option>
            <option value="ALL">{t("report.allWarehouses")}</option>
          </select>
        </div>
        <div className="queue-tabs" role="tablist">
          <button className={mode === "Weekly" ? "active" : ""} onClick={() => {
            setLoading(true);
            setError("");
            setMode("Weekly");
          }}>{t("report.weekly")}</button>
          <button className={mode === "Monthly" ? "active" : ""} onClick={() => {
            setLoading(true);
            setError("");
            setMode("Monthly");
          }}>{t("report.monthly")}</button>
        </div>
      </div>
      {loading && <div className="page-loading">{t("common.loading")}</div>}
      {error && <div className="notice error">{error}</div>}
      {!loading && reports.map((report) => (
        <section className="panel operations-report" key={report.warehouse.code}>
          <div className="panel-head">
            <div>
              <span className="eyebrow">{mode === "Weekly" ? t("report.weekly") : t("report.monthly")}</span>
              <h3>{report.warehouse.code} · {report.warehouse.name}</h3>
              <p>{businessDate(report.period.from, report.warehouse.timezone)} → {businessDate(report.period.to, report.warehouse.timezone)} · {report.warehouse.timezone}</p>
            </div>
            <Badge tone={report.historyAvailable ? "teal" : "amber"}>
              {report.historyAvailable ? t("common.active") : t("report.unavailable")}
            </Badge>
          </div>
          {mode === "Weekly" && (
            <div className="weekly-report-grid">
              <div>
                <h4><CalendarRange /> {t("report.currentWork")}</h4>
                <ul>
                  <li>{t("report.inboundQty")}: <strong>{value(report.inboundQty)}</strong></li>
                  <li>{t("report.outboundQty")}: <strong>{value(report.outboundQty)}</strong></li>
                  <li>{t("report.transferOut")}: <strong>{value(report.transferOut)}</strong></li>
                  <li>{t("report.repairReceived")}: <strong>{value(report.faultyReturns)}</strong></li>
                </ul>
              </div>
              <div>
                <h4><BarChart3 /> {t("report.completedItems")}</h4>
                <ul>
                  <li>{t("common.prepared")}: <strong>{report.preparedShCount} SH</strong></li>
                  <li>{t("common.dispatched")}: <strong>{report.outboundShCount} SH</strong></li>
                  <li>{t("report.repairCompleted")}: <strong>{value(report.repairCompleted)}</strong></li>
                  <li>{t("dashboard.exceptions")}: <strong>{value(report.openOperationalExceptions)}</strong></li>
                </ul>
              </div>
              <label>
                <strong>{t("report.todo")}</strong>
                <textarea rows={4} placeholder={t("report.notesHelp")} />
              </label>
              <label>
                <strong>{t("report.nextPlan")}</strong>
                <textarea rows={4} placeholder={t("report.notesHelp")} />
              </label>
            </div>
          )}
          <h4 className="report-section-title">{t("report.warehouseData")}</h4>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>{t("report.openingPhysical")}</th>
                <th>{t("report.closingPhysical")}</th>
                <th>{t("report.averagePhysical")}</th>
                <th>{t("common.frozen")}</th>
                <th>{t("common.inTransit")}</th>
                <th>{t("status.Repair")}</th>
                <th>{t("report.operationalTurnover")}</th>
                <th>{t("report.inventoryDays")}</th>
              </tr></thead>
              <tbody><tr>
                <td>{value(report.openingPhysical)}</td>
                <td>{value(report.closingPhysical)}</td>
                <td>{value(report.averagePhysical, 1)}</td>
                <td>{value(report.frozenAwaitingPickup)}</td>
                <td>{value(report.inTransit)}</td>
                <td>{value(report.repairInventory)}</td>
                <td>{value(report.operationalTurnover, 3)}</td>
                <td>{value(report.inventoryDays, 1)}</td>
              </tr></tbody>
            </table>
          </div>
          <div className="area-metrics">
            <span>{t("report.floorArea")}: <strong>{report.areaConfigured ? `${value(report.warehouse.floorAreaSqm, 1)} m²` : t("report.areaNotConfigured")}</strong></span>
            <span>{t("report.outboundDensity")}: <strong>{value(report.outboundDensity, 2)}</strong></span>
            <span>{t("report.inventoryDensity")}: <strong>{value(report.inventoryDensity, 2)}</strong></span>
          </div>
        </section>
      ))}
      {!loading && reports.length > 1 && (
        <section className="panel">
          <div className="panel-head"><h3>{t("report.comparison")}</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>{t("common.warehouse")}</th>
                <th>{t("report.averagePhysical")}</th>
                <th>{t("report.inboundQty")}</th>
                <th>{t("report.outboundQty")}</th>
                <th>{t("common.frozen")}</th>
                <th>{t("common.inTransit")}</th>
                <th>{t("status.Repair")}</th>
                <th>{t("report.operationalTurnover")}</th>
                <th>{t("report.inventoryDays")}</th>
                <th>{t("report.floorArea")}</th>
                <th>{t("report.outboundDensity")}</th>
              </tr></thead>
              <tbody>{reports.map((report) => <tr key={report.warehouse.code}>
                <td><strong>{report.warehouse.code}</strong></td>
                <td>{value(report.averagePhysical, 1)}</td>
                <td>{value(report.inboundQty)}</td>
                <td>{value(report.outboundQty)}</td>
                <td>{value(report.frozenAwaitingPickup)}</td>
                <td>{value(report.inTransit)}</td>
                <td>{value(report.repairInventory)}</td>
                <td>{value(report.operationalTurnover, 3)}</td>
                <td>{value(report.inventoryDays, 1)}</td>
                <td>{report.areaConfigured ? value(report.warehouse.floorAreaSqm, 1) : t("report.areaNotConfigured")}</td>
                <td>{value(report.outboundDensity, 2)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
