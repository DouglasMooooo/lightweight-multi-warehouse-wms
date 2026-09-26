import { describe, expect, it } from "vitest";
import {
  auditDemo,
  auditSample,
  createDemoSession,
  demoMetrics,
  executeDemoCommand as execute,
  traceDemo,
} from "@/domain/leadership-demo";
import { LeadershipDemoService } from "@/services/leadership-demo-service";

function prepared() {
  let session = execute(createDemoSession(), {
    type: "location",
    value: "FLEX-01",
  });
  session = execute(session, { type: "pick", value: "EQ48S260700001" });
  return execute(session, { type: "pick", value: "EQ48S260700002" });
}
describe("leadership demo transaction boundaries", () => {
  it("receives an expected ASN batch atomically and binds serials without double-counting", () => {
    const fresh = createDemoSession();
    expect(() => execute(fresh, { type: "receiveInbound", reference: "ASN-SYD-DEMO-0007", location: "RECEIVING-01", values: ["DEMO-IN-260927-001", "WRONG"] })).toThrow("no stock was posted");
    expect(fresh.stock.inventory.some((balance) => balance.locationCode === "RECEIVING-01" && balance.physicalQty > 0)).toBe(false);
    const received = execute(fresh, { type: "receiveInbound", reference: "ASN-SYD-DEMO-0007", location: "RECEIVING-01", values: ["DEMO-IN-260927-001", "DEMO-IN-260927-002"] });
    expect(received.stock.inventory.find((balance) => balance.locationCode === "RECEIVING-01" && balance.sku === "97-223-00107-00")).toMatchObject({ physicalQty: 2, availableQty: 2 });
    expect(received.stock.serials.filter((serial) => serial.serialNumber.startsWith("DEMO-IN-")).map((serial) => serial.status)).toEqual(["In_Stock", "In_Stock"]);
    expect(received.stock.transactions.filter((txn) => txn.businessReference === "ASN-SYD-DEMO-0007")).toHaveLength(2);
    expect(auditDemo(received.stock)).toEqual([]);
    expect(() => execute(received, { type: "receiveInbound", reference: "ASN-SYD-DEMO-0007", location: "RECEIVING-01", values: ["DEMO-IN-260927-001", "DEMO-IN-260927-002"] })).toThrow("already been received");
    expect(() => execute(received, { type: "putawayInbound", location: "RECEIVING-01", values: ["DEMO-IN-260927-001", "DEMO-IN-260927-002"] })).toThrow("storage rack");
    const putaway = execute(received, { type: "putawayInbound", location: "R1-4-2-L", values: ["DEMO-IN-260927-001", "DEMO-IN-260927-002"] });
    expect(putaway.stock.inventory.find((balance) => balance.locationCode === "RECEIVING-01" && balance.sku === "97-223-00107-00")).toMatchObject({ physicalQty: 0 });
    expect(putaway.stock.inventory.find((balance) => balance.locationCode === "R1-4-2-L" && balance.sku === "97-223-00107-00")).toMatchObject({ physicalQty: 2 });
    expect(putaway.stock.serials.filter((serial) => serial.serialNumber.startsWith("DEMO-IN-")).every((serial) => serial.locationCode === "R1-4-2-L")).toBe(true);
    expect(traceDemo(putaway.stock, "DEMO-IN-260927-001").map((txn) => txn.type)).toEqual(["Inbound", "Move"]);
    expect(auditDemo(putaway.stock)).toEqual([]);
  });
  it("starts reconciled and freezes exactly once on the last valid scan", () => {
    const fresh = createDemoSession();
    expect(auditDemo(fresh.stock)).toEqual([]);
    expect(() =>
      execute(fresh, { type: "pick", value: "EQ48S260700001" }),
    ).toThrow("Scan FLEX-01");
    expect(() =>
      execute(fresh, { type: "location", value: "REPAIR-01" }),
    ).toThrow("Wrong location");
    const located = execute(fresh, { type: "location", value: "FLEX-01" });
    const first = execute(located, { type: "pick", value: "EQ48S260700001" });
    expect(first.stock.inventory[0].frozenQty).toBe(0);
    expect(() =>
      execute(first, { type: "pick", value: "EQ48S260700001" }),
    ).toThrow("Duplicate");
    expect(() =>
      execute(first, { type: "pick", value: "EQ48S260700003" }),
    ).toThrow("transfer");
    expect(() =>
      execute(first, { type: "pick", value: "CQ6M260700091" }),
    ).toThrow("Wrong SN");
    const ready = execute(first, { type: "pick", value: "EQ48S260700002" });
    expect(ready.stock.inventory[0]).toMatchObject({
      physicalQty: 4,
      frozenQty: 2,
    });
    expect(ready.stock.outboundOrders[0].status).toBe("Ready_for_Pickup");
    expect(auditDemo(ready.stock)).toEqual([]);
    expect(fresh.stock.inventory[0].frozenQty).toBe(0);
  });
  it.each(["Engineer", "Driver"] as const)(
    "%s collection is the sole dispatch event, with no replay",
    (kind) => {
      const ready = prepared();
      const command = {
        type: "collect" as const,
        kind,
        reference: kind === "Engineer" ? "WO-SYD-2607-0042" : "SYD-00265",
        collector: kind === "Engineer" ? "Alex Chen" : "Demo Driver",
        identity: kind === "Engineer" ? "ENG-2048" : undefined,
      };
      expect(() => execute(createDemoSession(), command)).toThrow(
        "Ready for Pickup",
      );
      expect(() => execute(ready, { ...command, reference: "wrong" })).toThrow(
        "does not match",
      );
      const collected = execute(ready, command);
      expect(collected.stock.inventory[0]).toMatchObject({
        physicalQty: 2,
        frozenQty: 0,
      });
      expect(collected.stock.serials[0].status).toBe("Outbound");
      expect(collected.stock.outboundOrders[0].outboundAt).toBeTruthy();
      expect(collected.collection?.kind).toBe(kind);
      expect(demoMetrics(collected)["Outbound Today"]).toBe(2);
      expect(auditDemo(collected.stock)).toEqual([]);
      expect(() => execute(collected, command)).toThrow("already collected");
      expect(
        traceDemo(collected.stock, "EQ48S260700001").map((t) => t.type),
      ).toEqual(["Opening", "Prepared", "Outbound"]);
    },
  );
  it("rejects unauthorised engineer, empty driver and tampered serial condition atomically", () => {
    const ready = prepared();
    expect(() =>
      execute(ready, {
        type: "collect",
        kind: "Engineer",
        reference: "WO-SYD-2607-0042",
        collector: "Other",
        identity: "ENG-0000",
      }),
    ).toThrow("not authorised");
    const driverPickup = execute(ready, {
        type: "collect",
        kind: "Driver",
        reference: "SYD-00265",
        collector: " ",
      });
    expect(driverPickup.collection).toMatchObject({ kind: "Driver", collector: "QR scanner" });
    ready.stock.serials[0].condition = "Repair";
    expect(() =>
      execute(ready, {
        type: "collect",
        kind: "Engineer",
        reference: "WO-SYD-2607-0042",
        collector: "Alex Chen",
        identity: "ENG-2048",
      }),
    ).toThrow("no longer matches");
    expect(ready.stock.inventory[0].physicalQty).toBe(4);
  });
  it("requires the engineer identity and work-order QR digital signature", () => {
    const ready = prepared();
    expect(() => execute(ready, { type: "collect", kind: "Engineer", reference: "WO-SYD-2607-0042", collector: "Alex Chen", identity: "ENG-0000" })).toThrow("not authorised");
    expect(() => execute(ready, { type: "collect", kind: "Engineer", reference: "SH-2607-00175008", collector: "Alex Chen", identity: "ENG-2048" })).toThrow("work order QR");
    const signed = execute(ready, { type: "collect", kind: "Engineer", reference: "WO-SYD-2607-0042", collector: "Alex Chen", identity: "ENG-2048" });
    expect(signed.collection).toMatchObject({ kind: "Engineer", identity: "ENG-2048" });
    expect(signed.stock.serials.slice(0, 2).map((serial) => serial.relatedWorkOrderNo)).toEqual(["WO-SYD-2607-0042", "WO-SYD-2607-0042"]);
    expect(traceDemo(signed.stock, "WO-SYD-2607-0042").map((txn) => txn.type)).toContain("Outbound");
  });
  it("receives matched and missing-SH returns; rejects duplicates and partial batch effects", () => {
    const fresh = createDemoSession();
    expect(() =>
      execute(fresh, {
        type: "return",
        serials: ["60E5M4805C3F242", "UNKNOWN"],
        location: "REPAIR-01",
      }),
    ).toThrow("Unknown SN");
    expect(fresh.stock.repairJobs).toEqual([]);
    const received = execute(fresh, {
      type: "return",
      serials: ["60E5M4805C3F242", "DEMO-RETURN-NO-SH"],
      location: "REPAIR-01",
    });
    expect(received.stock.repairJobs).toHaveLength(2);
    expect(demoMetrics(received).Repair).toBe(2);
    expect(auditDemo(received.stock).map((i) => i.code)).toEqual([
      "MISSING_SH_REFERENCE",
    ]);
    expect(() =>
      execute(received, {
        type: "return",
        serials: ["60E5M4805C3F242"],
        location: "REPAIR-01",
      }),
    ).toThrow("already been received");
  });
  it("requires independent destination scans and conserves physical plus transit", () => {
    const fresh = createDemoSession();
    expect(() => execute(fresh, { type: "transferOut" })).toThrow(
      "Missing source",
    );
    const scanned = execute(fresh, {
      type: "transferScan",
      phase: "send",
      value: "EQ48S260700003",
    });
    expect(() =>
      execute(scanned, {
        type: "transferScan",
        phase: "send",
        value: "EQ48S260700003",
      }),
    ).toThrow("Duplicate");
    const batch = execute(scanned, { type: "transferScanBatch", phase: "send", values: ["EQ48S260700004"] });
    const sent = execute(batch, { type: "transferOut" });
    expect(sent.receivedScans).toEqual([]);
    expect(demoMetrics(sent).Physical + demoMetrics(sent)["In Transit"]).toBe(
      demoMetrics(fresh).Physical,
    );
    expect(() =>
      execute(sent, { type: "transferIn", location: "RECEIVING-01" }),
    ).toThrow("Missing destination");
    expect(() =>
      execute(sent, {
        type: "transferScan",
        phase: "receive",
        value: "EQ48S260700002",
      }),
    ).toThrow("Unexpected");
    const actual = execute(sent, { type: "transferScanBatch", phase: "receive", values: ["EQ48S260700003", "EQ48S260700004"] });
    expect(() =>
      execute(actual, { type: "transferIn", location: "FLEX-01" }),
    ).toThrow("Invalid location");
    const received = execute(actual, {
      type: "transferIn",
      location: "RECEIVING-01",
    });
    expect(received.stock.serials[2]).toMatchObject({
      warehouseCode: "MEL",
      locationCode: "RECEIVING-01",
      status: "In_Stock",
    });
    expect(auditDemo(received.stock)).toEqual([]);
    expect(demoMetrics(received).Physical).toBe(demoMetrics(fresh).Physical);
  });
  it("validates transfer SN upload batches atomically", () => {
    const fresh = createDemoSession();
    expect(() => execute(fresh, { type: "transferScanBatch", phase: "send", values: ["EQ48S260700003", "EQ48S260700001"] })).toThrow("Unexpected");
    expect(fresh.sentScans).toEqual([]);
    const scanned = execute(fresh, { type: "transferScanBatch", phase: "send", values: [" eq48s260700003 ", "EQ48S260700004"] });
    expect(scanned.sentScans).toEqual(["EQ48S260700003", "EQ48S260700004"]);
  });
  it("preserves native repair lifecycle, identity, quantity and append-only ledger", () => {
    const received = execute(createDemoSession(), {
      type: "return",
      serials: ["60E5M4805C3F242"],
      location: "REPAIR-01",
    });
    const complete = {
      type: "completeRepair" as const,
      sn: "60E5M4805C3F242",
      location: "FLEX-01",
    };
    expect(() => execute(received, complete)).toThrow();
    const started = execute(received, { type: "startRepair", sn: complete.sn });
    expect(() =>
      execute(started, { ...complete, location: "REPAIR-01" }),
    ).toThrow("good-stock");
    const repaired = execute(started, complete);
    expect(demoMetrics(repaired).Physical).toBe(demoMetrics(received).Physical);
    expect(
      repaired.stock.serials.find((s) => s.serialNumber === complete.sn),
    ).toMatchObject({ condition: "Repair_Good", status: "In_Stock" });
    expect(repaired.stock.transactions.slice(1)).toEqual(
      started.stock.transactions,
    );
    expect(auditDemo(repaired.stock)).toEqual([]);
    expect(() => execute(repaired, complete)).toThrow("active repair job");
  });
  it("completes a validated repair SN batch in one atomic command", () => {
    const received = execute(createDemoSession(), { type: "return", serials: ["60E5M4805C3F242", "DEMO-RETURN-NO-SH"], location: "REPAIR-01" });
    let ready = execute(received, { type: "startRepair", sn: "60E5M4805C3F242" });
    ready = execute(ready, { type: "startRepair", sn: "DEMO-RETURN-NO-SH" });
    expect(() => execute(ready, { type: "completeRepairBatch", sns: ["60E5M4805C3F242", "UNKNOWN"], location: "FLEX-01" })).toThrow("In Repair");
    expect(ready.stock.repairJobs?.every((job) => job.status === "In_Repair")).toBe(true);
    const complete = execute(ready, { type: "completeRepairBatch", sns: ["60E5M4805C3F242", "DEMO-RETURN-NO-SH"], location: "FLEX-01" });
    expect(complete.stock.repairJobs?.map((job) => job.status)).toEqual(["Repair_Good", "Repair_Good"]);
    expect(demoMetrics(complete).Physical).toBe(demoMetrics(ready).Physical);
  });
  it("does not flag a valid return after collection as an outbound mismatch", () => {
    const collected = execute(prepared(), {
      type: "collect",
      kind: "Engineer",
      reference: "WO-SYD-2607-0042",
      collector: "Alex Chen",
      identity: "ENG-2048",
    });
    const returned = execute(collected, {
      type: "return",
      serials: ["EQ48S260700001"],
      location: "REPAIR-01",
    });
    expect(auditDemo(returned.stock)).toEqual([]);
  });
  it("evaluates all seven audit rules without corrupting live stock", () => {
    const live = createDemoSession();
    expect(new Set(auditSample().map((i) => i.code))).toEqual(
      new Set([
        "SN_COUNT_MISMATCH",
        "OUTBOUND_STATUS_MISMATCH",
        "REPAIR_STATUS_RESIDUAL",
        "TRANSFER_NOT_RECEIVED",
        "NEGATIVE_INVENTORY",
        "UNLINKED_SN_RECORD",
        "TRANSACTION_BALANCE_MISMATCH",
      ]),
    );
    expect(auditDemo(live.stock)).toEqual([]);
  });
  it("isolates repository sessions, protects reads and resets all workflow state", () => {
    const service = new LeadershipDemoService();
    service.execute({ type: "location", value: "FLEX-01" });
    service.execute({ type: "pick", value: "EQ48S260700001" });
    service.execute({
      type: "return",
      serials: ["DEMO-RETURN-NO-SH"],
      location: "REPAIR-01",
    });
    const read = service.read();
    read.stock.inventory[0].physicalQty = 999;
    expect(service.read().stock.inventory[0].physicalQty).toBe(4);
    expect(new LeadershipDemoService().read().pickScans).toEqual([]);
    const reset = service.reset();
    expect(reset).toMatchObject({
      locationVerified: false,
      pickScans: [],
      sentScans: [],
      receivedScans: [],
    });
    expect(reset.stock.exceptions).toEqual([]);
    expect(reset.stock.audit).toEqual([]);
    expect(reset.stock.repairJobs).toEqual([]);
    expect(auditDemo(reset.stock)).toEqual([]);
  });
});
