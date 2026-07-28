export interface ReportingOrder {
  shNo: string;
  preparedAt?: string;
  outboundAt?: string;
  lines: Array<{ model: string; reportMachine: boolean; reportGroup?: string; quantity: number }>;
}

export interface ReportingReturn {
  relatedShNo?: string;
  receivedAt: string;
}

export interface ReportingMovement {
  transactionType: string;
  condition: string;
  quantity: number;
  effectiveAt: string;
}

const inPeriod = (value: string | undefined, from: Date, to: Date) => {
  if (!value) return false;
  const at = new Date(value);
  return at >= from && at <= to;
};

export function operationalOrderMetrics(
  orders: ReportingOrder[],
  returns: ReportingReturn[],
  from: Date,
  to: Date,
) {
  const preparedSh = new Set(orders.filter((row) => inPeriod(row.preparedAt, from, to)).map((row) => row.shNo));
  const outboundSh = new Set(orders.filter((row) => inPeriod(row.outboundAt, from, to)).map((row) => row.shNo));
  const returnedSh = new Set(returns.flatMap((row) => (row.relatedShNo ? [row.relatedShNo] : [])));
  const outstandingReturns = orders
    .filter((row) => row.outboundAt && !returnedSh.has(row.shNo))
    .map((row) => ({
      shNo: row.shNo,
      outboundAt: row.outboundAt!,
      models: [...new Set(row.lines.filter((line) => line.reportMachine).map((line) => line.model))],
    }));
  const machineMovements = new Map<string, number>();
  for (const order of orders.filter((row) => inPeriod(row.outboundAt, from, to))) {
    for (const line of order.lines.filter((row) => row.reportMachine)) {
      const key = line.reportGroup ? `${line.reportGroup}: ${line.model}` : line.model;
      machineMovements.set(key, (machineMovements.get(key) ?? 0) + line.quantity);
    }
  }
  return {
    preparedShCount: preparedSh.size,
    outboundShCount: outboundSh.size,
    outstandingReturns,
    machineMovements: Object.fromEntries(machineMovements),
  };
}

export function operationalMovementMetrics(
  movements: ReportingMovement[],
  from: Date,
  to: Date,
) {
  const period = movements.filter((row) => inPeriod(row.effectiveAt, from, to));
  const sum = (predicate: (row: ReportingMovement) => boolean) =>
    period.filter(predicate).reduce((total, row) => total + row.quantity, 0);
  return {
    newInbound: sum((row) => row.transactionType === "Inbound" && row.condition === "New"),
    newOutbound: sum((row) => row.transactionType === "Outbound" && row.condition === "New"),
    repairGoodInbound: sum(
      (row) =>
        row.condition === "Repair_Good" &&
        ["Inbound", "Repair_Completed", "RepairGood_Adjustment_In"].includes(row.transactionType),
    ),
    repairGoodOutbound: sum(
      (row) => row.transactionType === "Outbound" && row.condition === "Repair_Good",
    ),
    faultyReturns: sum((row) => row.transactionType === "Return_to_Repair"),
    repairCompleted: sum((row) => row.transactionType === "Repair_Completed"),
  };
}

function localDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day);
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((part) => part.type === type)?.value);
  const representedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return new Date(guess - (representedAsUtc - guess));
}

export function mondayToSunday(containing: Date, timeZone = "Australia/Sydney") {
  const local = localDateParts(containing, timeZone);
  const localCalendar = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const day = localCalendar.getUTCDay();
  localCalendar.setUTCDate(localCalendar.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const from = zonedMidnightUtc(
    localCalendar.getUTCFullYear(),
    localCalendar.getUTCMonth() + 1,
    localCalendar.getUTCDate(),
    timeZone,
  );
  localCalendar.setUTCDate(localCalendar.getUTCDate() + 7);
  const to = zonedMidnightUtc(
    localCalendar.getUTCFullYear(),
    localCalendar.getUTCMonth() + 1,
    localCalendar.getUTCDate(),
    timeZone,
  );
  to.setUTCMilliseconds(-1);
  return { from, to };
}

export function calendarMonth(year: number, zeroBasedMonth: number, timeZone = "Australia/Sydney") {
  const from = zonedMidnightUtc(year, zeroBasedMonth + 1, 1, timeZone);
  const nextYear = zeroBasedMonth === 11 ? year + 1 : year;
  const nextMonth = zeroBasedMonth === 11 ? 1 : zeroBasedMonth + 2;
  const to = zonedMidnightUtc(nextYear, nextMonth, 1, timeZone);
  to.setUTCMilliseconds(-1);
  return { from, to };
}
