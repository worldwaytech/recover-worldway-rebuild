import { useMemo } from "react";

type Bus = {
  operator?: string;
  busType?: string;
  vehicle?: string;
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
  duration?: string;
  price?: number;
  currency?: string;
  seatsAvailable?: number;
  amenities?: string[];
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

function readBuses(data: unknown): Bus[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const nested =
    d.data && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const direct = d.buses ?? d.services ?? d.results ?? d.items;
  const inner = nested
    ? (nested.buses ?? nested.services ?? nested.results ?? nested.items)
    : undefined;
  const value = Array.isArray(direct) ? direct : Array.isArray(inner) ? inner : [];
  return value as Bus[];
}

export function BusResults({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: unknown;
}) {
  const buses = useMemo<Bus[]>(() => {
    return readBuses(data);
  }, [data]);

  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.3em] text-primary">Results</div>
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading live inventory…</div>
          ) : null}
          {!loading && buses.length > 0 ? (
            <div className="text-xs text-muted-foreground">{buses.length} services</div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}

        {!error && !loading && !data ? (
          <div className="text-sm text-muted-foreground">
            Submit the search to see live coach & bus services.
          </div>
        ) : null}

        {!error && data && buses.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No services returned for that route and date. Try adjusting your search.
          </div>
        ) : null}

        {buses.length > 0 ? (
          <div className="grid gap-3">
            {buses.map((b, i) => (
              <article key={i} className="rounded-xl border border-border/50 bg-background/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-serif text-lg text-foreground">
                      {b.operator ?? "Coach service"}
                    </h3>
                    <div className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      {[
                        b.busType ?? b.vehicle,
                        b.origin && b.destination ? `${b.origin} → ${b.destination}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg text-primary">{fmtPrice(b.price, b.currency)}</div>
                    {typeof b.seatsAvailable === "number" ? (
                      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        {b.seatsAvailable} seats
                      </div>
                    ) : null}
                  </div>
                </div>
                {b.departure || b.arrival || b.duration ? (
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {b.departure ? (
                      <div>
                        <span className="text-foreground">Depart</span> · {fmtTime(b.departure)}
                      </div>
                    ) : null}
                    {b.arrival ? (
                      <div>
                        <span className="text-foreground">Arrive</span> · {fmtTime(b.arrival)}
                      </div>
                    ) : null}
                    {b.duration ? (
                      <div>
                        <span className="text-foreground">Duration</span> · {b.duration}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {b.amenities && b.amenities.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {b.amenities.slice(0, 8).map((a, ai) => (
                      <span
                        key={ai}
                        className="rounded-full border border-border/60 bg-background/40 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                ) : null}
                {b.source ? (
                  <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    Source · {b.source}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
