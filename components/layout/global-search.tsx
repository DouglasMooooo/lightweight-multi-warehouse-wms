"use client";

import { MapPin, PackageSearch, Search, Tag, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { WarehouseCode } from "@/domain/types";
import { useI18n } from "@/i18n/provider";

interface SearchResult {
  type: "SN" | "SH" | "SKU" | "Location";
  primary: string;
  secondary: string;
  href: string;
}

const resultIcon = {
  SN: Tag,
  SH: PackageSearch,
  SKU: PackageSearch,
  Location: MapPin,
};

export function GlobalSearch({ warehouse }: { warehouse: WarehouseCode }) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const current = ++sequence.current;
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}&warehouse=${warehouse}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : { rows: [] })
        .then((body) => {
          if (current === sequence.current) {
            setRows(body.rows ?? []);
            setOpen(true);
          }
        })
        .catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, warehouse]);

  return (
    <div className="global-search">
      <Search aria-hidden />
      <input
        aria-label={t("search.global")}
        placeholder={t("search.global")}
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length < 2) {
            setRows([]);
            setOpen(false);
          }
        }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && rows[0]) router.push(rows[0].href);
        }}
      />
      {query && <button type="button" aria-label={t("common.cancel")} onClick={() => { setQuery(""); setOpen(false); }}><X /></button>}
      {open && (
        <div className="global-search-results">
          {rows.map((row) => {
            const Icon = resultIcon[row.type];
            return (
              <Link href={row.href} key={`${row.type}:${row.primary}`} onClick={() => setOpen(false)}>
                <Icon />
                <span><strong>{row.primary}</strong><small>{row.secondary}</small></span>
                <b>{row.type}</b>
              </Link>
            );
          })}
          {!rows.length && <div className="global-search-empty">{t("search.noResults")}</div>}
        </div>
      )}
    </div>
  );
}
