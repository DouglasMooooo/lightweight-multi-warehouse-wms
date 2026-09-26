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
  ClipboardList,
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
  ["Overview", LayoutDashboard, "Your shift, your tasks, and the next action"],
  ["Inbound & Putaway", ClipboardList, "Receive an ASN, verify serials and put stock away"],
  ["Outbound", PackageCheck, "Verify location and scan two units to prepare"],
  [
    "Digital Pickup",
    ShieldCheck,
    "Scan the linked work order as an engineer or shipment QR as a driver",
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
  const [engineerIdentity, setEngineerIdentity] = useState("ENG-2048");
  const [returnText, setReturnText] = useState("60E5M4805C3F242");
  const [returnLocation, setReturnLocation] = useState("");
  const [repairSn, setRepairSn] = useState("");
  const [goodLocation, setGoodLocation] = useState("FLEX-01");
  const [destination, setDestination] = useState("");
  const [transferBatchText, setTransferBatchText] = useState("");
  const [inboundBatchText, setInboundBatchText] = useState("");
  const [inboundReference, setInboundReference] = useState("ASN-SYD-DEMO-0007");
  const [inboundLocation, setInboundLocation] = useState("");
  const [repairBatchText, setRepairBatchText] = useState("");
  const [repairBatchSns, setRepairBatchSns] = useState<string[]>([]);
  const [mapWarehouse, setMapWarehouse] = useState("SYD");
  const [location, setLocation] = useState("FLEX-01");
  const [trace, setTrace] = useState("EQ48S260700001");
  const [traceQuery, setTraceQuery] = useState("EQ48S260700001");
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
  const traceOrder = stock.outboundOrders.find((item) =>
    item.shNo === trace || item.pickupCode === trace || item.lines.some((itemLine) =>
      itemLine.workOrderNo?.toUpperCase() === trace || itemLine.scannedSerials.includes(trace),
    ),
  );
  const traceTransfer = stock.transfers.find((item) =>
    item.transferNo === trace || item.serials.includes(trace),
  );
  const traceWorkOrder = traceOrder?.lines.find((itemLine) =>
    itemLine.scannedSerials.includes(trace) || itemLine.workOrderNo?.toUpperCase() === trace,
  )?.workOrderNo ?? traceSerial?.relatedWorkOrderNo;
  const traceBusinessRefs = [
    traceOrder?.shNo ?? traceSerial?.relatedShNo,
    traceWorkOrder,
    traceOrder?.pickupCode,
    traceTransfer?.transferNo ?? traceSerial?.relatedTransferNo,
  ].filter((value): value is string => Boolean(value));
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
    setEngineerIdentity("ENG-2048");
    setReturnText("60E5M4805C3F242");
    setReturnLocation("");
    setRepairSn("");
    setGoodLocation("FLEX-01");
    setDestination("");
    setTransferBatchText("");
    setInboundBatchText("");
    setInboundReference("ASN-SYD-DEMO-0007");
    setInboundLocation("");
    setRepairBatchText("");
    setRepairBatchSns([]);
    setMapWarehouse("SYD");
    setLocation("FLEX-01");
    setTrace("EQ48S260700001");
    setTraceQuery("EQ48S260700001");
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
            page === "Inbound & Putaway" && (
              <div className="demo-two-col">
                <Panel title={zh("ASN receiving task · simulated training document")}>
                  <Tag tone={session.inboundReceived ? "green" : "amber"}>{zh(session.inboundReceived ? "Received · put away at RECEIVING-01" : "Expected · waiting at receiving dock")}</Tag>
                  <dl className="demo-facts">
                    <div><dt>{zh("ASN / supplier delivery")}</dt><dd>{zh("ASN-SYD-DEMO-0007")}</dd></div>
                    <div><dt>{zh("Warehouse / receiving location")}</dt><dd>{zh("Sydney · RECEIVING-01")}</dd></div>
                    <div><dt>{zh("Expected model / SKU")}</dt><dd>{zh("EQ4800-S · 97-223-00107-00")}</dd></div>
                    <div><dt>{zh("Expected quantity / condition")}</dt><dd>{zh("2 units · New")}</dd></div>
                  </dl>
                  {!session.inboundReceived ? <>
                    <label className="demo-field">{zh("Scan / confirm ASN")}<input value={inboundReference} onChange={(event) => setInboundReference(event.target.value)} placeholder={zh("ASN-SYD-DEMO-0007")} /></label>
                    <label className="demo-field">{zh("Scan receiving location QR")}<input value={inboundLocation} onChange={(event) => setInboundLocation(event.target.value)} placeholder={zh("RECEIVING-01")} /></label>
                    <label className="demo-field">{zh("Scan item serials · one per line")}
                      <textarea value={inboundBatchText} onChange={(event) => setInboundBatchText(event.target.value)} rows={4} placeholder={zh("DEMO-IN-260927-001\nDEMO-IN-260927-002")} />
                    </label>
                    <div className="demo-hint"><strong>{zh("Receiving checklist")}</strong><p>{zh("Check carton quantity and model against the ASN. Inspect condition before accepting. Batch validation is all-or-nothing.")}</p><code>{zh("DEMO-IN-260927-001")}</code><code>{zh("DEMO-IN-260927-002")}</code></div>
                    <button className="demo-primary" disabled={!inboundBatchText.trim() || !inboundLocation.trim()} onClick={() => { const values = inboundBatchText.split(/[\s,;]+/).filter(Boolean); if (run({ type: "receiveInbound", reference: inboundReference, location: inboundLocation, values }, "ASN receipt posted to RECEIVING-01. Scan the destination rack to complete putaway.")) { setInboundBatchText(""); setInboundLocation(""); } }}>{zh("Confirm receipt into receiving area")}<ArrowRight size={18} /></button>
                  </> : !session.inboundPutaway ? <>
                    <div className="demo-hint"><strong>{zh("Receipt accepted · putaway task created")}</strong><p>{zh("Stock is now in RECEIVING-01. Scan a storage rack and scan both SNs before moving the batch.")}</p></div>
                    <label className="demo-field">{zh("Scan destination storage rack") }<input value={inboundLocation} onChange={(event) => setInboundLocation(event.target.value)} placeholder={zh("R1-4-2-L")} /></label>
                    <label className="demo-field">{zh("Scan received SNs for putaway · one per line")}<textarea value={inboundBatchText} onChange={(event) => setInboundBatchText(event.target.value)} rows={4} placeholder={zh("DEMO-IN-260927-001\nDEMO-IN-260927-002")} /></label>
                    <button className="demo-primary" disabled={!inboundBatchText.trim() || !inboundLocation.trim()} onClick={() => { const values = inboundBatchText.split(/[\s,;]+/).filter(Boolean); if (run({ type: "putawayInbound", location: inboundLocation, values }, "Putaway completed. Both SN locations and warehouse balances moved to the storage rack.")) { setInboundBatchText(""); setInboundLocation(""); } }}>{zh("Confirm rack putaway")}<ArrowRight size={18} /></button>
                  </> : <div className="demo-complete"><PackageCheck size={42} /><h3>{zh("Receipt and putaway complete")}</h3><p>{zh("2 units · New · stored at the confirmed rack. Inventory, SN, movement and audit records updated.")}</p><ul className="demo-evidence">{["DEMO-IN-260927-001", "DEMO-IN-260927-002"].map((sn) => <li key={sn}><Check size={16} />{zh(sn)}</li>)}</ul><button className="demo-primary" onClick={() => { setTrace("DEMO-IN-260927-001"); setTraceQuery("DEMO-IN-260927-001"); navigate("SN Trace"); }}>{zh("Continue to full trace")}<ArrowRight size={18} /></button></div>}
                </Panel>
                <Panel title={zh("Operator standard work")}>
                  <ol className="demo-standard-work">{["Compare supplier delivery with the expected ASN.", "Check the model and SKU label on each unit.", "Inspect packaging and physical condition; quarantine damaged or mismatched stock.", "Scan the receiving location, then scan every unit SN.", "Resolve quantity / identity differences before posting the batch.", "Put accepted stock into the designated storage rack and confirm the location movement."].map((step, index) => <li key={step}><span>{index + 1}</span>{zh(step)}</li>)}</ol>
                  <p className="demo-demo-boundary">{zh("Training fixture only. ASN, supplier and SN labels are synthetic; no ERP receipt is sent.")}</p>
                </Panel>
              </div>
            ),
          )}

          {zh(
            page === "Overview" && (
              <>
                <div className="demo-hero">
                  <div>
                    <p className="demo-eyebrow">{zh("WAREHOUSE OPERATOR SHIFT · SYDNEY")}</p>
                    <h2>
                      {zh(
                        !session.inboundReceived
                          ? "Receive today's inbound delivery."
                          : !session.inboundPutaway
                            ? "Put away the accepted units."
                          : orderStatus === "To prepare"
                            ? "Next: pick the service replacement."
                            : session.collection
                              ? "Pickup complete. Continue with warehouse work."
                              : "Two units ready. Verify collection.",
                      )}
                    </h2>
                    <p>{zh(!session.inboundReceived ? "ASN-SYD-DEMO-0007 · EQ4800-S · 2 units · RECEIVING-01" : !session.inboundPutaway ? "ASN-SYD-DEMO-0007 · RECEIVING-01 → storage rack · 2 units" : `${order.shNo} · EQ4800-S · 2 units · FLEX-01`)}</p>
                    <button
                      className="demo-primary"
                      onClick={() =>
                        navigate(
                          !session.inboundReceived || !session.inboundPutaway ? "Inbound & Putaway" : orderStatus === "To prepare" ? "Outbound" : "Digital Pickup",
                        )
                      }
                    >
                      {zh(
                        !session.inboundReceived ? "Start receiving" : !session.inboundPutaway ? "Continue putaway" : orderStatus === "To prepare" ? "Start Pick Task" : "Open pickup",
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
                  <h2>{zh("Today's warehouse work")}</h2>
                  <span>
                    {zh("Run a workflow. Inspect the evidence. Reset.")}
                  </span>
                </div>
                <div className="demo-shift-tasks">
                  {(["Inbound & Putaway", "Outbound", "Digital Pickup", "Transfer", "Faulty Return", "Repair → Good", "SN Trace"] as Page[]).map((name, index) => {
                    const done = name === "Inbound & Putaway" ? session.inboundPutaway : name === "Outbound" ? line.preparedQty === 2 : name === "Digital Pickup" ? Boolean(session.collection) : name === "Transfer" ? transfer.status === "Received" : name === "Faulty Return" ? (stock.repairJobs?.length ?? 0) > 0 : name === "Repair → Good" ? Boolean(stock.repairJobs?.some((job) => job.status === "Repair_Good")) : false;
                    return <button key={name} onClick={() => navigate(name)} className={done ? "done" : ""}><span>{done ? <Check size={16} /> : String(index + 1).padStart(2, "0")}</span><strong>{zh(name)}</strong><small>{zh(done ? "已完成 · 查看记录" : "待作业 · 点击开始")}</small><ArrowRight size={16} /></button>;
                  })}
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
                          <dt>{zh("After-sales order / shipment")}</dt>
                          <dd>{zh(order.shNo)}</dd>
                        </div>
                        <label className="demo-field">
                          {zh("Engineer identity")}
                          <input
                            value={engineerIdentity}
                            onChange={(e) => setEngineerIdentity(e.target.value)}
                            placeholder={zh("ENG-2048")}
                          />
                        </label>
                        <Scan
                          key={`engineer-${generation}`}
                          label={zh("Scan work order QR code")}
                          hint={order.lines[0].workOrderNo ?? order.shNo}
                          disabled={order.status !== "Ready_for_Pickup"}
                          onScan={(value) => {
                            const scanned = value.trim().toUpperCase();
                            const valid = scanned === order.lines[0].workOrderNo?.toUpperCase();
                            if (!valid) {
                              setNotice({ text: "Scan the QR code for the engineer's linked work order.", error: true });
                              return false;
                            }
                            return run({ type: "collect", kind: "Engineer", reference: scanned, collector: "Alex Chen", identity: engineerIdentity }, "Engineer identity and work order QR verified. Digital signature recorded; task collected and audited.");
                          }}
                        />
                        <p className="demo-signature-note">
                          <ShieldCheck size={17} />
                          {zh("Identity + work order QR = simulated digital signature")}
                        </p>
                        <div>
                          <dt>{zh("Authorised")}</dt>
                          <dd>{zh("Yes · demo grant for this shipment")}</dd>
                        </div>
                      </dl>
                    ) : (
                      <>
                        <Scan key={`driver-${generation}`} label={zh("Scan pickup order QR code to complete pickup")} hint={order.shNo} disabled={order.status !== "Ready_for_Pickup"} onScan={(value) => {
                          const scanned = value.trim().toUpperCase();
                          const valid = [order.shNo, order.pickupCode].some((reference) => reference?.toUpperCase() === scanned);
                          if (!valid) {
                            setNotice({ text: "Pickup order QR does not match this shipment.", error: true });
                            return false;
                          }
                          return run({ type: "collect", kind: "Driver", reference: scanned, collector: "QR scanner" }, "Pickup order QR verified. Driver handover recorded; stock dispatched and audited.");
                        }} />
                        <p>
                          {zh(
                            "Scan the shipment order QR. No engineer identity is required for a driver handover.",
                          )}
                        </p>
                      </>
                    ),
                  )}
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
                    <span>{zh(transfer.model)} · {zh(transfer.qty)} {zh("units")} · {zh(readable(transfer.condition))}</span>
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
                          <label className="demo-field">
                            {zh(transfer.status === "Draft" ? "Scan or paste source SNs (one per line)" : "Scan or paste destination SNs (one per line)")}
                            <textarea
                              rows={4}
                              value={transferBatchText}
                              onChange={(e) => setTransferBatchText(e.target.value)}
                              placeholder={transfer.serials.join("\n")}
                              autoComplete="off"
                              spellCheck={false}
                            />
                          </label>
                          <button
                            className="demo-secondary"
                            disabled={!transferBatchText.trim()}
                            onClick={() => {
                              const values = transferBatchText.split(/[\s,;]+/).filter(Boolean);
                              if (run({ type: "transferScanBatch", phase: transfer.status === "Draft" ? "send" : "receive", values }, `${values.length} SN records validated and submitted together.`)) setTransferBatchText("");
                            }}
                          >{zh("Validate and submit SN batch")}</button>
                          {zh(
                            transfer.status === "Draft" ? (
                              <button
                                className="demo-primary"
                                onClick={() =>
                                  run(
                                    { type: "transferOut" },
                                    "Transfer Out recorded. All scanned units are In Transit; Melbourne has a receiving task.",
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
                  <label className="demo-field">
                    {zh("Scan or paste repair SNs (one per line)")}
                    <textarea
                      rows={4}
                      value={repairBatchText}
                      onChange={(e) => setRepairBatchText(e.target.value)}
                      placeholder={zh("60E5M4805C3F242")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <button className="demo-secondary" disabled={!repairBatchText.trim()} onClick={() => {
                    const sns = repairBatchText.split(/[\s,;]+/).filter(Boolean).map((sn) => sn.toUpperCase());
                    const jobs = sns.map((sn) => stock.repairJobs?.find((job) => job.serialNumber === sn && job.status === "In_Repair"));
                    if (new Set(sns).size !== sns.length || jobs.some((job) => !job)) {
                      setNotice({ text: "Duplicate or unknown repair SN. Receive each unit into Repair first.", error: true });
                      return;
                    }
                    setRepairSn(sns[0]);
                    setRepairBatchSns(sns);
                    setNotice({ text: `${sns.length} repair SNs validated together and ready for one batch completion.`, error: false });
                    setRepairBatchText("");
                  }}>{zh("Validate repair SN batch")}</button>
                  {repairBatchSns.length > 0 && <button className="demo-primary" onClick={() => { if (run({ type: "completeRepairBatch", sns: repairBatchSns, location: goodLocation }, `${repairBatchSns.length} repair units completed in one batch. Same SN identities and physical quantities preserved; audit recorded.`)) setRepairBatchSns([]); }}>{zh("Complete validated repair batch")} · {zh(repairBatchSns.length)} SN</button>}
                  {zh(stock.repairJobs?.length ? stock.repairJobs.map((job) => (
                    <button key={job.id} className={`demo-batch-item ${repairSn === job.serialNumber ? "selected" : ""}`} onClick={() => setRepairSn(job.serialNumber ?? "")}>
                      <span><strong>{zh(job.serialNumber)}</strong><small>{zh(job.model)} · {zh(job.currentLocation)}</small></span>
                      <Tag>{zh(readable(job.status))}</Tag>
                    </button>
                  )) : null)}
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
                      <div><span className="demo-map-eyebrow">{zh("WAREHOUSE OPERATIONS")}</span><h2>{zh(mapWarehouse === "SYD" ? "Sydney warehouse" : "Melbourne warehouse")}</h2><p>{zh("Tap a rack to inspect its live stock")}</p></div>
                      <span className="demo-compass">N ↑</span>
                    </div>
                    <div className="demo-map-scene">
                    <div className="demo-rack-bank">
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
                                <small>{zh(detail.balances.slice(0, 2).map((b) => b.model).join(" · ") || "Empty rack")}</small>
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
                    </div>
                    <div className="demo-map-selection">
                      <span>{zh("SELECTED LOCATION")}</span>
                      <strong>{zh(location)}</strong>
                      <small>{zh(selectedLocation.qty)} {zh("physical units")}</small>
                    </div>
                    </div>
                  </Panel>
                  <Panel title={zh("Location detail")} className="demo-map-detail">
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
                    label={zh("Search by SN, work order, shipment, or transfer number")}
                    hint={zh("EQ48S260700001 or SH-2607-00175008")}
                    onScan={(value) => {
                      setTraceQuery(value.trim().toUpperCase());
                      const query = value.trim().toUpperCase();
                      const order = stock.outboundOrders.find((item) => item.shNo === query || item.pickupCode === query || item.lines.some((line) => line.workOrderNo?.toUpperCase() === query));
                      const transferOrder = stock.transfers.find((item) => item.transferNo === query);
                      setTrace(order || transferOrder ? query : stock.serials.find((item) => item.serialNumber === query)?.serialNumber ?? query);
                      return true;
                    }}
                  />
                  <label className="demo-field">{zh("Search business reference")}
                    <input value={traceQuery} onChange={(event) => setTraceQuery(event.target.value)} placeholder={zh("Work order / SH / transfer number")} />
                  </label>
                  <button className="demo-primary" onClick={() => {
                    const query = traceQuery.trim().toUpperCase();
                    const order = stock.outboundOrders.find((item) => item.shNo === query || item.pickupCode === query || item.lines.some((line) => line.workOrderNo?.toUpperCase() === query));
                    const transferOrder = stock.transfers.find((item) => item.transferNo === query);
                    setTrace(order || transferOrder ? query : stock.serials.find((item) => item.serialNumber === query)?.serialNumber ?? query);
                  }}>{zh("Search full lifecycle")}</button>
                  <div className="demo-quick-links">
                    {zh(
                      [
                        "EQ48S260700001",
                        "60E5M4805C3F242",
                        "EQ48S260700003",
                        "EQ48S260700004",
                        "SH-2607-00175008",
                        "SYD-00265",
                        "TR-SYD-MEL-00018",
                      ].map((sn) => (
                        <button key={sn} onClick={() => { setTraceQuery(sn); setTrace(sn); }}>
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
                              {zh(traceOrder?.shNo ?? traceSerial.relatedShNo ?? traceTransfer?.transferNo ?? traceSerial.relatedTransferNo ?? "No linked business reference")}
                          </dd>
                        </div>
                        <div><dt>{zh("Engineer work order")}</dt><dd>{zh(traceSerial.relatedWorkOrderNo ?? "WO-SYD-2607-0042 (demo-linked)")}</dd></div>
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
                        {traceBusinessRefs.length > 0 && <><h3>{zh("Related business documents")}</h3><div className="demo-related-refs">{zh(traceBusinessRefs.map((reference) => <code key={reference}>{zh(reference)}</code>))}</div></>}
                      </Panel>
                    </div>
                  ) : traceOrder || traceTransfer ? (
                    <div className="demo-two-col">
                      <Panel title={zh(traceOrder ? "Work order and shipment" : "Transfer lifecycle")}>
                        <Tag tone={traceOrder?.status === "Outbound" || traceTransfer?.status === "Received" ? "green" : "amber"}>{zh(readable(traceOrder?.status ?? traceTransfer?.status ?? ""))}</Tag>
                        {traceOrder && <><h3>{zh(traceOrder.shNo)}</h3><p>{zh(traceOrder.pickupCode)} · {zh(traceOrder.lines.map((itemLine) => itemLine.workOrderNo).filter(Boolean).join(" · "))}</p>{traceOrder.lines.map((itemLine) => <article className="demo-return-row" key={itemLine.id}><strong>{zh(itemLine.model)} · {zh(itemLine.requiredQty)} {zh("units")}</strong><p>{zh(itemLine.sku)} · {zh(readable(itemLine.requiredCondition))}</p>{itemLine.scannedSerials.map((sn) => <button className="demo-sn-link" key={sn} onClick={() => { setTrace(sn); setTraceQuery(sn); }}>{zh(sn)} ↗</button>)}</article>)}</>}
                        {traceTransfer && <><h3>{zh(traceTransfer.transferNo)}</h3><p>{zh(traceTransfer.sourceWarehouse)} → {zh(traceTransfer.destinationWarehouse)} · {zh(traceTransfer.model)} · {zh(traceTransfer.qty)} {zh("units")}</p>{traceTransfer.serials.map((sn) => <button className="demo-sn-link" key={sn} onClick={() => { setTrace(sn); setTraceQuery(sn); }}>{zh(sn)} ↗</button>)}</>}
                      </Panel>
                      <Panel title={zh("Lifecycle timeline")}>
                        {events.length ? <ol className="demo-timeline">{events.map((event) => <li key={event.id}><time>{zh(date(event.at))} · {zh("Sydney")}</time><h3>{zh(readable(event.type))}</h3><p>{zh(event.remark)}</p><small>{zh(event.actor)} · {zh(event.result)}</small></li>)}</ol> : <p>{zh("No events recorded for this business reference in this demo session.")}</p>}
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
