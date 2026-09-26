"use client";

import Link from "next/link";
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
  new Intl.DateTimeFormat("en-AU", {
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
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
function Tag({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return <span className={`demo-tag ${tone}`}>{children}</span>;
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
        <span>{label}</span>
        <div>
          <ScanLine size={23} />
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hint}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            aria-label={label}
          />
        </div>
      </label>
      <button disabled={disabled || !value.trim()} className="demo-primary">
        Verify scan <ArrowRight size={18} />
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
    <div className="leadership-demo">
      <aside className="demo-sidebar">
        <Link className="demo-brand" href="/demo">
          <Warehouse size={30} />
          <span>
            WMS<span>WORKFLOW PREVIEW</span>
          </span>
        </Link>
        <div className="demo-site">
          <span className="demo-live-dot" /> {warehouseContext}
          <small>
            {warehouseContext === "All warehouses"
              ? "Consolidated view"
              : "Current task context"}
          </small>
        </div>
        <nav aria-label="Demo workflows">
          {pages.map(([name, Icon]) => (
            <button
              key={name}
              onClick={() => navigate(name)}
              className={page === name ? "active" : ""}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
            </button>
          ))}
        </nav>
        <div className="demo-sidebar-bottom">
          <Tag tone="amber">Prototype / Demo Data</Tag>
          <p>Synthetic session · no ERP connection</p>
          <Link href="/dashboard">Existing operational preview ↗</Link>
        </div>
      </aside>
      <div className="demo-main">
        <header className="demo-topbar">
          <div>
            <span>WMS Workflow Preview</span>
            <b>
              {warehouseContext} <span>/</span> Leadership demo
            </b>
          </div>
          <button className="demo-reset" onClick={reset}>
            <RotateCcw size={16} />
            Reset Demo
          </button>
        </header>
        <main key={generation} className="demo-content">
          <div className="demo-heading">
            <div>
              <p className="demo-eyebrow">
                WAREHOUSE EXECUTION /{" "}
                {String(pages.findIndex((p) => p[0] === page) + 1).padStart(
                  2,
                  "0",
                )}
              </p>
              <h1>
                {page === "Overview" ? "Every unit. Every movement." : page}
              </h1>
              <p>{pages.find((p) => p[0] === page)?.[2]}</p>
            </div>
            <Tag tone="green">Prototype / Demo Data</Tag>
          </div>
          {notice && (
            <div
              role={notice.error ? "alert" : "status"}
              className={`demo-notice ${notice.error ? "error" : ""}`}
            >
              <span>{notice.error ? "Action required" : "Confirmed"}</span>
              {notice.text}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice(null)}
              >
                ×
              </button>
            </div>
          )}

          {page === "Overview" && (
            <>
              <div className="demo-hero">
                <div>
                  <p className="demo-eyebrow">NEXT TASK · SYDNEY</p>
                  <h2>
                    {orderStatus === "To prepare"
                      ? "Prepare the service replacement."
                      : session.collection
                        ? "Collection complete. Keep work moving."
                        : "Two units ready. Verify collection."}
                  </h2>
                  <p>{order.shNo} · EQ4800-S · 2 units · FLEX-01</p>
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
                    {orderStatus === "To prepare"
                      ? "Start Pick Task"
                      : "Open pickup"}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <div className="demo-hero-mark">
                  <ScanLine size={78} strokeWidth={1} />
                  <span>SCAN. VERIFY. COMPLETE.</span>
                </div>
              </div>
              <div className="demo-metrics">
                {Object.entries(metrics)
                  .slice(0, 6)
                  .map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>Demo units · all warehouses</small>
                    </div>
                  ))}
              </div>
              <div className="demo-section-title">
                <h2>Leadership demo scenarios</h2>
                <span>Run a workflow. Inspect the evidence. Reset.</span>
              </div>
              <div className="demo-scenarios">
                {pages.slice(1, 10).map(([name, Icon, description], index) => (
                  <button key={name} onClick={() => navigate(name)}>
                    <div>
                      <Icon size={22} />
                      <small>{String(index + 1).padStart(2, "0")}</small>
                    </div>
                    <h3>{name}</h3>
                    <p>{description}</p>
                    <span>
                      Start Demo <ArrowRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {page === "Outbound" && (
            <>
              <div className="demo-flow">
                {[
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
                    <span>{index + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
              <div className="demo-two-col">
                <Panel title="Pick task">
                  <div className="demo-card-head">
                    <strong>{order.shNo}</strong>
                    <Tag tone={line.preparedQty ? "green" : "amber"}>
                      {orderStatus}
                    </Tag>
                  </div>
                  <dl className="demo-facts">
                    <div>
                      <dt>Model / SKU</dt>
                      <dd>
                        {line.model}
                        <small>{line.sku}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Required quantity</dt>
                      <dd>2 units · New</dd>
                    </div>
                    <div>
                      <dt>Suggested location</dt>
                      <dd className="demo-location-code">FLEX-01</dd>
                    </div>
                    <div>
                      <dt>Pickup code</dt>
                      <dd>{order.pickupCode}</dd>
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
                    {session.locationVerified
                      ? "✓ Location verified"
                      : "Location verification pending"}{" "}
                    · SN {session.pickScans.length}/2
                  </p>
                  <ul className="demo-evidence">
                    {session.pickScans.map((sn) => (
                      <li key={sn}>
                        <Check size={17} />
                        {sn}
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel title="Next action" className="demo-action-panel">
                  {line.preparedQty === 2 ? (
                    <div className="demo-complete">
                      <PackageCheck size={46} />
                      <h2>{orderStatus}</h2>
                      <p>
                        {session.collection
                          ? "Task completed. Pickup evidence is recorded."
                          : "Physical stock unchanged. Two units frozen for collection."}
                      </p>
                      <button
                        className="demo-primary"
                        onClick={() => navigate("Digital Pickup")}
                      >
                        Continue to pickup <ArrowRight size={18} />
                      </button>
                      <button onClick={() => window.print()}>
                        Print batch pickup label
                      </button>
                      <div className="demo-print-label">
                        <h2>Pickup {order.pickupCode}</h2>
                        <p>{order.shNo}</p>
                        <p>
                          {line.sku} · {line.model} · {order.erpWarehouse}
                        </p>
                        <strong>2 units · FLEX-01</strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="demo-eyebrow">
                        {session.locationVerified
                          ? "02 / SCAN SN"
                          : "01 / GO TO LOCATION"}
                      </p>
                      <h3>
                        {session.locationVerified
                          ? "Scan the next unit."
                          : "Go to FLEX-01."}
                      </h3>
                      <Scan
                        key={session.locationVerified ? "sn" : "location"}
                        label={
                          session.locationVerified
                            ? "Scan unit SN"
                            : "Scan location QR / code"
                        }
                        hint={
                          session.locationVerified
                            ? "EQ48S260700001"
                            : "FLEX-01"
                        }
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
                        <strong>Presenter scan values</strong>
                        <code>FLEX-01</code>
                        <code>EQ48S260700001</code>
                        <code>EQ48S260700002</code>
                        <p>
                          Type or paste a value, then press Enter. Location QR
                          scanners supply the location code.
                        </p>
                      </div>
                    </>
                  )}
                </Panel>
              </div>
            </>
          )}

          {page === "Digital Pickup" && (
            <div className="demo-two-col">
              <Panel title="Collection verification">
                <Tag tone="amber">Prototype workflow · simulated identity</Tag>
                <div className="demo-tabs">
                  <button
                    className={pickupKind === "Engineer" ? "selected" : ""}
                    onClick={() => setPickupKind("Engineer")}
                  >
                    Engineer pickup
                  </button>
                  <button
                    className={pickupKind === "Driver" ? "selected" : ""}
                    onClick={() => setPickupKind("Driver")}
                  >
                    Logistics driver
                  </button>
                </div>
                {pickupKind === "Engineer" ? (
                  <dl className="demo-facts">
                    <div>
                      <dt>Engineer</dt>
                      <dd>
                        Alex Chen <small>Simulated after-sales identity</small>
                      </dd>
                    </div>
                    <div>
                      <dt>After-sales order / shipment</dt>
                      <dd>{order.shNo}</dd>
                    </div>
                    <div>
                      <dt>Authorised</dt>
                      <dd>Yes · demo grant for this shipment</dd>
                    </div>
                  </dl>
                ) : (
                  <>
                    <label className="demo-field">
                      Enter / scan Pickup Order Number
                      <input
                        value={pickupReference}
                        onChange={(e) => setPickupReference(e.target.value)}
                        placeholder="SYD-00265"
                      />
                    </label>
                    <label className="demo-field">
                      Driver / carrier handover name
                      <input
                        value={collector}
                        onChange={(e) => setCollector(e.target.value)}
                        placeholder="Enter collector name"
                      />
                    </label>
                    <p>
                      No company identity required. Shipment reference and
                      readiness are validated.
                    </p>
                  </>
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
                  {pickupKind === "Engineer"
                    ? "Confirm Collection"
                    : "Confirm Handover"}
                  <Check size={18} />
                </button>
                {order.status === "Ready" && (
                  <p>
                    Complete the{" "}
                    <button
                      className="demo-text-button"
                      onClick={() => navigate("Outbound")}
                    >
                      pick task
                    </button>{" "}
                    first.
                  </p>
                )}
              </Panel>
              <Panel title="Shipment evidence">
                <Tag tone={session.collection ? "green" : "amber"}>
                  {orderStatus}
                </Tag>
                <h3>{order.shNo}</h3>
                <p>Pickup {order.pickupCode}</p>
                <ul className="demo-evidence">
                  {line.scannedSerials.length ? (
                    line.scannedSerials.map((sn) => (
                      <li key={sn}>
                        <PackageCheck size={18} />
                        {sn}{" "}
                        <Tag>
                          {
                            stock.serials.find((s) => s.serialNumber === sn)
                              ?.status
                          }
                        </Tag>
                      </li>
                    ))
                  ) : (
                    <li>No prepared units yet.</li>
                  )}
                </ul>
                {session.collection && (
                  <div className="demo-success">
                    <h3>Pickup Verified</h3>
                    <p>
                      {session.collection.collector} · {session.collection.kind}
                    </p>
                    <p>{date(session.collection.at)} Sydney time</p>
                    <p>
                      Shipment → Collected
                      <br />
                      SN → Outbound
                      <br />
                      Order / task → Completed
                    </p>
                  </div>
                )}
                <p className="demo-footnote">
                  Pickup confirmation is the dispatch event. The mock identity
                  is not real authentication.
                </p>
              </Panel>
            </div>
          )}

          {page === "Faulty Return" && (
            <div className="demo-two-col">
              <Panel title="Receive faulty units">
                <label className="demo-field">
                  Single SN or multiple SNs
                  <textarea
                    value={returnText}
                    onChange={(e) => setReturnText(e.target.value)}
                    rows={4}
                  />
                </label>
                <div className="demo-hint">
                  <strong>Demo fixtures</strong>
                  <code>60E5M4805C3F242</code>
                  <span>Matched SH / order</span>
                  <code>DEMO-RETURN-NO-SH</code>
                  <span>Known unit identity; documentation missing</span>
                </div>
                <label className="demo-field">
                  Confirm physical repair location
                  <input
                    value={returnLocation}
                    onChange={(e) => setReturnLocation(e.target.value)}
                    placeholder="Scan / enter REPAIR-01"
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
                  Receive physically <ArrowRight size={18} />
                </button>
              </Panel>
              <Panel title="Identity & history lookup">
                {returnRows.length ? (
                  returnRows.map((row, i) => (
                    <article className="demo-return-row" key={`${row.sn}-${i}`}>
                      <strong>{row.sn}</strong>
                      <Tag tone={row.serial?.relatedShNo ? "green" : "amber"}>
                        {row.serial?.relatedShNo
                          ? "Matched"
                          : "Documentation pending"}
                      </Tag>
                      <p>
                        {row.serial?.model ??
                          "Unknown identity — no SKU inferred"}{" "}
                        · {row.serial?.sku ?? "—"}
                      </p>
                      <p>
                        SH / order:{" "}
                        {row.serial?.relatedShNo || "Missing SH reference"}
                      </p>
                      <p>
                        Existing status: {row.serial?.status ?? "Unresolved"}
                      </p>
                      {!row.serial?.relatedShNo && (
                        <small>
                          Physical receiving is permitted for the known demo
                          unit. After-sales must complete business
                          documentation.
                        </small>
                      )}
                    </article>
                  ))
                ) : (
                  <p>Enter an SN to inspect its history.</p>
                )}
                <button onClick={() => navigate("Repair → Good")}>
                  Open repair queue <ArrowRight size={16} />
                </button>
              </Panel>
            </div>
          )}

          {page === "Transfer" && (
            <>
              <div className="demo-transfer-route">
                <div>
                  <small>SOURCE WAREHOUSE</small>
                  <h2>Sydney</h2>
                  <span>FLEX-01</span>
                </div>
                <div>
                  <Truck size={30} />
                  <Tag
                    tone={transfer.status === "Received" ? "green" : "amber"}
                  >
                    {readable(transfer.status)}
                  </Tag>
                </div>
                <div>
                  <small>DESTINATION WAREHOUSE</small>
                  <h2>Melbourne</h2>
                  <span>{transfer.destinationLocation ?? "RECEIVING-01"}</span>
                </div>
              </div>
              <Panel>
                <div className="demo-card-head">
                  <h2>{transfer.transferNo}</h2>
                  <span>EQ4800-S · 1 unit · New</span>
                </div>
                <div className="demo-three-col">
                  {[
                    ["Expected SN list", transfer.serials],
                    ["Sent SN scans", session.sentScans],
                    ["Received SN scans", session.receivedScans],
                  ].map(([title, sns]) => (
                    <div className="demo-sn-list" key={title as string}>
                      <h3>{title}</h3>
                      {(sns as string[]).length ? (
                        (sns as string[]).map((sn) => (
                          <code key={sn}>{sn}</code>
                        ))
                      ) : (
                        <p>No scan evidence yet</p>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="demo-two-col">
                <Panel
                  title={
                    transfer.status === "Draft"
                      ? "Sydney · source task"
                      : "Melbourne · receiving task"
                  }
                >
                  {transfer.status === "Received" ? (
                    <div className="demo-complete">
                      <Check size={40} />
                      <h3>Transfer complete</h3>
                      <p>
                        SN located at Melbourne / {transfer.destinationLocation}
                        .
                      </p>
                    </div>
                  ) : (
                    <>
                      <Scan
                        key={transfer.status}
                        label={
                          transfer.status === "Draft"
                            ? "Scan source SN"
                            : "Scan actual destination SN"
                        }
                        hint="EQ48S260700003"
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
                      {transfer.status === "Draft" ? (
                        <button
                          className="demo-primary"
                          onClick={() =>
                            run(
                              { type: "transferOut" },
                              "Transfer Out recorded. Unit is In Transit; Melbourne has a receiving task.",
                            )
                          }
                        >
                          Confirm Transfer Out
                        </button>
                      ) : (
                        <>
                          <label className="demo-field">
                            Destination location
                            <input
                              value={destination}
                              onChange={(e) => setDestination(e.target.value)}
                              placeholder="RECEIVING-01"
                            />
                          </label>
                          <button
                            className="demo-primary"
                            onClick={() =>
                              run(
                                { type: "transferIn", location: destination },
                                "Transfer In recorded. Expected and actual SNs match; location updated to Melbourne.",
                              )
                            }
                          >
                            Confirm Transfer In
                          </button>
                        </>
                      )}
                    </>
                  )}
                </Panel>
                <Panel title="Expected vs actual">
                  <p className="demo-large-number">
                    {transfer.status === "Draft"
                      ? transfer.serials.length - session.sentScans.length
                      : transfer.serials.length - session.receivedScans.length}
                    <span>missing scans</span>
                  </p>
                  <p>
                    Unexpected, duplicate and wrong SNs are rejected with an
                    explanation. Source scans never count as destination
                    receipt.
                  </p>
                  <Tag>
                    {transfer.status === "Draft"
                      ? "Source validation"
                      : "Destination validation"}
                  </Tag>
                </Panel>
              </div>
            </>
          )}

          {page === "Repair → Good" && (
            <div className="demo-two-col">
              <Panel title="Repair completion">
                <Scan
                  label="Scan repair SN once"
                  hint="60E5M4805C3F242"
                  onScan={(value) => {
                    const sn = value.trim().toUpperCase();
                    if (!stock.repairJobs?.some((j) => j.serialNumber === sn)) {
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
                {repairJob && (
                  <>
                    <h3>{repairSn}</h3>
                    <Tag tone="amber">{readable(repairJob.status)}</Tag>
                    <p>
                      {repairJob.model} · {repairJob.currentLocation}
                    </p>
                    {repairJob.status === "Pending_Repair" && (
                      <button
                        className="demo-primary"
                        onClick={() =>
                          run(
                            { type: "startRepair", sn: repairSn },
                            "Repair started. You can complete this unit without scanning it again.",
                          )
                        }
                      >
                        Start repair
                      </button>
                    )}
                    {repairJob.status === "In_Repair" && (
                      <>
                        <label className="demo-field">
                          Target good-stock location
                          <select
                            value={goodLocation}
                            onChange={(e) => setGoodLocation(e.target.value)}
                          >
                            {stock.locations
                              .filter(
                                (l) =>
                                  l.warehouseCode === "SYD" &&
                                  (!l.serviceZone || l.zone === "FLEX"),
                              )
                              .map((l) => (
                                <option key={l.id}>{l.code}</option>
                              ))}
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
                          Mark repair completed
                        </button>
                      </>
                    )}
                    {repairJob.status === "Repair_Good" && (
                      <div className="demo-success">
                        ✓ Returned to usable stock at{" "}
                        {repairJob.currentLocation}
                      </div>
                    )}
                  </>
                )}
              </Panel>
              <Panel title="Repair queue">
                {stock.repairJobs?.length ? (
                  stock.repairJobs.map((j) => (
                    <article className="demo-return-row" key={j.id}>
                      <strong>{j.serialNumber}</strong>
                      <p>
                        {j.model} · {j.currentLocation}
                      </p>
                      <Tag>{readable(j.status)}</Tag>
                    </article>
                  ))
                ) : (
                  <div className="demo-empty">
                    <Wrench size={34} />
                    <h3>No units awaiting repair</h3>
                    <p>Receive a faulty unit to create a native repair job.</p>
                    <button onClick={() => navigate("Faulty Return")}>
                      Start faulty receiving
                    </button>
                  </div>
                )}
                <p className="demo-footnote">
                  A condition change, separate from Transfer. Native repair must
                  be In Repair before completion.
                </p>
              </Panel>
            </div>
          )}

          {page === "Warehouse Map" && (
            <>
              <div className="demo-map-toolbar">
                <label>
                  Warehouse{" "}
                  <select
                    value={mapWarehouse}
                    onChange={(e) => {
                      setMapWarehouse(e.target.value);
                      setLocation(
                        e.target.value === "SYD" ? "FLEX-01" : "RECEIVING-01",
                      );
                    }}
                  >
                    <option value="SYD">Sydney</option>
                    <option value="MEL">Melbourne</option>
                  </select>
                </label>
                <span>Schematic · not to scale · click a location</span>
              </div>
              <div className="demo-two-col demo-map-layout">
                <Panel className="demo-floor">
                  <div className="demo-floor-top">
                    WAREHOUSE FLOOR <span>↑ RECEIVING</span>
                  </div>
                  <div className="demo-racks">
                    {stock.locations
                      .filter(
                        (l) =>
                          l.warehouseCode === mapWarehouse && !l.serviceZone,
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
                            <strong>{l.code}</strong>
                            <span>{detail.qty} units</span>
                            <small>Fixed location</small>
                          </button>
                        );
                      })}
                  </div>
                  <div className="demo-aisle">CLEAR ACCESS AISLE</div>
                  <div className="demo-zones">
                    {stock.locations
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
                            <strong>{l.code}</strong>
                            <span>{detail.qty} units</span>
                            <small>{kind}</small>
                          </button>
                        );
                      })}
                  </div>
                  <div className="demo-map-legend">
                    {[
                      "Fixed",
                      "Flexible",
                      "Temporary",
                      "Repair",
                      "Dispatch",
                      "Quarantine",
                    ].map((kind) => (
                      <Tag key={kind}>{kind}</Tag>
                    ))}
                  </div>
                </Panel>
                <Panel title={location}>
                  <Tag>{selectedLocation.occupancy}</Tag>
                  <p>
                    {selectedLocation.location?.zone} · {mapWarehouse} ·
                    location entity
                  </p>
                  <div className="demo-mini-metrics">
                    <div>
                      <strong>{selectedLocation.qty}</strong>Physical
                    </div>
                    <div>
                      <strong>{selectedLocation.frozen}</strong>Frozen
                    </div>
                    <div>
                      <strong>{selectedLocation.available}</strong>Available*
                    </div>
                  </div>
                  {selectedLocation.balances.map((b) => (
                    <article className="demo-return-row" key={b.id}>
                      <strong>{b.model}</strong>
                      <p>
                        {b.sku} · {b.condition}
                      </p>
                      <span>
                        {b.physicalQty} physical / {b.frozenQty} frozen
                      </span>
                    </article>
                  ))}
                  <h3>SNs physically present</h3>
                  {selectedLocation.serials.length ? (
                    selectedLocation.serials.map((s) => (
                      <button
                        className="demo-sn-link"
                        key={s.id}
                        onClick={() => {
                          setTrace(s.serialNumber);
                          navigate("SN Trace");
                        }}
                      >
                        {s.serialNumber} ↗
                      </button>
                    ))
                  ) : (
                    <p>No SNs at this location.</p>
                  )}
                  <h3>Recent movements</h3>
                  {selectedLocation.movements.map((t) => (
                    <p key={t.id}>
                      {readable(t.type)} · {t.qty} units · {date(t.at)}
                    </p>
                  ))}
                  <p className="demo-footnote">
                    Occupancy is occupied / empty. Capacity is not configured.
                    *Physical less frozen; Repair is not allocatable.
                  </p>
                </Panel>
              </div>
            </>
          )}

          {page === "SN Trace" && (
            <>
              <Panel>
                <Scan
                  label="Search by SN"
                  hint="EQ48S260700001"
                  onScan={(value) => {
                    setTrace(value.trim().toUpperCase());
                    return true;
                  }}
                />
                <div className="demo-quick-links">
                  {["EQ48S260700001", "60E5M4805C3F242", "EQ48S260700003"].map(
                    (sn) => (
                      <button key={sn} onClick={() => setTrace(sn)}>
                        {sn}
                      </button>
                    ),
                  )}
                </div>
              </Panel>
              {traceSerial ? (
                <div className="demo-two-col">
                  <Panel title={trace}>
                    <Tag tone="green">{readable(traceSerial.status)}</Tag>
                    <dl className="demo-facts">
                      <div>
                        <dt>Model / SKU</dt>
                        <dd>
                          {traceSerial.model}
                          <small>{traceSerial.sku}</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Location</dt>
                        <dd>
                          {traceSerial.warehouseCode ?? "—"} /{" "}
                          {traceSerial.locationCode ?? "Outside physical stock"}
                        </dd>
                      </div>
                      <div>
                        <dt>Condition</dt>
                        <dd>{traceSerial.condition}</dd>
                      </div>
                      <div>
                        <dt>Business reference</dt>
                        <dd>
                          {traceSerial.relatedShNo ??
                            traceSerial.relatedTransferNo ??
                            "Documentation pending"}
                        </dd>
                      </div>
                    </dl>
                    <p>
                      SN-level lifecycle evidence connects identity, location
                      and business movement.
                    </p>
                  </Panel>
                  <Panel title="Lifecycle timeline">
                    <ol className="demo-timeline">
                      {events.map((event) => (
                        <li key={event.id}>
                          <div className="demo-timeline-dot" />
                          <time>{date(event.at)} · Sydney</time>
                          <h3>
                            {event.type === "Outbound"
                              ? "Pickup / Outbound"
                              : readable(event.type)}
                          </h3>
                          <p>
                            {event.type === "Prepared"
                              ? `${event.fromLocation} · frozen reservation; physically present`
                              : `${event.fromLocation ?? "External"} → ${event.toLocation ?? "Outside source location"}`}
                          </p>
                          {event.sourceCondition && (
                            <p>
                              {event.sourceCondition} → {event.targetCondition}
                            </p>
                          )}
                          <p>
                            {event.businessReference ??
                              "Synthetic opening baseline"}
                          </p>
                          <small>
                            {event.actor} · {event.result}
                          </small>
                        </li>
                      ))}
                    </ol>
                    {!events.length && (
                      <div className="demo-empty">
                        <p>
                          No warehouse movements recorded in this reset session.
                          Historical identity reference:{" "}
                          {traceSerial.relatedShNo ?? "not available"}.
                        </p>
                        <button onClick={() => navigate("Faulty Return")}>
                          Receive this return
                        </button>
                      </div>
                    )}
                  </Panel>
                </div>
              ) : (
                <Panel title="SN not found">
                  <p>
                    Check the serial or use one of the synthetic examples above.
                  </p>
                </Panel>
              )}
            </>
          )}

          {page === "Audit / Exceptions" && (
            <>
              <div className="demo-map-toolbar">
                <div className="demo-tabs">
                  <button
                    className={!samples ? "selected" : ""}
                    onClick={() => setSamples(false)}
                  >
                    Live demo checks
                  </button>
                  <button
                    className={samples ? "selected" : ""}
                    onClick={() => setSamples(true)}
                  >
                    Sample discrepancies
                  </button>
                </div>
                <Tag tone={samples ? "amber" : "green"}>
                  {samples
                    ? "Read-only inconsistent sample"
                    : "Deterministic rules"}
                </Tag>
              </div>
              {samples && (
                <p>
                  These deliberately inconsistent fixtures demonstrate
                  detection. They do not change the live demo inventory.
                </p>
              )}
              <div className="demo-issues">
                {issues.map((issue, index) => (
                  <Panel key={`${issue.code}-${index}`}>
                    <div className="demo-card-head">
                      <Tag tone="amber">{issue.severity}</Tag>
                      <Tag>{issue.status}</Tag>
                    </div>
                    <h3>
                      {readable(issue.code)
                        .toLowerCase()
                        .replace(/\b\w/g, (character) =>
                          character.toUpperCase(),
                        )
                        .replace("Sn", "SN")
                        .replace("Sh", "SH")}
                    </h3>
                    <code>{issue.reference}</code>
                    <p>{issue.reason}</p>
                    <div className="demo-investigate">
                      <strong>Suggested investigation</strong>
                      <p>{issue.investigation}</p>
                    </div>
                  </Panel>
                ))}
              </div>
              {!issues.length && (
                <Panel>
                  <div className="demo-empty">
                    <ShieldCheck size={42} />
                    <h2>No unresolved exceptions</h2>
                    <p>
                      SN coverage, outbound status, repair state, transfer age,
                      balance validity and ledger reconciliation checks passed.
                    </p>
                    <button onClick={() => setSamples(true)}>
                      Inspect sample discrepancies
                    </button>
                  </div>
                </Panel>
              )}
              <Panel title="Immutable operation evidence">
                {stock.audit.length ? (
                  stock.audit.slice(0, 15).map((a) => (
                    <div className="demo-audit-row" key={a.id}>
                      <time>{date(a.at)}</time>
                      <div>
                        <strong>{a.operation}</strong>
                        <p>
                          {a.businessReference} · {a.remark}
                        </p>
                        <small>{a.actor}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>Run a scenario to generate audit evidence.</p>
                )}
              </Panel>
            </>
          )}

          {page === "AI Audit Concept" && (
            <>
              <div className="demo-concept-banner">
                <Sparkles size={24} />
                <div>
                  <strong>Concept Preview</strong>
                  <p>
                    Mocked structured analysis. No external AI API. No inventory
                    write access.
                  </p>
                </div>
              </div>
              <div className="demo-flow">
                {[
                  "Structured Data",
                  "Audit Rules",
                  "Exception Queue",
                  "AI Analysis",
                  "Human Decision",
                ].map((label, i) => (
                  <div key={label}>
                    <span>{i + 1}</span>
                    {label}
                  </div>
                ))}
              </div>
              <div className="demo-two-col">
                <Panel title="Explore an example question">
                  {[
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
                      {q}
                      <ArrowRight size={18} />
                    </button>
                  ))}
                </Panel>
                <Panel title="Mock analysis">
                  {question ? (
                    <>
                      <Tag tone="amber">
                        Concept Preview · illustrative response
                      </Tag>
                      <h3>{question}</h3>
                      {question.includes("7") ? (
                        <>
                          <p>
                            The seven-unit discrepancy is an illustrative
                            scenario, not a claim about current demo balances.
                          </p>
                          <dl className="demo-facts">
                            <div>
                              <dt>Repair → Good residual records</dt>
                              <dd>5 units</dd>
                            </div>
                            <div>
                              <dt>Outbound status not closed</dt>
                              <dd>1 unit</dd>
                            </div>
                            <div>
                              <dt>Transfer not completed</dt>
                              <dd>1 unit</dd>
                            </div>
                          </dl>
                          <p>
                            Human action: inspect each SN, compare completion
                            and movement evidence, and approve any correcting
                            operation.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>
                            {auditDemo(stock).length} unresolved exception(s) in
                            the live synthetic session.
                          </p>
                          {auditDemo(stock)
                            .filter((i) =>
                              question.includes("transfers")
                                ? i.code === "TRANSFER_NOT_RECEIVED"
                                : question.includes("dispatched")
                                  ? i.code === "OUTBOUND_STATUS_MISMATCH"
                                  : true,
                            )
                            .map((i, n) => (
                              <p key={n}>
                                <strong>{i.reference}</strong> — {i.reason}
                              </p>
                            ))}
                          <p>
                            Review the exception queue and supporting
                            transaction history before making a decision.
                          </p>
                        </>
                      )}
                      <small>
                        No inventory changes made. Answers are fixed templates
                        with deterministic demo counts.
                      </small>
                    </>
                  ) : (
                    <div className="demo-empty">
                      <Sparkles size={38} />
                      <p>
                        Select a question to show the proposed analysis format.
                      </p>
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}

          {page === "Inventory" && (
            <Panel title="Inventory position">
              <p>
                All warehouses · product and material · balances are the
                quantity authority.
              </p>
              <div className="demo-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Location",
                        "Model / SKU",
                        "Condition",
                        "Physical",
                        "Frozen",
                        "Available*",
                        "In Transit",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stock.inventory.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.locationCode}</strong>
                          <small>{b.warehouseCode}</small>
                        </td>
                        <td>
                          {b.model}
                          <small>{b.sku}</small>
                        </td>
                        <td>
                          <Tag>{b.condition}</Tag>
                        </td>
                        <td>{b.physicalQty}</td>
                        <td>{b.frozenQty}</td>
                        <td>{b.availableQty}</td>
                        <td>{b.inTransitQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="demo-footnote">
                *Physical less Frozen; Repair inventory remains non-allocatable.
                Product and material units are included.
              </p>
            </Panel>
          )}

          {page === "Reporting" && (
            <>
              <div className="demo-metrics">
                {Object.entries(metrics).map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>
                      {label.includes("Pending") ||
                      label.includes("Exceptions") ||
                      label.includes("Backlog")
                        ? "Demo records"
                        : "Demo units"}
                    </small>
                  </div>
                ))}
              </div>
              <Panel title="Movement reporting">
                <div className="demo-tabs">
                  <button
                    className={period === 7 ? "selected" : ""}
                    onClick={() => setPeriod(7)}
                  >
                    Last 7 days
                  </button>
                  <button
                    className={period === 30 ? "selected" : ""}
                    onClick={() => setPeriod(30)}
                  >
                    Last 30 days
                  </button>
                </div>
                <p>
                  Rolling period · Sydney display time · outbound uses actual
                  outboundAt. Current balances above are not historical closing
                  balances.
                </p>
                {movements.length ? (
                  movements.map((m) => (
                    <div className="demo-audit-row" key={m.id}>
                      <time>{date(m.at)}</time>
                      <div>
                        <strong>
                          {readable(m.type)} · {m.qty} units
                        </strong>
                        <p>
                          {m.businessReference ?? m.sku} · {m.warehouseCode}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="demo-empty">
                    <p>
                      No movements in this reset session. Run a warehouse
                      scenario to populate the report.
                    </p>
                  </div>
                )}
                <div className="demo-concept-banner">
                  <LayoutDashboard size={24} />
                  <div>
                    <strong>Reporting concept</strong>
                    <p>
                      Structured WMS data → automated reporting → future BI →
                      future AI querying. Scheduled reports and BI connections
                      are not implemented.
                    </p>
                  </div>
                </div>
              </Panel>
            </>
          )}
          <footer className="demo-footer">
            <span>SN-first traceability · system-driven execution</span>
            <span>
              Synthetic browser session · refresh or Reset Demo restores
              fixtures
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
