import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { lookupPartner, type PartnerLookupRow } from "@/lib/wwl.functions";

type Kind = "airports" | "cities" | "locations";

function formatRow(row: PartnerLookupRow, kind: Kind): string {
  const isAirport = kind === "airports" || (kind === "locations" && row.type === "airport");
  if (isAirport && row.iata) {
    const bits = [row.airport_name, row.city, row.country].filter(Boolean).join(" · ");
    return `${row.iata} — ${bits}`;
  }
  return [row.city, row.country].filter(Boolean).join(", ");
}

function tokenFor(row: PartnerLookupRow, kind: Kind): string {
  const isAirport = kind === "airports" || (kind === "locations" && row.type === "airport");
  if (isAirport && row.iata) return row.iata;
  if (row.city) return row.country ? `${row.city}, ${row.country}` : row.city;
  return row.iata ?? "";
}

export function LocationAutocomplete({
  name,
  kind,
  label,
  placeholder,
  required,
  defaultValue = "",
  className,
  onSelect,
  onChange,
}: {
  name: string;
  kind: Kind;
  label?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  className?: string;
  onSelect?: (row: PartnerLookupRow) => void;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [rows, setRows] = useState<PartnerLookupRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const lookup = useServerFn(lookupPartner);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setRows([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await lookup({ data: { kind, query: q, limit: 10 } });
        if (cancelled) return;
        if (!res.ok) {
          setRows([]);
          if (res.status === 429) setError("Too many requests — slow down.");
          else if (res.status === 401) setError("Lookup unavailable.");
          else if (res.status === 422) setError(null);
          else setError(res.error ?? "Lookup failed");
        } else {
          setRows(res.results ?? []);
          setError(null);
          setOpen(document.activeElement === inputRef.current);
          setActive(-1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, kind, lookup]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onSearchSubmit() {
      setOpen(false);
      setActive(-1);
      inputRef.current?.blur();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("wwtg:search-submit", onSearchSubmit);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("wwtg:search-submit", onSearchSubmit);
    };
  }, []);

  function pick(row: PartnerLookupRow) {
    const token = tokenFor(row, kind);
    setValue(token);
    setOpen(false);
    onChange?.(token);
    onSelect?.(row);
  }

  const inputCls =
    className ??
    "w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none";

  return (
    <div ref={wrapRef} className="relative">
      {label ? (
        <span className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </span>
      ) : null}
      <input
        ref={inputRef}
        name={name}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          onChange?.(next);
          setOpen(true);
        }}
        onFocus={() => {
          if (rows.length) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!open || !rows.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(rows.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(rows[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={inputCls}
      />
      {open && (rows.length > 0 || loading || error) ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
        >
          {loading ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
          ) : error ? (
            <li className="px-3 py-2 text-xs text-destructive">{error}</li>
          ) : (
            rows.map((r, i) => (
              <li
                key={`${r.iata ?? ""}-${r.city ?? ""}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-primary/15 text-foreground" : "text-foreground/90 hover:bg-primary/10"}`}
              >
                <div className="truncate">{formatRow(r, kind)}</div>
                {r.type ? (
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {r.type}
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
