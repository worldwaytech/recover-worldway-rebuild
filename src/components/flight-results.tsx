import { useMemo } from "react";

type Flight = {
  airline?: string;
  flightNumber?: string;
  aircraft?: string;
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
  duration?: string;
  price?: number;
  currency?: string;
  cabin?: string;
  source?: string;
};

function fmtPrice(v?: number, c?: string) {
  if (v == null || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c || "USD",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${c ?? ""} ${v.toLocaleString()}`.trim();
  }
}
function fmtTime(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      });
}

function readFlights(data: unknown): Flight[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as Flight[];
  const d = data as Record<string, unknown>;
  const nested =
    d.data && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const direct = d.flights ?? d.results ?? d.items;
  const inner = nested ? (nested.flights ?? nested.results ?? nested.items) : undefined;

  if (Array.isArray(direct)) return direct as Flight[];
  if (Array.isArray(inner)) return inner as Flight[];
  if (Array.isArray(d.data)) return d.data as Flight[];

  return [];
}

export function FlightResults({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: unknown;
}) {
  const flights = useMemo<Flight[]>(() => readFlights(data), [data]);

  if (!loading && !error && data && flights.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-background/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No flights found for this route and date. Try adjusting your search.
        </p>
      </div>
    );
  }

  if (flights.length === 0) return null;

  return (
    <div className="grid gap-3">
      {flights.map((f, i) => (
        <article
          key={i}
          className="rounded-xl border border-border/50 bg-background/40 p-4 transition hover:border-primary/30"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-lg text-foreground">
                {f.airline ?? "Flight Service"}
              </h3>
              <div className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {[f.flightNumber, f.aircraft, f.cabin].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg text-primary">{fmtPrice(f.price, f.currency)}</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                per passenger
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-lg font-medium text-foreground">{f.origin}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {fmtTime(f.departure)}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 px-4 text-muted-foreground">
              <div className="h-[1px] w-12 bg-border" />
              <div className="text-[9px] uppercase tracking-widest">{f.duration || "Direct"}</div>
            </div>
            <div className="flex-1 text-right">
              <div className="text-lg font-medium text-foreground">{f.destination}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {fmtTime(f.arrival)}
              </div>
            </div>
          </div>
          {f.source ? (
            <div className="mt-4 border-t border-border/30 pt-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Source · {f.source}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
