import type { Locale } from "@/i18n/config";

function wallClockParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error("Warehouse wall-clock time must use YYYY-MM-DDTHH:mm.");
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
}

function partsAt(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

const epoch = (parts: ReturnType<typeof wallClockParts>) =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

export function warehouseWallClockToUtc(value: string, timeZone: string) {
  const desired = wallClockParts(value);
  let candidate = new Date(epoch(desired));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = partsAt(candidate, timeZone);
    candidate = new Date(candidate.getTime() + epoch(desired) - epoch(observed));
  }
  const finalParts = partsAt(candidate, timeZone);
  if (epoch(finalParts) !== epoch(desired))
    throw new Error("This warehouse wall-clock time is invalid or ambiguous for the selected timezone.");
  return candidate;
}

export function formatWarehouseDateTime(
  value: string | Date,
  locale: Locale,
  timeZone: string,
) {
  const parts = partsAt(typeof value === "string" ? new Date(value) : value, timeZone);
  const minute = String(parts.minute).padStart(2, "0");
  if (locale === "zh-CN")
    return `${parts.year}年${parts.month}月${parts.day}日 ${String(parts.hour).padStart(2, "0")}:${minute}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const period = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${parts.day} ${months[parts.month - 1]} ${parts.year}, ${hour}:${minute} ${period}`;
}

export function formatWarehouseTime(value: string | Date, locale: Locale, timeZone: string) {
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-AU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale !== "zh-CN",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function currentWarehouseWallClock(timeZone: string, date = new Date()) {
  const parts = partsAt(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function warehouseDateKey(value: string | Date, timeZone: string) {
  const parts = partsAt(typeof value === "string" ? new Date(value) : value, timeZone);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
