import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { up17AirportLookup, type AirportSuggestion } from "@/lib/up17/up17.functions";
import { inputClass } from "@/components/search-form";

export function AirportAutocomplete({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const lookup = useServerFn(up17AirportLookup);
  const [text, setText] = useState(value);
  const [rows, setRows] = useState<AirportSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setText((prev) => (prev.toUpperCase() === value.toUpperCase() ? prev : value));
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await lookup({ data: { query: q, limit: 12 } });
        if (!cancelled) setRows(res.results);
      } catch {
        if (!cancelled) setRows([]);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, lookup]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrap} className="relative">
      <input
        value={text}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          onChange(e.target.value.trim().toUpperCase());
        }}
        onFocus={() => setOpen(true)}
        className={inputClass}
      />
      {open && rows.length > 0 ? (
        <ul className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border/70 bg-card/95 p-1 text-xs shadow-2xl backdrop-blur-xl">
          {rows.map((r) => (
            <li key={`${r.iata}-${r.name}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(r.iata);
                  setText(`${r.city}, ${r.country} (${r.iata})`);
                  setOpen(false);
                }}
                className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left hover:bg-primary/10"
              >
                <span className="font-mono text-[11px] text-primary">{r.iata}</span>
                <span className="text-foreground">
                  {r.city}, {r.country}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
