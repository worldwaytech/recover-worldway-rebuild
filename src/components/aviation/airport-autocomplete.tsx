import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchAirportMaster, type AirportOption } from "@/lib/aviation/private-aviation.functions";
import { avField } from "./contact-fields";

export function airportCode(a: AirportOption) {
  return a.iata || a.icao;
}

export function airportLabel(a: AirportOption) {
  return `${airportCode(a)} — ${a.name}${a.city ? `, ${a.city}` : ""}, ${a.country}`;
}

/** Worldwide airport search (IATA/ICAO code, airport name, city). */
export function AirportAutocomplete({
  value,
  onSelect,
  placeholder,
  required,
  ariaLabel,
  onTextChange,
}: {
  value: AirportOption | null;
  onSelect: (a: AirportOption | null) => void;
  placeholder?: string;
  required?: boolean;
  ariaLabel?: string;
  onTextChange?: (text: string) => void;
}) {
  const search = useServerFn(searchAirportMaster);
  const [text, setText] = useState(value ? airportLabel(value) : "");
  const [items, setItems] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    setText(value ? airportLabel(value) : "");
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function onType(v: string) {
    setText(v);
    onTextChange?.(v);
    if (value) onSelect(null);
    const q = v.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    const my = ++seq.current;
    setTimeout(async () => {
      if (my !== seq.current) return;
      try {
        const r = await search({ data: { q } });
        if (my === seq.current) {
          setItems(r.items);
          setActive(0);
          setOpen(true);
        }
      } catch {
        /* keep previous */
      }
    }, 150);
  }

  function pick(a: AirportOption) {
    onSelect(a);
    setText(airportLabel(a));
    setOpen(false);
  }

  return (
    <div ref={wrap} className="relative">
      <input
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        required={required}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(items[active]!); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={avField}
      />
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-80 w-full min-w-72 overflow-auto rounded-lg border border-border bg-popover py-1 text-sm shadow-xl">
          {items.map((a, i) => (
            <li
              key={`${a.iata}-${a.icao}-${a.name}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(a); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-primary/15" : ""}`}
            >
              <span className="mr-2 font-mono text-primary">{a.iata || a.icao}</span>
              {a.iata && a.icao ? <span className="mr-2 font-mono text-xs text-muted-foreground">{a.icao}</span> : null}
              <span className="text-foreground">{a.name}</span>
              <div className="text-xs text-muted-foreground">{[a.city, a.country].filter(Boolean).join(", ")}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
