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
      physicalQty: 3,
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
        reference: "SYD-00265",
        collector: kind === "Engineer" ? "Alex Chen" : "Demo Driver",
      };
      expect(() => execute(createDemoSession(), command)).toThrow(
        "Ready for Pickup",
      );
      expect(() => execute(ready, { ...command, reference: "wrong" })).toThrow(
        "does not match",
      );
      const collected = execute(ready, command);
      expect(collected.stock.inventory[0]).toMatchObject({
        physicalQty: 1,
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
        reference: "SYD-00265",
        collector: "Other",
      }),
    ).toThrow("not authorised");
    expect(() =>
      execute(ready, {
        type: "collect",
        kind: "Driver",
        reference: "SYD-00265",
        collector: " ",
      }),
    ).toThrow("name is required");
    ready.stock.serials[0].condition = "Repair";
    expect(() =>
      execute(ready, {
        type: "collect",
        kind: "Engineer",
        reference: "SYD-00265",
        collector: "Alex Chen",
      }),
    ).toThrow("no longer matches");
    expect(ready.stock.inventory[0].physicalQty).toBe(3);
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
    const sent = execute(scanned, { type: "transferOut" });
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
    const actual = execute(sent, {
      type: "transferScan",
      phase: "receive",
      value: "EQ48S260700003",
    });
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
  it("does not flag a valid return after collection as an outbound mismatch", () => {
    const collected = execute(prepared(), {
      type: "collect",
      kind: "Engineer",
      reference: "SYD-00265",
      collector: "Alex Chen",
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
    expect(service.read().stock.inventory[0].physicalQty).toBe(3);
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
