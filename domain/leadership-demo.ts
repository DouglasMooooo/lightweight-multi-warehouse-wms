import { demoState } from "./demo-data";
import {
  dispatchOutbound,
  dispatchTransfer,
  prepareOutbound,
  receiveFaulty,
  receiveTransfer,
  scanOutboundSerial,
} from "./operations";
import { assertRepairCanComplete, assertRepairCanStart } from "./repair-rules";
import { isPhysicallyPresentSerialStatus } from "./serial-policy";
import type { StockTransaction, WmsState } from "./types";

export interface DemoSession {
  stock: WmsState;
  locationVerified: boolean;
  pickScans: string[];
  sentScans: string[];
  receivedScans: string[];
  collection?: {
    kind: "Engineer" | "Driver";
    collector: string;
    identity?: string;
    at: string;
  };
}
export type DemoCommand =
  | { type: "location"; value: string }
  | { type: "pick"; value: string }
  | {
      type: "collect";
      kind: "Engineer" | "Driver";
      reference: string;
      collector: string;
      identity?: string;
    }
  | { type: "return"; serials: string[]; location: string }
  | { type: "transferScan"; phase: "send" | "receive"; value: string }
  | { type: "transferScanBatch"; phase: "send" | "receive"; values: string[] }
  | { type: "transferOut" }
  | { type: "transferIn"; location: string }
  | { type: "startRepair"; sn: string }
  | { type: "completeRepair"; sn: string; location: string }
  | { type: "completeRepairBatch"; sns: string[]; location: string };

const timestamp = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const requireThat: (value: unknown, message: string) => asserts value = (
  value,
  message,
) => {
  if (!value) throw new Error(message);
};
const normalize = (value: string) => value.trim().toUpperCase();

/** Dedicated synthetic fixtures. Never loaded into an operational repository. */
export function createDemoSession(): DemoSession {
  const stock = structuredClone(demoState);
  stock.inventory = stock.inventory.filter(
    (b) => b.id === "bal-1" || b.id === "bal-2" || b.itemType === "Material",
  );
  for (const balance of stock.inventory) {
    if (balance.id === "bal-1") balance.physicalQty = 4;
    if (balance.id === "bal-2") balance.physicalQty = 1;
    balance.frozenQty = 0;
    balance.inTransitQty = 0;
    balance.availableQty = balance.physicalQty;
  }
  stock.serials.push({
    id: "demo-unlinked-return",
    serialNumber: "DEMO-RETURN-NO-SH",
    sku: stock.products[0].sku,
    model: stock.products[0].model,
    status: "Outbound",
    condition: "New",
  });
  stock.locations.push(
    {
      id: "demo-temp",
      warehouseCode: "SYD",
      code: "TEMP-01",
      zone: "TEMP",
      serviceZone: true,
      active: true,
    },
    {
      id: "demo-quarantine",
      warehouseCode: "SYD",
      code: "QUARANTINE-01",
      zone: "QUARANTINE",
      serviceZone: true,
      active: true,
    },
  );
  stock.outboundOrders = [stock.outboundOrders[0]];
  const order = stock.outboundOrders[0];
  order.status = "Ready";
  order.createdAt = timestamp();
  const line = order.lines[0];
  line.allocatedQty = line.preparedQty = line.dispatchedQty = 0;
  line.allocationLocation = undefined;
  line.allocations = [];
  line.scannedSerials = [];
  stock.transactions = stock.inventory.flatMap((b) => {
    const sns = stock.serials.filter(
      (s) =>
        s.warehouseCode === b.warehouseCode &&
        s.locationCode === b.locationCode &&
        s.sku === b.sku &&
        s.condition === b.condition,
    );
    const base = {
      at: timestamp(),
      type: "Opening" as const,
      warehouseCode: b.warehouseCode,
      sku: b.sku,
      model: b.model,
      condition: b.condition,
      toLocation: b.locationCode,
      actor: "Synthetic fixture",
      remark: "Synthetic leadership demo opening balance.",
    };
    return sns.length
      ? sns.map((s) => ({
          ...base,
          id: uid(),
          qty: 1,
          serialNumber: s.serialNumber,
        }))
      : [{ ...base, id: uid(), qty: b.physicalQty }];
  });
  stock.audit = [];
  stock.exceptions = [];
  stock.repairJobs = [];
  stock.faultyReceivedCount = 0;
  return {
    stock,
    locationVerified: false,
    pickScans: [],
    sentScans: [],
    receivedScans: [],
  };
}

function audit(
  stock: WmsState,
  operation: string,
  reference: string,
  remark: string,
  actor = "Demo operator",
) {
  stock.audit.unshift({
    id: uid(),
    at: timestamp(),
    actor,
    operation,
    entityType: "DemoWorkflow",
    entityId: reference,
    businessReference: reference,
    remark,
  });
}

/** Atomic command boundary: failed validation never returns a partially changed session. */
export function executeDemoCommand(
  source: DemoSession,
  command: DemoCommand,
): DemoSession {
  if (command.type === "completeRepairBatch") {
    requireThat(command.sns.length > 0, "Select at least one repair SN.");
    const sns = command.sns.map(normalize);
    requireThat(new Set(sns).size === sns.length, "Duplicate SN in repair batch.");
    const jobs = source.stock.repairJobs ?? [];
    requireThat(sns.every((sn) => jobs.some((job) => job.serialNumber === sn && job.status === "In_Repair")), "Every SN in the batch must have an active In Repair job.");
    return sns.reduce((session, sn) => executeDemoCommand(session, { type: "completeRepair", sn, location: command.location }), source);
  }
  const next = structuredClone(source);
  let stock = next.stock;
  const order = stock.outboundOrders[0];
  const line = order.lines[0];
  const transfer = stock.transfers[0];
  switch (command.type) {
    case "location": {
      requireThat(
        order.status === "Ready",
        "This pick task is already complete.",
      );
      requireThat(
        normalize(command.value) === "FLEX-01",
        "Wrong location. Go to FLEX-01 and scan its location code.",
      );
      next.locationVerified = true;
      audit(
        stock,
        "Location verified",
        order.shNo,
        "FLEX-01 scanned for pick task.",
      );
      break;
    }
    case "pick": {
      requireThat(
        order.status === "Ready" && next.locationVerified,
        "Scan FLEX-01 before scanning units.",
      );
      const sn = normalize(command.value);
      requireThat(
        !next.pickScans.includes(sn),
        "Duplicate SN. This unit is already scanned.",
      );
      const serial = stock.serials.find((s) => s.serialNumber === sn);
      requireThat(
        serial &&
          serial.sku === line.sku &&
          serial.condition === line.requiredCondition &&
          serial.warehouseCode === order.warehouseCode &&
          serial.locationCode === "FLEX-01" &&
          serial.status === "In_Stock",
        "Wrong SN, SKU, condition or location. Scan an available New EQ4800-S at FLEX-01.",
      );
      requireThat(
        !stock.transfers.some(
          (t) => t.status !== "Received" && t.serials.includes(sn),
        ),
        "SN belongs to the expected transfer list. Use the outbound units.",
      );
      next.pickScans.push(sn);
      if (next.pickScans.length === line.requiredQty) {
        stock = prepareOutbound(
          stock,
          order.id,
          line.id,
          "FLEX-01",
          line.requiredQty,
        );
        for (const serialNumber of next.pickScans)
          stock = scanOutboundSerial(stock, order.id, line.id, serialNumber);
        const prepared = stock.outboundOrders[0];
        prepared.preparedAt = prepared.readyForPickupAt = timestamp();
        prepared.lines[0].allocations = next.pickScans.map((serialNumber) => ({
          id: uid(),
          locationCode: "FLEX-01",
          quantity: 1,
          serialNumber,
          preparedAt: timestamp(),
        }));
        audit(
          stock,
          "Ready for Pickup",
          order.shNo,
          "Exact location, SKU, condition and both unique SNs validated atomically.",
        );
      }
      break;
    }
    case "collect": {
      requireThat(
        order.status === "Ready_for_Pickup" && !next.collection,
        "Shipment must be Ready for Pickup and not already collected.",
      );
      requireThat(
        command.kind === "Engineer" || command.kind === "Driver",
        "Unknown pickup flow.",
      );
      requireThat(
        normalize(command.reference) === order.pickupCode ||
          normalize(command.reference) === order.shNo ||
          order.lines.some((item) => item.workOrderNo && normalize(command.reference) === normalize(item.workOrderNo)),
        "Pickup number does not match this shipment.",
      );
      if (command.kind === "Engineer")
        requireThat(
          order.lines.some((item) => item.workOrderNo && normalize(command.reference) === normalize(item.workOrderNo)),
          "Scan the work order QR code for engineer identity confirmation.",
        );
      if (command.kind === "Engineer")
        requireThat(
          normalize(command.identity ?? command.collector) === "ENG-2048",
          "This simulated engineer is not authorised for this shipment.",
        );
      for (const sn of line.scannedSerials) {
        const serial = stock.serials.find((s) => s.serialNumber === sn);
        requireThat(
          serial &&
            serial.status === "Prepared" &&
            serial.relatedShNo === order.shNo &&
            serial.warehouseCode === order.warehouseCode &&
            serial.sku === line.sku &&
            serial.condition === line.requiredCondition &&
            serial.locationCode === line.allocationLocation,
          "Prepared SN evidence no longer matches shipment.",
        );
      }
      stock = dispatchOutbound(stock, order.id);
      const at = timestamp();
      stock.outboundOrders[0].outboundAt = at;
      next.collection = {
        kind: command.kind,
        collector: command.kind === "Engineer" ? "Alex Chen" : command.collector.trim() || "QR scanner",
        identity: command.kind === "Engineer" ? normalize(command.identity ?? command.collector) : undefined,
        at,
      };
      for (const serialNumber of line.scannedSerials) {
        const serial = stock.serials.find((item) => item.serialNumber === serialNumber);
        if (serial) serial.relatedWorkOrderNo = line.workOrderNo;
      }
      audit(
        stock,
        "Pickup Verified / Collected",
        order.shNo,
        `${command.kind} pickup ${order.shNo}; engineer identity ${command.identity ?? "not applicable"}; QR confirmation is the digital signature and dispatch event. Identity is simulated.`,
        command.kind === "Engineer" ? normalize(command.identity ?? command.collector) : command.collector.trim() || "QR scanner",
      );
      break;
    }
    case "return": {
      requireThat(
        normalize(command.location) === "REPAIR-01",
        "Confirm physical location REPAIR-01.",
      );
      requireThat(command.serials.length > 0, "Scan at least one SN.");
      const serials = command.serials.map(normalize);
      requireThat(
        new Set(serials).size === serials.length,
        "Duplicate SN in receiving batch.",
      );
      for (const sn of serials) {
        const serial = stock.serials.find((s) => s.serialNumber === sn);
        requireThat(
          serial,
          "Unknown SN identity. Use a documented demo SN; no SKU will be guessed.",
        );
        stock = receiveFaulty(stock, {
          serialNumber: sn,
          sku: serial.sku,
          model: serial.model,
          relatedShNo: serial.relatedShNo ?? "",
        });
        stock.repairJobs!.push({
          id: uid(),
          serialNumber: sn,
          sku: serial.sku,
          model: serial.model,
          warehouseCode: "SYD",
          currentLocation: "REPAIR-01",
          originalShNo: serial.relatedShNo,
          status: "Pending_Repair",
          source: "Native_Return",
          receivedAt: timestamp(),
          remark: "Synthetic physical receipt.",
        });
        if (!serial.relatedShNo)
          stock.exceptions.push({
            id: uid(),
            type: "MISSING_SH_REFERENCE",
            severity: "Medium",
            entityReference: sn,
            message:
              "Warehouse receipt completed. Business documentation pending. After-sales Action Required: link the original SH/order.",
            status: "Open",
            createdAt: timestamp(),
          });
      }
      break;
    }
    case "transferScan":
    case "transferScanBatch": {
      const sending = command.phase === "send";
      requireThat(
        transfer.status === (sending ? "Draft" : "In_Transit"),
        "Transfer is not at this scan stage.",
      );
      const scans = sending ? next.sentScans : next.receivedScans;
      const values = command.type === "transferScanBatch" ? command.values : [command.value];
      requireThat(values.length > 0, "Scan or paste at least one SN.");
      const batch = values.map(normalize);
      requireThat(new Set(batch).size === batch.length, "Duplicate SN in batch.");
      for (const sn of batch) {
        requireThat(!scans.includes(sn), "Duplicate SN. Each unit must be scanned once at this warehouse.");
        requireThat(transfer.serials.includes(sn), "Unexpected / wrong SN. It is not in the expected transfer list.");
        const serial = stock.serials.find((s) => s.serialNumber === sn);
        requireThat(serial && serial.sku === transfer.sku && serial.condition === transfer.condition && serial.warehouseCode === transfer.sourceWarehouse && serial.status === (sending ? "In_Stock" : "In_Transit") && (!sending || serial.locationCode === transfer.sourceLocation), "SN state, warehouse, location or condition does not match the transfer.");
      }
      scans.push(...batch);
      break;
    }
    case "transferOut": {
      requireThat(
        transfer.status === "Draft" && next.sentScans.length === transfer.qty,
        "Missing source SN scan.",
      );
      stock = dispatchTransfer(stock, transfer.id);
      stock.transfers[0].dispatchedAt = timestamp();
      break;
    }
    case "transferIn": {
      requireThat(
        transfer.status === "In_Transit" &&
          next.receivedScans.length === transfer.qty &&
          transfer.serials.every((sn) => next.receivedScans.includes(sn)),
        "Missing destination SN scan. Source scans cannot prove receipt.",
      );
      stock = receiveTransfer(stock, transfer.id, normalize(command.location));
      stock.transfers[0].receivedAt = timestamp();
      break;
    }
    case "startRepair":
    case "completeRepair": {
      const sn = normalize(command.sn);
      const serial = stock.serials.find((s) => s.serialNumber === sn);
      const job = stock.repairJobs?.find(
        (j) =>
          j.serialNumber === sn &&
          ["Pending_Repair", "In_Repair"].includes(j.status),
      );
      requireThat(
        serial?.status === "Repair" && serial.condition === "Repair" && job,
        "Scan an SN received into Repair with an active repair job.",
      );
      if (command.type === "startRepair") {
        assertRepairCanStart(job.status);
        job.status = "In_Repair";
        job.repairStartedAt = timestamp();
        audit(stock, "Repair started", sn, "Native repair job now In_Repair.");
        break;
      }
      assertRepairCanComplete(job.status);
      const location = normalize(command.location);
      requireThat(
        stock.locations.some(
          (l) =>
            l.warehouseCode === "SYD" &&
            l.code === location &&
            l.active &&
            (!l.serviceZone || l.zone === "FLEX"),
        ),
        "Choose an active Sydney good-stock location.",
      );
      const from = stock.inventory.find(
        (b) =>
          b.sku === serial.sku &&
          b.warehouseCode === "SYD" &&
          b.locationCode === serial.locationCode &&
          b.condition === "Repair",
      );
      requireThat(
        from && from.physicalQty - from.frozenQty >= 1,
        "Repair balance does not cover this unit.",
      );
      let to = stock.inventory.find(
        (b) =>
          b.sku === serial.sku &&
          b.warehouseCode === "SYD" &&
          b.locationCode === location &&
          b.condition === "Repair_Good",
      );
      if (!to) {
        to = {
          ...from,
          id: uid(),
          locationCode: location,
          condition: "Repair_Good",
          physicalQty: 0,
          frozenQty: 0,
          availableQty: 0,
          inTransitQty: 0,
        };
        stock.inventory.push(to);
      }
      from.physicalQty--;
      from.availableQty = from.physicalQty - from.frozenQty;
      to.physicalQty++;
      to.availableQty = to.physicalQty - to.frozenQty;
      const previousLocation = serial.locationCode;
      serial.condition = "Repair_Good";
      serial.status = "In_Stock";
      serial.locationCode = location;
      job.status = "Repair_Good";
      job.currentLocation = location;
      job.outcome = "Repair_Good";
      job.repairCompletedAt = job.returnedToStockAt = timestamp();
      stock.transactions.unshift({
        id: uid(),
        at: timestamp(),
        type: "Repair_Completed",
        warehouseCode: "SYD",
        sku: serial.sku,
        model: serial.model,
        serialNumber: sn,
        qty: 1,
        condition: "Repair_Good",
        sourceCondition: "Repair",
        targetCondition: "Repair_Good",
        fromLocation: previousLocation,
        toLocation: location,
        businessReference: sn,
        remark:
          "Same SN; condition reclassification; total physical quantity preserved.",
      });
      audit(
        stock,
        "Repair completed",
        sn,
        `Repair → Repair_Good at ${location}. Physical total unchanged.`,
      );
      break;
    }
  }
  for (const transaction of stock.transactions) {
    if (!source.stock.transactions.some((t) => t.id === transaction.id))
      transaction.actor =
        command.type === "collect" ? command.collector : "Demo operator";
  }
  next.stock = stock;
  return next;
}

export interface DemoIssue {
  code: string;
  reference: string;
  reason: string;
  investigation: string;
  severity: "High" | "Medium";
  status: string;
}
export function auditDemo(stock: WmsState): DemoIssue[] {
  const issues: DemoIssue[] = [];
  const add = (
    code: string,
    reference: string,
    reason: string,
    investigation: string,
    severity: "High" | "Medium" = "High",
  ) =>
    issues.push({
      code,
      reference,
      reason,
      investigation,
      severity,
      status: "Open",
    });
  for (const b of stock.inventory) {
    const product = stock.products.find((p) => p.sku === b.sku);
    const serials = stock.serials.filter(
      (s) =>
        s.sku === b.sku &&
        s.locationCode === b.locationCode &&
        s.warehouseCode === b.warehouseCode &&
        s.condition === b.condition &&
        isPhysicallyPresentSerialStatus(s.status),
    );
    if (product?.serialTrackingRequired && serials.length !== b.physicalQty)
      add(
        "SN_COUNT_MISMATCH",
        `${b.locationCode} / ${b.sku}`,
        `Physical ${b.physicalQty}; physically present SNs ${serials.length}.`,
        "Recount units and verify SN coverage.",
      );
    if (b.physicalQty < 0 || b.frozenQty < 0 || b.physicalQty < b.frozenQty)
      add(
        "NEGATIVE_INVENTORY",
        b.id,
        "Physical / frozen balance is invalid.",
        "Review reservations and correcting transactions.",
      );
    const ledgerQty = stock.transactions.reduce((sum, t) => {
      if (t.sku !== b.sku || t.warehouseCode !== b.warehouseCode) return sum;
      if (t.type === "Prepared") return sum;
      const inbound =
        t.toLocation === b.locationCode &&
        (t.targetCondition ?? t.condition) === b.condition
          ? t.qty
          : 0;
      const outbound =
        t.fromLocation === b.locationCode &&
        (t.sourceCondition ?? t.condition) === b.condition
          ? t.qty
          : 0;
      return sum + inbound - outbound;
    }, 0);
    if (ledgerQty !== b.physicalQty)
      add(
        "TRANSACTION_BALANCE_MISMATCH",
        b.id,
        `Ledger ${ledgerQty}; balance ${b.physicalQty}.`,
        "Reconcile immutable movement history to opening balance.",
      );
  }
  for (const s of stock.serials) {
    if (
      isPhysicallyPresentSerialStatus(s.status) &&
      (!stock.locations.some(
        (l) => l.code === s.locationCode && l.warehouseCode === s.warehouseCode,
      ) ||
        !stock.inventory.some(
          (b) =>
            b.sku === s.sku &&
            b.locationCode === s.locationCode &&
            b.warehouseCode === s.warehouseCode &&
            b.condition === s.condition &&
            b.physicalQty > 0,
        ))
    )
      add(
        "UNLINKED_SN_RECORD",
        s.serialNumber,
        "SN location or inventory chain cannot be reconciled.",
        "Review location, inventory state and business references.",
      );
    if (
      stock.outboundOrders.some(
        (o) =>
          o.status === "Outbound" &&
          o.lines.some((l) => l.scannedSerials.includes(s.serialNumber)) &&
          !stock.transactions.some(
            (t) =>
              t.type === "Return_to_Repair" &&
              t.serialNumber === s.serialNumber &&
              o.outboundAt &&
              Date.parse(t.at) >= Date.parse(o.outboundAt),
          ),
      ) &&
      s.status !== "Outbound"
    )
      add(
        "OUTBOUND_STATUS_MISMATCH",
        s.serialNumber,
        "Dispatched order still has an in-stock SN.",
        "Review dispatch closure and SN state.",
      );
    if (
      stock.repairJobs?.some(
        (j) => j.serialNumber === s.serialNumber && j.status === "Repair_Good",
      ) &&
      s.condition === "Repair"
    )
      add(
        "REPAIR_STATUS_RESIDUAL",
        s.serialNumber,
        "Completed repair still appears in Repair inventory.",
        "Compare repair completion with condition movement.",
      );
  }
  for (const t of stock.transfers)
    if (
      t.status === "In_Transit" &&
      t.dispatchedAt &&
      Date.now() - Date.parse(t.dispatchedAt) > 86400000
    )
      add(
        "TRANSFER_NOT_RECEIVED",
        t.transferNo,
        "Dispatched over 24 hours ago; no destination receipt.",
        "Ask destination to verify expected versus actual SNs.",
        "Medium",
      );
  for (const e of stock.exceptions.filter((e) => e.status !== "Resolved"))
    issues.push({
      code: e.type,
      reference: e.entityReference,
      reason: e.message,
      investigation: "After-sales team: attach the original order reference.",
      severity: "Medium",
      status: e.status,
    });
  return issues;
}

/** Deliberately inconsistent read-only snapshot for demonstrating rule detection. */
export function auditSample() {
  const { stock } = createDemoSession();
  stock.inventory[0].physicalQty += 5;
  stock.inventory[1].physicalQty = -1;
  stock.serials[0].locationCode = "MISSING-LOCATION";
  stock.outboundOrders[0].status = "Outbound";
  stock.outboundOrders[0].lines[0].scannedSerials = [
    stock.serials[1].serialNumber,
  ];
  stock.serials[4].condition = "Repair";
  stock.repairJobs = [
    {
      id: "sample-repair",
      serialNumber: stock.serials[4].serialNumber,
      sku: stock.serials[4].sku,
      model: stock.serials[4].model,
      warehouseCode: "SYD",
      currentLocation: "FLEX-01",
      status: "Repair_Good",
      source: "Native_Return",
      receivedAt: timestamp(),
      remark: "Deliberate audit sample inconsistency.",
    },
  ];
  stock.transfers[0].status = "In_Transit";
  stock.transfers[0].dispatchedAt = new Date(
    Date.now() - 48 * 3600000,
  ).toISOString();
  return auditDemo(stock);
}

export function demoMetrics(session: DemoSession) {
  const s = session.stock;
  const sum = (field: "physicalQty" | "frozenQty" | "inTransitQty") =>
    s.inventory.reduce((n, b) => n + b[field], 0);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Sydney",
  });
  return {
    Physical: sum("physicalQty"),
    Available: s.inventory
      .filter((b) => ["New", "Repair_Good", "Material"].includes(b.condition))
      .reduce((n, b) => n + b.physicalQty - b.frozenQty, 0),
    Frozen: sum("frozenQty"),
    "In Transit": sum("inTransitQty"),
    Repair: s.inventory
      .filter((b) => b.condition === "Repair")
      .reduce((n, b) => n + b.physicalQty, 0),
    "Outbound Today": s.outboundOrders
      .filter(
        (o) =>
          o.outboundAt &&
          new Date(o.outboundAt).toLocaleDateString("en-CA", {
            timeZone: "Australia/Sydney",
          }) === today,
      )
      .reduce(
        (n, o) => n + o.lines.reduce((q, l) => q + l.dispatchedQty, 0),
        0,
      ),
    "Open Exceptions": auditDemo(s).length,
    "Transfer Pending": s.transfers.filter((t) => t.status !== "Received")
      .length,
    "Repair Backlog":
      s.repairJobs?.filter((j) =>
        ["Pending_Repair", "In_Repair"].includes(j.status),
      ).length ?? 0,
  };
}

export function traceDemo(
  stock: WmsState,
  sn: string,
): Array<StockTransaction & { actor: string; result: string }> {
  const serial = stock.serials.find((s) => s.serialNumber === normalize(sn));
  if (!serial) {
    const order = stock.outboundOrders.find((item) => item.shNo === normalize(sn) || item.pickupCode === normalize(sn) || item.lines.some((line) => line.workOrderNo?.toUpperCase() === normalize(sn)));
    const transfer = stock.transfers.find((item) => item.transferNo === normalize(sn));
    if (order) {
      const references = [order.shNo, order.pickupCode, ...order.lines.map((line) => line.workOrderNo)].filter(Boolean);
      return stock.transactions.filter((txn) => txn.businessReference && references.includes(txn.businessReference)).map((txn) => ({ ...txn, actor: txn.actor ?? "Demo operator", result: "Recorded" })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    }
    if (transfer) return stock.transactions.filter((txn) => txn.businessReference === transfer.transferNo || transfer.serials.includes(txn.serialNumber ?? "")).map((txn) => ({ ...txn, actor: txn.actor ?? "Demo operator", result: "Recorded" })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return [];
  }
  const orderRefs = stock.outboundOrders
    .filter((o) =>
      o.lines.some((l) => l.scannedSerials.includes(serial.serialNumber)),
    )
    .map((o) => o.shNo);
  return stock.transactions
    .filter(
        (t) =>
          t.serialNumber === serial.serialNumber ||
          (!t.serialNumber &&
          t.businessReference &&
          (orderRefs.includes(t.businessReference) ||
            t.businessReference === serial.relatedTransferNo)),
    )
    .map((t) => ({
      ...t,
      actor: t.actor ?? "Demo operator",
      result: "Recorded",
    }))
    .reverse()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function demoLocation(stock: WmsState, code: string, warehouse = "SYD") {
  const location = stock.locations.find(
    (l) => l.code === code && l.warehouseCode === warehouse,
  );
  const balances = stock.inventory.filter(
    (b) => b.locationCode === code && b.warehouseCode === warehouse,
  );
  const serials = stock.serials.filter(
    (s) =>
      s.locationCode === code &&
      s.warehouseCode === warehouse &&
      isPhysicallyPresentSerialStatus(s.status),
  );
  const qty = balances.reduce((n, b) => n + b.physicalQty, 0);
  return {
    location,
    balances,
    serials,
    qty,
    frozen: balances.reduce((n, b) => n + b.frozenQty, 0),
    available: balances.reduce((n, b) => n + b.availableQty, 0),
    occupancy: qty ? "Occupied" : "Empty",
    movements: stock.transactions
      .filter(
        (t) =>
          t.warehouseCode === warehouse &&
          (t.fromLocation === code || t.toLocation === code),
      )
      .slice(0, 5),
  };
}

export function demoReport(stock: WmsState, days: number): StockTransaction[] {
  return stock.transactions.filter(
    (t) =>
      t.type !== "Opening" && Date.parse(t.at) >= Date.now() - days * 86400000,
  );
}
