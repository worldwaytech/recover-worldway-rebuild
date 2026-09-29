import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { up17CalendarFareLookup } from "@/lib/up17/up17.functions";

type Fare = { date: string; price: number; lowest: boolean };

/** Lowest live fares by departure date. Dates without a real fare are not shown. */
export function FareCalendar(props: {
  origin: string;
  destination: string;
  date: string;
  cabin: string;
  onPick: (date: string) => void;
}) {
  const lookup = useServerFn(up17CalendarFareLookup);
  const [fares, setFares] = useState<Fare[]>([]);
  const ready = /^[A-Z]{3}$/i.test(props.origin) && /^[A-Z]{3}$/i.test(props.destination) && /^\d{4}-\d{2}-\d{2}$/.test(props.date);

  useEffect(() => {
    if (!ready) return setFares([]);
    let live = true;
    lookup({ data: { origin: props.origin, destination: props.destination, date: props.date, cabin: props.cabin as never } })
      .then((r) => live && setFares(r.ok ? r.fares : []))
      .catch(() => live && setFares([]));
    return () => {
      live = false;
    };
  }, [ready, props.origin, props.destination, props.date, props.cabin, lookup]);

  if (!fares.length) return null;
  return (
    <div className="mt-5">
      <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        Lowest fares by date (per adult, from) — confirmed when you search
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {fares.map((f) => (
          <button
            key={f.date}
            type="button"
            onClick={() => props.onPick(f.date)}
            className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs transition ${
              f.date === props.date ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/60"
            }`}
          >
            <div className="text-muted-foreground">
              {new Date(`${f.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" })}
            </div>
            <div className={f.lowest ? "font-semibold text-primary" : "text-foreground"}>₹{f.price.toLocaleString("en-IN")}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
