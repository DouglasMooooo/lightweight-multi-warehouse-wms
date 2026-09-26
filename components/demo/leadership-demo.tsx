"use client";

import Link from "next/link";
import { zh } from "@/i18n/demo-zh";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  ClipboardCheck,
  LayoutDashboard,
  MapPin,
  PackageCheck,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Truck,
  Warehouse,
  Wrench,
} from "lucide-react";
import {
  auditDemo,
  auditSample,
  demoLocation,
  demoMetrics,
  demoReport,
  traceDemo,
  type DemoCommand,
} from "@/domain/leadership-demo";
import { LeadershipDemoService } from "@/services/leadership-demo-service";

const pages = [
  ["Overview", LayoutDashboard, "Live execution queue and warehouse position"],
  ["Outbound", PackageCheck, "Verify location and scan two units to prepare"],
  [
    "Digital Pickup",
    ShieldCheck,
    "Simulated identity or driver handover dispatches stock",
  ],
  [
    "Faulty Return",
    RotateCcw,
    "Receive units, route missing documentation to after-sales",
  ],
  ["Transfer", Truck, "Separate source and destination SN evidence"],
  ["Repair → Good", Wrench, "Complete repair while preserving the same SN"],
  ["Warehouse Map", MapPin, "Explore locations, balances and movement history"],
  ["SN Trace", ScanLine, "Follow one serial through its warehouse lifecycle"],
  [
    "Audit / Exceptions",
    ClipboardCheck,
    "Deterministic checks and investigation queue",
  ],
  [
    "AI Audit Concept",
    Sparkles,
    "Mock analysis only; human decisions remain authoritative",
  ],
  [
    "Inventory",
    Boxes,
    "Physical, frozen and available by location and condition",
  ],
  [
    "Reporting",
    LayoutDashboard,
    "Current position and weekly / monthly movement evidence",
  ],
] as const;
type Page = (typeof pages)[number][0];
const date = (at: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(at));
const readable = (value: string) => value.replaceAll("_", " ");
function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`demo-panel ${className}`}>
      {zh(title && <h2>{zh(title)}</h2>)}
      {zh(children)}
    </section>
  );
}
function Tag({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return <span className={`demo-tag ${tone}`}>{zh(children)}</span>;
}
function Scan({
  label,
  hint,
  onScan,
  disabled = false,
}: {
  label: string;
  hint: string;
  onScan: (value: string) => boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (onScan(value)) setValue("");
    input.current?.focus();
  }
  return (
    <form className="demo-scan" onSubmit={submit}>
      <label>
        <span>{zh(label)}</span>
        <div>
          <ScanLine size={23} />
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={zh(hint)}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            aria-label={zh(label)}
          />
        </div>
      </label>
      <button disabled={disabled || !value.trim()} className="demo-primary">
        {zh("Verify scan")}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}

export function LeadershipDemo() {
  const [service] = useState(() => new LeadershipDemoService());
  const [session, setSession] = useState(() => service.read());
  const [page, setPage] = useState<Page>("Overview");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [generation, setGeneration] = useState(0);
  const [pickupKind, setPickupKind] = useState<"Engineer" | "Driver">(
    "Engineer",
  );
  const [pickupReference, setPickupReference] = useState("");
  const [collector, setCollector] = useState("");
  const [returnText, setReturnText] = useState("60E5M4805C3F242");
  const [returnLocation, setReturnLocation] = useState("");
  const [repairSn, setRepairSn] = useState("");
  const [goodLocation, setGoodLocation] = useState("FLEX-01");
  const [destination, setDestination] = useState("");
  const [mapWarehouse, setMapWarehouse] = useState("SYD");
  const [location, setLocation] = useState("FLEX-01");
  const [trace, setTrace] = useState("EQ48S260700001");
  const [samples, setSamples] = useState(false);
  const [question, setQuestion] = useState("");
  const [period, setPeriod] = useState(7);
  const stock = session.stock;
  const order = stock.outboundOrders[0];
  const line = order.lines[0];
  const transfer = stock.transfers[0];
  const metrics = demoMetrics(session);
  const issues = samples ? auditSample() : auditDemo(stock);
  const selectedLocation = demoLocation(stock, location, mapWarehouse);
  const repairJob = stock.repairJobs?.find((j) => j.serialNumber === repairSn);
  const returnRows = returnText
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((value) => ({
      sn: value.toUpperCase(),
      serial: stock.serials.find((s) => s.serialNumber === value.toUpperCase()),
    }));
  const traceSerial = stock.serials.find((s) => s.serialNumber === trace);
  const events = traceDemo(stock, trace);
  const movements = demoReport(stock, period);
  const warehouseContext =
    page === "Inventory" || page === "Reporting"
      ? "All warehouses"
      : (page === "Warehouse Map" && mapWarehouse === "MEL") ||
          (page === "Transfer" && transfer.status !== "Draft")
        ? "Melbourne"
        : "Sydney";

  function run(command: DemoCommand, success: string) {
    try {
      setSession(service.execute(command));
      setNotice({ text: success, error: false });
      return true;
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Operation failed.",
        error: true,
      });
      return false;
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setNotice(null);
  }
  function reset() {
    setSession(service.reset());
    setGeneration((n) => n + 1);
    setPickupKind("Engineer");
    setPickupReference("");
    setCollector("");
    setReturnText("60E5M4805C3F242");
    setReturnLocation("");
    setRepairSn("");
    setGoodLocation("FLEX-01");
    setDestination("");
    setMapWarehouse("SYD");
    setLocation("FLEX-01");
    setTrace("EQ48S260700001");
    setSamples(false);
    setQuestion("");
    setPeriod(7);
    setPage("Overview");
    setNotice({
      text: "All demo workflows, scans, exceptions and audit history reset. Ready for another presentation.",
      error: false,
    });
  }
  const orderStatus = session.collection
    ? "Collected"
    : order.status === "Ready_for_Pickup"
      ? "Ready for Pickup"
      : "To prepare";
  return (
    <div className="leadership-demo" lang="zh-CN">
      <aside className="demo-sidebar">
        <Link className="demo-brand" href="/demo">
          <Warehouse size={30} />
          <span>
            {zh("WMS")}
            <span>{zh("WORKFLOW PREVIEW")}</span>
          </span>
        </Link>
        <div className="demo-site">
          <span className="demo-live-dot" /> {zh(warehouseContext)}
          <small>
            {zh(
              warehouseContext === "All warehouses"
                ? "Consolidated view"
                : "Current task context",
            )}
          </small>
        </div>
        <nav aria-label={zh("Demo workflows")}>
          {zh(
            pages.map(([name, Icon]) => (
              <button
                key={name}
                onClick={() => navigate(name)}
                className={page === name ? "active" : ""}
                aria-current={page === name ? "page" : undefined}
              >
                <Icon size={19} />
                {zh(name)}
              </button>
            )),
          )}
        </nav>
        <div className="demo-sidebar-bottom">
          <Tag tone="amber">{zh("Prototype / Demo Data")}</Tag>
          <p>{zh("Synthetic session · no ERP connection")}</p>
          <Link href="/dashboard">{zh("Existing operational preview ↗")}</Link>
        </div>
      </aside>
      <div className="demo-main">
        <header className="demo-topbar">
          <div>
            <span>{zh("WMS Workflow Preview")}</span>
            <b>
              {zh(warehouseContext)} <span>/</span>
              {zh("Leadership demo")}
            </b>
          </div>
          <button className="demo-reset" onClick={reset}>
            <RotateCcw size={16} />
            {zh("Reset Demo")}
          </button>
        </header>
        <main key={generation} className="demo-content">
          <div className="demo-heading">
            <div>
              <p className="demo-eyebrow">
                {zh("WAREHOUSE EXECUTION /")}
                {zh(" ")}
                {zh(
                  String(pages.findIndex((p) => p[0] === page) + 1).padStart(
                    2,
                    "0",
                  ),
                )}
              </p>
              <h1>
                {zh(page === "Overview" ? "Every unit. Every movement." : page)}
              </h1>
              <p>{zh(pages.find((p) => p[0] === page)?.[2])}</p>
            </div>
            <Tag tone="green">{zh("Prototype / Demo Data")}</Tag>
          </div>
          {zh(
            notice && (
              <div
                role={notice.error ? "alert" : "status"}
                className={`demo-notice ${notice.error ? "error" : ""}`}
              >
                <span>
                  {zh(notice.error ? "Action required" : "Confirmed")}
                </span>
                {zh(notice.text)}
                <button
                  aria-label={zh("Dismiss message")}
                  onClick={() => setNotice(null)}
                >
                  ×
                </button>
              </div>
            ),
          )}

          {zh(
            page === "Overview" && (
              <>
                <div className="demo-hero">
                  <div>
                    <p className="demo-eyebrow">{zh("NEXT TASK · SYDNEY")}</p>
                    <h2>
                      {zh(
                        orderStatus === "To prepare"
                          ? "Prepare the service replacement."
                          : session.collection
                            ? "Collection complete. Keep work moving."
                            : "Two units ready. Verify collection.",
                      )}
                    </h2>
                    <p>
                      {zh(order.shNo)}
                      {zh("· EQ4800-S · 2 units · FLEX-01")}
                    </p>
                    <button
                      className="demo-primary"
                      onClick={() =>
                        navigate(
                          orderStatus === "To prepare"
                            ? "Outbound"
                            : "Digital Pickup",
                        )
                      }
                    >
                      {zh(
                        orderStatus === "To prepare"
                          ? "Start Pick Task"
                          : "Open pickup",
                      )}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                  <div className="demo-hero-mark">
                    <ScanLine size={78} strokeWidth={1} />
                    <span>{zh("SCAN. VERIFY. COMPLETE.")}</span>
                  </div>
                </div>
                <div className="demo-metrics">
                  {zh(
                    Object.entries(metrics)
                      .slice(0, 6)
                      .map(([label, value]) => (
                        <div key={label}>
                          <span>{zh(label)}</span>
                          <strong>{zh(value)}</strong>
                          <small>{zh("Demo units · all warehouses")}</small>
                        </div>
                      )),
                  )}
                </div>
                <div className="demo-section-title">
                  <h2>{zh("Leadership demo scenarios")}</h2>
                  <span>
                    {zh("Run a workflow. Inspect the evidence. Reset.")}
                  </span>
                </div>
                <div className="demo-scenarios">
                  {zh(
                    pages
                      .slice(1, 10)
                      .map(([name, Icon, description], index) => (
                        <button key={name} onClick={() => navigate(name)}>
                          <div>
                            <Icon size={22} />
                            <small>
                              {zh(String(index + 1).padStart(2, "0"))}
                            </small>
                          </div>
                          <h3>{zh(name)}</h3>
                          <p>{zh(description)}</p>
                          <span>
                            {zh("Start Demo")}
                            <ArrowRight size={16} />
                          </span>
                        </button>
                      )),
                  )}
                </div>
              </>
            ),
          )}

          {zh(
            page === "Outbound" && (
              <>
                <div className="demo-flow">
                  {zh(
                    [
                      "Order validated",
                      "Location verified",
                      "SNs verified",
                      "Ready for Pickup",
                    ].map((step, index) => (
                      <div
                        key={step}
                        className={
                          index === 0 ||
                          (index === 1 && session.locationVerified) ||
                          (index > 1 && line.preparedQty === 2)
                            ? "done"
                            : ""
                        }
                      >
                        <span>{zh(index + 1)}</span>
                        {zh(step)}
                      </div>
                    )),
                  )}
                </div>
                <div className="demo-two-col">
                  <Panel title={zh("Pick task")}>
                    <div className="demo-card-head">
                      <strong>{zh(order.shNo)}</strong>
                      <Tag tone={line.preparedQty ? "green" : "amber"}>
                        {zh(orderStatus)}
                      </Tag>
                    </div>
                    <dl className="demo-facts">
                      <div>
                        <dt>{zh("Model / SKU")}</dt>
                        <dd>
                          {zh(line.model)}
                          <small>{zh(line.sku)}</small>
                        </dd>
                      </div>
                      <div>
                        <dt>{zh("Required quantity")}</dt>
                        <dd>{zh("2 units · New")}</dd>
                      </div>
                      <div>
                        <dt>{zh("Suggested location")}</dt>
                        <dd className="demo-location-code">{zh("FLEX-01")}</dd>
                      </div>
                      <div>
                        <dt>{zh("Pickup code")}</dt>
                        <dd>{zh(order.pickupCode)}</dd>
                      </div>
                    </dl>
                    <div className="demo-progress">
                      <div
                        style={{
                          width: `${(session.pickScans.length / 2) * 100}%`,
                        }}
                      />
                    </div>
                    <p>
                      {zh(
                        session.locationVerified
                          ? "✓ Location verified"
                          : "Location verification pending",
                      )}
                      {zh(" ")}
                      {zh("· SN")}
                      {zh(session.pickScans.length)}/2
                    </p>
                    <ul className="demo-evidence">
                      {zh(
                        session.pickScans.map((sn) => (
                          <li key={sn}>
                            <Check size={17} />
                            {zh(sn)}
                          </li>
                        )),
                      )}
                    </ul>
                  </Panel>
                  <Panel
                    title={zh("Next action")}
                    className="demo-action-panel"
                  >
                    {zh(
                      line.preparedQty === 2 ? (
                        <div className="demo-complete">
                          <PackageCheck size={46} />
                          <h2>{zh(orderStatus)}</h2>
                          <p>
                            {zh(
                              session.collection
                                ? "Task completed. Pickup evidence is recorded."
                                : "Physical stock unchanged. Two units frozen for collection.",
                            )}
                          </p>
                          <button
                            className="demo-primary"
                            onClick={() => navigate("Digital Pickup")}
                          >
                            {zh("Continue to pickup")}
                            <ArrowRight size={18} />
                          </button>
                          <button onClick={() => window.print()}>
                            {zh("Print batch pickup label")}
                          </button>
                          <div className="demo-print-label">
                            <h2>
                              {zh("Pickup")}
                              {zh(order.pickupCode)}
                            </h2>
                            <p>{zh(order.shNo)}</p>
                            <p>
                              {zh(line.sku)} · {zh(line.model)} ·{" "}
                              {zh(order.erpWarehouse)}
                            </p>
                            <strong>{zh("2 units · FLEX-01")}</strong>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="demo-eyebrow">
                            {zh(
                              session.locationVerified
                                ? "02 / SCAN SN"
                                : "01 / GO TO LOCATION",
                            )}
                          </p>
                          <h3>
                            {zh(
                              session.locationVerified
                                ? "Scan the next unit."
                                : "Go to FLEX-01.",
                            )}
                          </h3>
                          <Scan
                            key={session.locationVerified ? "sn" : "location"}
                            label={zh(
                              session.locationVerified
                                ? "Scan unit SN"
                                : "Scan location QR / code",
                            )}
                            hint={zh(
                              session.locationVerified
                                ? "EQ48S260700001"
                                : "FLEX-01",
                            )}
                            onScan={(value) =>
                              run(
                                {
                                  type: session.locationVerified
                                    ? "pick"
                                    : "location",
                                  value,
                                },
                                session.locationVerified
                                  ? "SN accepted. Readiness updates automatically when both units are validated."
                                  : "Location verified. Now scan the two units.",
                              )
                            }
                          />
                          <div className="demo-hint">
                            <strong>{zh("Presenter scan values")}</strong>
                            <code>{zh("FLEX-01")}</code>
                            <code>{zh("EQ48S260700001")}</code>
                            <code>{zh("EQ48S260700002")}</code>
                            <p>
                              {zh(
                                "Type or paste a value, then press Enter. Location QR scanners supply the location code.",
                              )}
                            </p>
                          </div>
                        </>
                      ),
                    )}
                  </Panel>
                </div>
              </>
            ),
          )}

          {zh(
            page === "Digital Pickup" && (
              <div className="demo-two-col">
                <Panel title={zh("Collection verification")}>
                  <Tag tone="amber">
                    {zh("Prototype workflow · simulated identity")}
                  </Tag>
                  <div className="demo-tabs">
                    <button
                      className={pickupKind === "Engineer" ? "selected" : ""}
                      onClick={() => setPickupKind("Engineer")}
                    >
                      {zh("Engineer pickup")}
                    </button>
                    <button
                      className={pickupKind === "Driver" ? "selected" : ""}
                      onClick={() => setPickupKind("Driver")}
                    >
                      {zh("Logistics driver")}
                    </button>
                  </div>
                  {zh(
                    pickupKind === "Engineer" ? (
                      <dl className="demo-facts">
                        <div>
                          <dt>{zh("Engineer")}</dt>
                          <dd>
                            {zh("Alex Chen")}
                            <small>
                              {zh("Simulated after-sales identity")}
                            </small>
                          </dd>
                        </div>
                        <div>
                          <dt>{zh("After-sales order / shipment")}</dt>
                          <dd>{zh(order.shNo)}</dd>
                        </div>
                        <div>
                          <dt>{zh("Authorised")}</dt>
                          <dd>{zh("Yes · demo grant for this shipment")}</dd>
                        </div>
                      </dl>
                    ) : (
                      <>
                        <label className="demo-field">
                          {zh("Enter / scan Pickup Order Number")}
                          <input
                            value={pickupReference}
                            onChange={(e) => setPickupReference(e.target.value)}
                            placeholder={zh("SYD-00265")}
                          />
                        </label>
                        <label className="demo-field">
                          {zh("Driver / carrier handover name")}
                          <input
                            value={collector}
                            onChange={(e) => setCollector(e.target.value)}
                            placeholder={zh("Enter collector name")}
                          />
                        </label>
                        <p>
                          {zh(
                            "No company identity required. Shipment reference and readiness are validated.",
                          )}
                        </p>
                      </>
                    ),
                  )}
                  <button
                    className="demo-primary"
                    disabled={order.status !== "Ready_for_Pickup"}
                    onClick={() =>
                      run(
                        {
                          type: "collect",
                          kind: pickupKind,
                          reference:
                            pickupKind === "Engineer"
                              ? order.shNo
                              : pickupReference,
                          collector:
                            pickupKind === "Engineer" ? "Alex Chen" : collector,
                        },
                        "Pickup Verified. Shipment Collected; SNs Outbound; inventory reduced; audit event created.",
                      )
                    }
                  >
                    {zh(
                      pickupKind === "Engineer"
                        ? "Confirm Collection"
                        : "Confirm Handover",
                    )}
                    <Check size={18} />
                  </button>
                  {zh(
                    order.status === "Ready" && (
                      <p>
                        {zh("Complete the")}
                        {zh(" ")}
                        <button
                          className="demo-text-button"
                          onClick={() => navigate("Outbound")}
                        >
                          {zh("pick task")}
                        </button>
                        {zh(" ")}
                        {zh("first.")}
                      </p>
                    ),
                  )}
                </Panel>
                <Panel title={zh("Shipment evidence")}>
                  <Tag tone={session.collection ? "green" : "amber"}>
                    {zh(orderStatus)}
                  </Tag>
                  <h3>{zh(order.shNo)}</h3>
                  <p>
                    {zh("Pickup")}
                    {zh(order.pickupCode)}
                  </p>
                  <ul className="demo-evidence">
                    {zh(
                      line.scannedSerials.length ? (
                        line.scannedSerials.map((sn) => (
                          <li key={sn}>
                            <PackageCheck size={18} />
                            {zh(sn)}
                            {zh(" ")}
                            <Tag>
                              {zh(
                                stock.serials.find((s) => s.serialNumber === sn)
                                  ?.status,
                              )}
                            </Tag>
                          </li>
                        ))
                      ) : (
                        <li>{zh("No prepared units yet.")}</li>
                      ),
                    )}
                  </ul>
                  {zh(
                    session.collection && (
                      <div className="demo-success">
                        <h3>{zh("Pickup Verified")}</h3>
                        <p>
                          {zh(session.collection.collector)} ·{" "}
                          {zh(session.collection.kind)}
                        </p>
                        <p>
                          {zh(date(session.collection.at))}
                          {zh("Sydney time")}
                        </p>
                        <p>
                          {zh("Shipment → Collected")}
                          <br />
                          {zh("SN → Outbound")}
                          <br />
                          {zh("Order / task → Completed")}
                        </p>
                      </div>
                    ),
                  )}
                  <p className="demo-footnote">
                    {zh(
                      "Pickup confirmation is the dispatch event. The mock identity is not real authentication.",
                    )}
                  </p>
                </Panel>
              </div>
            ),
          )}

          {zh(
            page === "Faulty Return" && (
              <div className="demo-two-col">
                <Panel title={zh("Receive faulty units")}>
                  <label className="demo-field">
                    {zh("Single SN or multiple SNs")}
                    <textarea
                      value={returnText}
                      onChange={(e) => setReturnText(e.target.value)}
                      rows={4}
                    />
                  </label>
                  <div className="demo-hint">
                    <strong>{zh("Demo fixtures")}</strong>
                    <code>{zh("60E5M4805C3F242")}</code>
                    <span>{zh("Matched SH / order")}</span>
                    <code>{zh("DEMO-RETURN-NO-SH")}</code>
                    <span>
                      {zh("Known unit identity; documentation missing")}
                    </span>
                  </div>
                  <label className="demo-field">
                    {zh("Confirm physical repair location")}
                    <input
                      value={returnLocation}
                      onChange={(e) => setReturnLocation(e.target.value)}
                      placeholder={zh("Scan / enter REPAIR-01")}
                    />
                  </label>
                  <button
                    className="demo-primary"
                    onClick={() =>
                      run(
                        {
                          type: "return",
                          serials: returnRows.map((r) => r.sn),
                          location: returnLocation,
                        },
                        "Warehouse receipt completed. Matched units entered Repair; missing documentation routed to After-sales Action Required.",
                      )
                    }
                  >
                    {zh("Receive physically")}
                    <ArrowRight size={18} />
                  </button>
                </Panel>
                <Panel title={zh("Identity & history lookup")}>
                  {zh(
                    returnRows.length ? (
                      returnRows.map((row, i) => (
                        <article
                          className="demo-return-row"
                          key={`${row.sn}-${i}`}
                        >
                          <strong>{zh(row.sn)}</strong>
                          <Tag
                            tone={row.serial?.relatedShNo ? "green" : "amber"}
                          >
                            {zh(
                              row.serial?.relatedShNo
                                ? "Matched"
                                : "Documentation pending",
                            )}
                          </Tag>
                          <p>
                            {zh(
                              row.serial?.model ??
                                "Unknown identity — no SKU inferred",
                            )}
                            {zh(" ")}· {zh(row.serial?.sku ?? "—")}
                          </p>
                          <p>
                            {zh("SH / order:")}
                            {zh(" ")}
                            {zh(
                              row.serial?.relatedShNo || "Missing SH reference",
                            )}
                          </p>
                          <p>
                            {zh("Existing status:")}
                            {zh(row.serial?.status ?? "Unresolved")}
                          </p>
                          {zh(
                            !row.serial?.relatedShNo && (
                              <small>
                                {zh(
                                  "Physical receiving is permitted for the known demo unit. After-sales must complete business documentation.",
                                )}
                              </small>
                            ),
                          )}
                        </article>
                      ))
                    ) : (
                      <p>{zh("Enter an SN to inspect its history.")}</p>
                    ),
                  )}
                  <button onClick={() => navigate("Repair → Good")}>
                    {zh("Open repair queue")}
                    <ArrowRight size={16} />
                  </button>
                </Panel>
              </div>
            ),
          )}

          {zh(
            page === "Transfer" && (
              <>
                <div className="demo-transfer-route">
                  <div>
                    <small>{zh("SOURCE WAREHOUSE")}</small>
                    <h2>{zh("Sydney")}</h2>
                    <span>{zh("FLEX-01")}</span>
                  </div>
                  <div>
                    <Truck size={30} />
                    <Tag
                      tone={transfer.status === "Received" ? "green" : "amber"}
                    >
                      {zh(readable(transfer.status))}
                    </Tag>
                  </div>
                  <div>
                    <small>{zh("DESTINATION WAREHOUSE")}</small>
                    <h2>{zh("Melbourne")}</h2>
                    <span>
                      {zh(transfer.destinationLocation ?? "RECEIVING-01")}
                    </span>
                  </div>
                </div>
                <Panel>
                  <div className="demo-card-head">
                    <h2>{zh(transfer.transferNo)}</h2>
                    <span>{zh("EQ4800-S · 1 unit · New")}</span>
                  </div>
                  <div className="demo-three-col">
                    {zh(
                      [
                        ["Expected SN list", transfer.serials],
                        ["Sent SN scans", session.sentScans],
                        ["Received SN scans", session.receivedScans],
                      ].map(([title, sns]) => (
                        <div className="demo-sn-list" key={title as string}>
                          <h3>{zh(title)}</h3>
                          {zh(
                            (sns as string[]).length ? (
                              (sns as string[]).map((sn) => (
                                <code key={sn}>{zh(sn)}</code>
                              ))
                            ) : (
                              <p>{zh("No scan evidence yet")}</p>
                            ),
                          )}
                        </div>
                      )),
                    )}
                  </div>
                </Panel>
                <div className="demo-two-col">
                  <Panel
                    title={zh(
                      transfer.status === "Draft"
                        ? "Sydney · source task"
                        : "Melbourne · receiving task",
                    )}
                  >
                    {zh(
                      transfer.status === "Received" ? (
                        <div className="demo-complete">
                          <Check size={40} />
                          <h3>{zh("Transfer complete")}</h3>
                          <p>
                            {zh("SN located at Melbourne /")}
                            {zh(transfer.destinationLocation)}.
                          </p>
                        </div>
                      ) : (
                        <>
                          <Scan
                            key={transfer.status}
                            label={zh(
                              transfer.status === "Draft"
                                ? "Scan source SN"
                                : "Scan actual destination SN",
                            )}
                            hint={zh("EQ48S260700003")}
                            onScan={(value) =>
                              run(
                                {
                                  type: "transferScan",
                                  phase:
                                    transfer.status === "Draft"
                                      ? "send"
                                      : "receive",
                                  value,
                                },
                                "SN matched to expected transfer. Scan evidence recorded for this warehouse.",
                              )
                            }
                          />
                          {zh(
                            transfer.status === "Draft" ? (
                              <button
                                className="demo-primary"
                                onClick={() =>
                                  run(
                                    { type: "transferOut" },
                                    "Transfer Out recorded. Unit is In Transit; Melbourne has a receiving task.",
                                  )
                                }
                              >
                                {zh("Confirm Transfer Out")}
                              </button>
                            ) : (
                              <>
                                <label className="demo-field">
                                  {zh("Destination location")}
                                  <input
                                    value={destination}
                                    onChange={(e) =>
                                      setDestination(e.target.value)
                                    }
                                    placeholder={zh("RECEIVING-01")}
                                  />
                                </label>
                                <button
                                  className="demo-primary"
                                  onClick={() =>
                                    run(
                                      {
                                        type: "transferIn",
                                        location: destination,
                                      },
                                      "Transfer In recorded. Expected and actual SNs match; location updated to Melbourne.",
                                    )
                                  }
                                >
                                  {zh("Confirm Transfer In")}
                                </button>
                              </>
                            ),
                          )}
                        </>
                      ),
                    )}
                  </Panel>
                  <Panel title={zh("Expected vs actual")}>
                    <p className="demo-large-number">
                      {zh(
                        transfer.status === "Draft"
                          ? transfer.serials.length - session.sentScans.length
                          : transfer.serials.length -
                              session.receivedScans.length,
                      )}
                      <span>{zh("missing scans")}</span>
                    </p>
                    <p>
                      {zh(
                        "Unexpected, duplicate and wrong SNs are rejected with an explanation. Source scans never count as destination receipt.",
                      )}
                    </p>
                    <Tag>
                      {zh(
                        transfer.status === "Draft"
                          ? "Source validation"
                          : "Destination validation",
                      )}
                    </Tag>
                  </Panel>
                </div>
              </>
            ),
          )}

          {zh(
            page === "Repair → Good" && (
              <div className="demo-two-col">
                <Panel title={zh("Repair completion")}>
                  <Scan
                    label={zh("Scan repair SN once")}
                    hint={zh("60E5M4805C3F242")}
                    onScan={(value) => {
                      const sn = value.trim().toUpperCase();
                      if (
                        !stock.repairJobs?.some((j) => j.serialNumber === sn)
                      ) {
                        setNotice({
                          text: "Receive this SN through Faulty Return first.",
                          error: true,
                        });
                        return false;
                      }
                      setRepairSn(sn);
                      setNotice(null);
                      return true;
                    }}
                  />
                  {zh(
                    repairJob && (
                      <>
                        <h3>{zh(repairSn)}</h3>
                        <Tag tone="amber">{zh(readable(repairJob.status))}</Tag>
                        <p>
                          {zh(repairJob.model)} ·{" "}
                          {zh(repairJob.currentLocation)}
                        </p>
                        {zh(
                          repairJob.status === "Pending_Repair" && (
                            <button
                              className="demo-primary"
                              onClick={() =>
                                run(
                                  { type: "startRepair", sn: repairSn },
                                  "Repair started. You can complete this unit without scanning it again.",
                                )
                              }
                            >
                              {zh("Start repair")}
                            </button>
                          ),
                        )}
                        {zh(
                          repairJob.status === "In_Repair" && (
                            <>
                              <label className="demo-field">
                                {zh("Target good-stock location")}
                                <select
                                  value={goodLocation}
                                  onChange={(e) =>
                                    setGoodLocation(e.target.value)
                                  }
                                >
                                  {zh(
                                    stock.locations
                                      .filter(
                                        (l) =>
                                          l.warehouseCode === "SYD" &&
                                          (!l.serviceZone || l.zone === "FLEX"),
                                      )
                                      .map((l) => (
                                        <option key={l.id}>{zh(l.code)}</option>
                                      )),
                                  )}
                                </select>
                              </label>
                              <button
                                className="demo-primary"
                                onClick={() =>
                                  run(
                                    {
                                      type: "completeRepair",
                                      sn: repairSn,
                                      location: goodLocation,
                                    },
                                    "Repair → Repair_Good complete. Same SN, same total physical quantity; audit and ledger recorded.",
                                  )
                                }
                              >
                                {zh("Mark repair completed")}
                              </button>
                            </>
                          ),
                        )}
                        {zh(
                          repairJob.status === "Repair_Good" && (
                            <div className="demo-success">
                              {zh("✓ Returned to usable stock at")}
                              {zh(" ")}
                              {zh(repairJob.currentLocation)}
                            </div>
                          ),
                        )}
                      </>
                    ),
                  )}
                </Panel>
                <Panel title={zh("Repair queue")}>
                  {zh(
                    stock.repairJobs?.length ? (
                      stock.repairJobs.map((j) => (
                        <article className="demo-return-row" key={j.id}>
                          <strong>{zh(j.serialNumber)}</strong>
                          <p>
                            {zh(j.model)} · {zh(j.currentLocation)}
                          </p>
                          <Tag>{zh(readable(j.status))}</Tag>
                        </article>
                      ))
                    ) : (
                      <div className="demo-empty">
                        <Wrench size={34} />
                        <h3>{zh("No units awaiting repair")}</h3>
                        <p>
                          {zh(
                            "Receive a faulty unit to create a native repair job.",
                          )}
                        </p>
                        <button onClick={() => navigate("Faulty Return")}>
                          {zh("Start faulty receiving")}
                        </button>
                      </div>
                    ),
                  )}
                  <p className="demo-footnote">
                    {zh(
                      "A condition change, separate from Transfer. Native repair must be In Repair before completion.",
                    )}
                  </p>
                </Panel>
              </div>
            ),
          )}

          {zh(
            page === "Warehouse Map" && (
              <>
                <div className="demo-map-toolbar">
                  <label>
                    {zh("Warehouse")}
                    {zh(" ")}
                    <select
                      value={mapWarehouse}
                      onChange={(e) => {
                        setMapWarehouse(e.target.value);
                        setLocation(
                          e.target.value === "SYD" ? "FLEX-01" : "RECEIVING-01",
                        );
                      }}
                    >
                      <option value="SYD">{zh("Sydney")}</option>
                      <option value="MEL">{zh("Melbourne")}</option>
                    </select>
                  </label>
                  <span>
                    {zh("Schematic · not to scale · click a location")}
                  </span>
                </div>
                <div className="demo-two-col demo-map-layout">
                  <Panel className="demo-floor">
                    <div className="demo-floor-top">
                      {zh("WAREHOUSE FLOOR")}
                      <span>{zh("↑ RECEIVING")}</span>
                    </div>
                    <div className="demo-racks">
                      {zh(
                        stock.locations
                          .filter(
                            (l) =>
                              l.warehouseCode === mapWarehouse &&
                              !l.serviceZone,
                          )
                          .map((l) => {
                            const detail = demoLocation(
                              stock,
                              l.code,
                              mapWarehouse,
                            );
                            return (
                              <button
                                key={l.id}
                                className={`demo-map-cell location-fixed ${location === l.code ? "selected" : ""}`}
                                onClick={() => setLocation(l.code)}
                              >
                                <strong>{zh(l.code)}</strong>
                                <span>
                                  {zh(detail.qty)}
                                  {zh("units")}
                                </span>
                                <small>{zh("Fixed location")}</small>
                              </button>
                            );
                          }),
                      )}
                    </div>
                    <div className="demo-aisle">{zh("CLEAR ACCESS AISLE")}</div>
                    <div className="demo-zones">
                      {zh(
                        stock.locations
                          .filter(
                            (l) =>
                              l.warehouseCode === mapWarehouse && l.serviceZone,
                          )
                          .map((l) => {
                            const detail = demoLocation(
                              stock,
                              l.code,
                              mapWarehouse,
                            );
                            const kind =
                              l.zone === "REPAIR"
                                ? "Repair area"
                                : l.zone === "DISPATCH"
                                  ? "Dispatch staging"
                                  : l.zone === "FLEX"
                                    ? "Flexible location"
                                    : l.zone === "QUARANTINE"
                                      ? "Quarantine"
                                      : "Temporary location";
                            return (
                              <button
                                key={l.id}
                                className={`demo-map-cell ${l.zone.toLowerCase()} ${location === l.code ? "selected" : ""}`}
                                onClick={() => setLocation(l.code)}
                              >
                                <strong>{zh(l.code)}</strong>
                                <span>
                                  {zh(detail.qty)}
                                  {zh("units")}
                                </span>
                                <small>{zh(kind)}</small>
                              </button>
                            );
                          }),
                      )}
                    </div>
                    <div className="demo-map-legend">
                      {zh(
                        [
                          "Fixed",
                          "Flexible",
                          "Temporary",
                          "Repair",
                          "Dispatch",
                          "Quarantine",
                        ].map((kind) => <Tag key={kind}>{zh(kind)}</Tag>),
                      )}
                    </div>
                  </Panel>
                  <Panel title={zh(location)}>
                    <Tag>{zh(selectedLocation.occupancy)}</Tag>
                    <p>
                      {zh(selectedLocation.location?.zone)} · {zh(mapWarehouse)}
                      {zh("· location entity")}
                    </p>
                    <div className="demo-mini-metrics">
                      <div>
                        <strong>{zh(selectedLocation.qty)}</strong>
                        {zh("Physical")}
                      </div>
                      <div>
                        <strong>{zh(selectedLocation.frozen)}</strong>
                        {zh("Frozen")}
                      </div>
                      <div>
                        <strong>{zh(selectedLocation.available)}</strong>
                        {zh("Available*")}
                      </div>
                    </div>
                    {zh(
                      selectedLocation.balances.map((b) => (
                        <article className="demo-return-row" key={b.id}>
                          <strong>{zh(b.model)}</strong>
                          <p>
                            {zh(b.sku)} · {zh(b.condition)}
                          </p>
                          <span>
                            {zh(b.physicalQty)}
                            {zh("physical /")}
                            {zh(b.frozenQty)}
                            {zh("frozen")}
                          </span>
                        </article>
                      )),
                    )}
                    <h3>{zh("SNs physically present")}</h3>
                    {zh(
                      selectedLocation.serials.length ? (
                        selectedLocation.serials.map((s) => (
                          <button
                            className="demo-sn-link"
                            key={s.id}
                            onClick={() => {
                              setTrace(s.serialNumber);
                              navigate("SN Trace");
                            }}
                          >
                            {zh(s.serialNumber)} ↗
                          </button>
                        ))
                      ) : (
                        <p>{zh("No SNs at this location.")}</p>
                      ),
                    )}
                    <h3>{zh("Recent movements")}</h3>
                    {zh(
                      selectedLocation.movements.map((t) => (
                        <p key={t.id}>
                          {zh(readable(t.type))} · {zh(t.qty)}
                          {zh("units ·")}
                          {zh(date(t.at))}
                        </p>
                      )),
                    )}
                    <p className="demo-footnote">
                      {zh(
                        "Occupancy is occupied / empty. Capacity is not configured. *Physical less frozen; Repair is not allocatable.",
                      )}
                    </p>
                  </Panel>
                </div>
              </>
            ),
          )}

          {zh(
            page === "SN Trace" && (
              <>
                <Panel>
                  <Scan
                    label={zh("Search by SN")}
                    hint={zh("EQ48S260700001")}
                    onScan={(value) => {
                      setTrace(value.trim().toUpperCase());
                      return true;
                    }}
                  />
                  <div className="demo-quick-links">
                    {zh(
                      [
                        "EQ48S260700001",
                        "60E5M4805C3F242",
                        "EQ48S260700003",
                      ].map((sn) => (
                        <button key={sn} onClick={() => setTrace(sn)}>
                          {zh(sn)}
                        </button>
                      )),
                    )}
                  </div>
                </Panel>
                {zh(
                  traceSerial ? (
                    <div className="demo-two-col">
                      <Panel title={zh(trace)}>
                        <Tag tone="green">
                          {zh(readable(traceSerial.status))}
                        </Tag>
                        <dl className="demo-facts">
                          <div>
                            <dt>{zh("Model / SKU")}</dt>
                            <dd>
                              {zh(traceSerial.model)}
                              <small>{zh(traceSerial.sku)}</small>
                            </dd>
                          </div>
                          <div>
                            <dt>{zh("Location")}</dt>
                            <dd>
                              {zh(traceSerial.warehouseCode ?? "—")} /{zh(" ")}
                              {zh(
                                traceSerial.locationCode ??
                                  "Outside physical stock",
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>{zh("Condition")}</dt>
                            <dd>{zh(traceSerial.condition)}</dd>
                          </div>
                          <div>
                            <dt>{zh("Business reference")}</dt>
                            <dd>
                              {zh(
                                traceSerial.relatedShNo ??
                                  traceSerial.relatedTransferNo ??
                                  "Documentation pending",
                              )}
                            </dd>
                          </div>
                        </dl>
                        <p>
                          {zh(
                            "SN-level lifecycle evidence connects identity, location and business movement.",
                          )}
                        </p>
                      </Panel>
                      <Panel title={zh("Lifecycle timeline")}>
                        <ol className="demo-timeline">
                          {zh(
                            events.map((event) => (
                              <li key={event.id}>
                                <div className="demo-timeline-dot" />
                                <time>
                                  {zh(date(event.at))}
                                  {zh("· Sydney")}
                                </time>
                                <h3>
                                  {zh(
                                    event.type === "Outbound"
                                      ? "Pickup / Outbound"
                                      : readable(event.type),
                                  )}
                                </h3>
                                <p>
                                  {zh(
                                    event.type === "Prepared"
                                      ? `${event.fromLocation} · frozen reservation; physically present`
                                      : `${event.fromLocation ?? "External"} → ${event.toLocation ?? "Outside source location"}`,
                                  )}
                                </p>
                                {zh(
                                  event.sourceCondition && (
                                    <p>
                                      {zh(event.sourceCondition)} →{" "}
                                      {zh(event.targetCondition)}
                                    </p>
                                  ),
                                )}
                                <p>
                                  {zh(
                                    event.businessReference ??
                                      "Synthetic opening baseline",
                                  )}
                                </p>
                                <small>
                                  {zh(event.actor)} · {zh(event.result)}
                                </small>
                              </li>
                            )),
                          )}
                        </ol>
                        {zh(
                          !events.length && (
                            <div className="demo-empty">
                              <p>
                                {zh(
                                  "No warehouse movements recorded in this reset session. Historical identity reference:",
                                )}
                                {zh(" ")}
                                {zh(traceSerial.relatedShNo ?? "not available")}
                                .
                              </p>
                              <button onClick={() => navigate("Faulty Return")}>
                                {zh("Receive this return")}
                              </button>
                            </div>
                          ),
                        )}
                      </Panel>
                    </div>
                  ) : (
                    <Panel title={zh("SN not found")}>
                      <p>
                        {zh(
                          "Check the serial or use one of the synthetic examples above.",
                        )}
                      </p>
                    </Panel>
                  ),
                )}
              </>
            ),
          )}

          {zh(
            page === "Audit / Exceptions" && (
              <>
                <div className="demo-map-toolbar">
                  <div className="demo-tabs">
                    <button
                      className={!samples ? "selected" : ""}
                      onClick={() => setSamples(false)}
                    >
                      {zh("Live demo checks")}
                    </button>
                    <button
                      className={samples ? "selected" : ""}
                      onClick={() => setSamples(true)}
                    >
                      {zh("Sample discrepancies")}
                    </button>
                  </div>
                  <Tag tone={samples ? "amber" : "green"}>
                    {zh(
                      samples
                        ? "Read-only inconsistent sample"
                        : "Deterministic rules",
                    )}
                  </Tag>
                </div>
                {zh(
                  samples && (
                    <p>
                      {zh(
                        "These deliberately inconsistent fixtures demonstrate detection. They do not change the live demo inventory.",
                      )}
                    </p>
                  ),
                )}
                <div className="demo-issues">
                  {zh(
                    issues.map((issue, index) => (
                      <Panel key={`${issue.code}-${index}`}>
                        <div className="demo-card-head">
                          <Tag tone="amber">{zh(issue.severity)}</Tag>
                          <Tag>{zh(issue.status)}</Tag>
                        </div>
                        <h3>
                          {zh(
                            readable(issue.code)
                              .toLowerCase()
                              .replace(/\b\w/g, (character) =>
                                character.toUpperCase(),
                              )
                              .replace("Sn", "SN")
                              .replace("Sh", "SH"),
                          )}
                        </h3>
                        <code>{zh(issue.reference)}</code>
                        <p>{zh(issue.reason)}</p>
                        <div className="demo-investigate">
                          <strong>{zh("Suggested investigation")}</strong>
                          <p>{zh(issue.investigation)}</p>
                        </div>
                      </Panel>
                    )),
                  )}
                </div>
                {zh(
                  !issues.length && (
                    <Panel>
                      <div className="demo-empty">
                        <ShieldCheck size={42} />
                        <h2>{zh("No unresolved exceptions")}</h2>
                        <p>
                          {zh(
                            "SN coverage, outbound status, repair state, transfer age, balance validity and ledger reconciliation checks passed.",
                          )}
                        </p>
                        <button onClick={() => setSamples(true)}>
                          {zh("Inspect sample discrepancies")}
                        </button>
                      </div>
                    </Panel>
                  ),
                )}
                <Panel title={zh("Immutable operation evidence")}>
                  {zh(
                    stock.audit.length ? (
                      stock.audit.slice(0, 15).map((a) => (
                        <div className="demo-audit-row" key={a.id}>
                          <time>{zh(date(a.at))}</time>
                          <div>
                            <strong>{zh(a.operation)}</strong>
                            <p>
                              {zh(a.businessReference)} · {zh(a.remark)}
                            </p>
                            <small>{zh(a.actor)}</small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>{zh("Run a scenario to generate audit evidence.")}</p>
                    ),
                  )}
                </Panel>
              </>
            ),
          )}

          {zh(
            page === "AI Audit Concept" && (
              <>
                <div className="demo-concept-banner">
                  <Sparkles size={24} />
                  <div>
                    <strong>{zh("Concept Preview")}</strong>
                    <p>
                      {zh(
                        "Mocked structured analysis. No external AI API. No inventory write access.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="demo-flow">
                  {zh(
                    [
                      "Structured Data",
                      "Audit Rules",
                      "Exception Queue",
                      "AI Analysis",
                      "Human Decision",
                    ].map((label, i) => (
                      <div key={label}>
                        <span>{zh(i + 1)}</span>
                        {zh(label)}
                      </div>
                    )),
                  )}
                </div>
                <div className="demo-two-col">
                  <Panel title={zh("Explore an example question")}>
                    {zh(
                      [
                        "Why does Repair inventory differ by 7 units?",
                        "What SNs were dispatched but still appear in stock?",
                        "Which transfers are overdue?",
                        "Show unresolved exceptions today.",
                      ].map((q) => (
                        <button
                          className="demo-question"
                          key={q}
                          onClick={() => setQuestion(q)}
                        >
                          {zh(q)}
                          <ArrowRight size={18} />
                        </button>
                      )),
                    )}
                  </Panel>
                  <Panel title={zh("Mock analysis")}>
                    {zh(
                      question ? (
                        <>
                          <Tag tone="amber">
                            {zh("Concept Preview · illustrative response")}
                          </Tag>
                          <h3>{zh(question)}</h3>
                          {zh(
                            question.includes("7") ? (
                              <>
                                <p>
                                  {zh(
                                    "The seven-unit discrepancy is an illustrative scenario, not a claim about current demo balances.",
                                  )}
                                </p>
                                <dl className="demo-facts">
                                  <div>
                                    <dt>
                                      {zh("Repair → Good residual records")}
                                    </dt>
                                    <dd>{zh("5 units")}</dd>
                                  </div>
                                  <div>
                                    <dt>{zh("Outbound status not closed")}</dt>
                                    <dd>{zh("1 unit")}</dd>
                                  </div>
                                  <div>
                                    <dt>{zh("Transfer not completed")}</dt>
                                    <dd>{zh("1 unit")}</dd>
                                  </div>
                                </dl>
                                <p>
                                  {zh(
                                    "Human action: inspect each SN, compare completion and movement evidence, and approve any correcting operation.",
                                  )}
                                </p>
                              </>
                            ) : (
                              <>
                                <p>
                                  {zh(auditDemo(stock).length)}
                                  {zh(
                                    "unresolved exception(s) in the live synthetic session.",
                                  )}
                                </p>
                                {zh(
                                  auditDemo(stock)
                                    .filter((i) =>
                                      question.includes("transfers")
                                        ? i.code === "TRANSFER_NOT_RECEIVED"
                                        : question.includes("dispatched")
                                          ? i.code ===
                                            "OUTBOUND_STATUS_MISMATCH"
                                          : true,
                                    )
                                    .map((i, n) => (
                                      <p key={n}>
                                        <strong>{zh(i.reference)}</strong> —{" "}
                                        {zh(i.reason)}
                                      </p>
                                    )),
                                )}
                                <p>
                                  {zh(
                                    "Review the exception queue and supporting transaction history before making a decision.",
                                  )}
                                </p>
                              </>
                            ),
                          )}
                          <small>
                            {zh(
                              "No inventory changes made. Answers are fixed templates with deterministic demo counts.",
                            )}
                          </small>
                        </>
                      ) : (
                        <div className="demo-empty">
                          <Sparkles size={38} />
                          <p>
                            {zh(
                              "Select a question to show the proposed analysis format.",
                            )}
                          </p>
                        </div>
                      ),
                    )}
                  </Panel>
                </div>
              </>
            ),
          )}

          {zh(
            page === "Inventory" && (
              <Panel title={zh("Inventory position")}>
                <p>
                  {zh(
                    "All warehouses · product and material · balances are the quantity authority.",
                  )}
                </p>
                <div className="demo-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {zh(
                          [
                            "Location",
                            "Model / SKU",
                            "Condition",
                            "Physical",
                            "Frozen",
                            "Available*",
                            "In Transit",
                          ].map((h) => <th key={h}>{zh(h)}</th>),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {zh(
                        stock.inventory.map((b) => (
                          <tr key={b.id}>
                            <td>
                              <strong>{zh(b.locationCode)}</strong>
                              <small>{zh(b.warehouseCode)}</small>
                            </td>
                            <td>
                              {zh(b.model)}
                              <small>{zh(b.sku)}</small>
                            </td>
                            <td>
                              <Tag>{zh(b.condition)}</Tag>
                            </td>
                            <td>{zh(b.physicalQty)}</td>
                            <td>{zh(b.frozenQty)}</td>
                            <td>{zh(b.availableQty)}</td>
                            <td>{zh(b.inTransitQty)}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="demo-footnote">
                  {zh(
                    "*Physical less Frozen; Repair inventory remains non-allocatable. Product and material units are included.",
                  )}
                </p>
              </Panel>
            ),
          )}

          {zh(
            page === "Reporting" && (
              <>
                <div className="demo-metrics">
                  {zh(
                    Object.entries(metrics).map(([label, value]) => (
                      <div key={label}>
                        <span>{zh(label)}</span>
                        <strong>{zh(value)}</strong>
                        <small>
                          {zh(
                            label.includes("Pending") ||
                              label.includes("Exceptions") ||
                              label.includes("Backlog")
                              ? "Demo records"
                              : "Demo units",
                          )}
                        </small>
                      </div>
                    )),
                  )}
                </div>
                <Panel title={zh("Movement reporting")}>
                  <div className="demo-tabs">
                    <button
                      className={period === 7 ? "selected" : ""}
                      onClick={() => setPeriod(7)}
                    >
                      {zh("Last 7 days")}
                    </button>
                    <button
                      className={period === 30 ? "selected" : ""}
                      onClick={() => setPeriod(30)}
                    >
                      {zh("Last 30 days")}
                    </button>
                  </div>
                  <p>
                    {zh(
                      "Rolling period · Sydney display time · outbound uses actual outboundAt. Current balances above are not historical closing balances.",
                    )}
                  </p>
                  {zh(
                    movements.length ? (
                      movements.map((m) => (
                        <div className="demo-audit-row" key={m.id}>
                          <time>{zh(date(m.at))}</time>
                          <div>
                            <strong>
                              {zh(readable(m.type))} · {zh(m.qty)}
                              {zh("units")}
                            </strong>
                            <p>
                              {zh(m.businessReference ?? m.sku)} ·{" "}
                              {zh(m.warehouseCode)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="demo-empty">
                        <p>
                          {zh(
                            "No movements in this reset session. Run a warehouse scenario to populate the report.",
                          )}
                        </p>
                      </div>
                    ),
                  )}
                  <div className="demo-concept-banner">
                    <LayoutDashboard size={24} />
                    <div>
                      <strong>{zh("Reporting concept")}</strong>
                      <p>
                        {zh(
                          "Structured WMS data → automated reporting → future BI → future AI querying. Scheduled reports and BI connections are not implemented.",
                        )}
                      </p>
                    </div>
                  </div>
                </Panel>
              </>
            ),
          )}
          <footer className="demo-footer">
            <span>{zh("SN-first traceability · system-driven execution")}</span>
            <span>
              {zh(
                "Synthetic browser session · refresh or Reset Demo restores fixtures",
              )}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
