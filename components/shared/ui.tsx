"use client";

import { PackageOpen } from "lucide-react";
import type { ReactNode } from "react";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button className={cn("btn", className)} {...props}>{children}</button>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="page-title-row"><h2>{title}</h2>{badge}</div>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <div className="empty"><PackageOpen /><div>{label}</div></div>;
}
