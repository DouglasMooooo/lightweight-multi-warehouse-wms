"use client";

import { useI18n } from "@/i18n/provider";
import { cn } from "./ui";

export type StatusTone = "neutral" | "blue" | "amber" | "teal" | "red" | "grey" | "scrap";

export function statusTone(code: string): StatusTone {
  const value = code.toLowerCase();
  if (value.includes("scrap")) return "scrap";
  if (value.includes("cancel")) return "grey";
  if (value.includes("exception") || value.includes("failed") || value.includes("critical")) return "red";
  if (
    value.includes("outbound") ||
    value.includes("completed") ||
    value.includes("repair_good") ||
    value === "synced" ||
    value === "received"
  ) return "teal";
  if (value.includes("prepared") || value.includes("pickup") || value.includes("waiting") || value.includes("transit"))
    return "amber";
  if (value.includes("allocated") || value.includes("progress") || value.includes("repair")) return "blue";
  return "neutral";
}

export function StatusBadge({
  code,
  label,
  tone,
}: {
  code: string;
  label?: string;
  tone?: StatusTone | string;
}) {
  const { status } = useI18n();
  return <span className={cn("badge dot", tone ?? statusTone(code))}>{label ?? status(code)}</span>;
}

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: StatusTone | string;
}) {
  const label = String(children);
  return <span className={cn("badge dot", tone ?? statusTone(label))}>{children}</span>;
}
