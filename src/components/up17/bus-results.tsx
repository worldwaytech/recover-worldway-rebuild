import { BusBookPanel } from "./booking-panels";
import { useMemo, useState } from "react";

type BusPoint = { name: string; location: string; time: string | null };
type BusPolicy = { policy: string; charge: number | null; chargeType: number | null };

type Bus = {
  resultIndex: string;
  operator: string;
  serviceName?: string;
  busType: string;
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  durationMin: number | null;
  price: number | null;
  basePrice?: number | null;
  tax?: number | null;
  currency: string;
  seatsAvailable: number | null;
  maxSeatsPerTicket?: number | null;
  refundable: boolean;
  amenities: string[];
  boardingPoints?: BusPoint[];
  droppingPoints?: BusPoint[];
  cancellationPolicies?: BusPolicy[];
};

function fmtPrice(v?: number | null, c?: string) {
  if (v == null || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c || "INR",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${c ?? ""} ${v.toLocaleString()}`.trim();
  }
}

function fmtTime(v?: string | null) {
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

function fmtClock(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(min?: number | null) {
  if (min == null || Number.isNaN(min)) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function fmtCharge(p: BusPolicy, currency: string) {
  if (p.charge == null) return "";
  return p.chargeType === 1 ? fmtPrice(p.charge, currency) : `${p.charge}%`;
}

function readBuses(data: unknown): Bus[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.buses)) return d.buses as Bus[];
  const nested =
    d.data && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  if (nested && Array.isArray(nested.buses)) return nested.buses as Bus[];
  return [];
}

function PointList({ title, points }: { title: string; points: BusPoint[] }) {
  if (points.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-primary">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {points.map((p, i) => (
          <li key={`${p.name}-${i}`} className="text-xs text-muted-foreground">
            <span className="text-foreground">{fmtClock(p.time)}</span> · {p.name}
            {p.location && p.location !== p.name ? (
              <span className="block text-[11px] opacity-80">{p.location}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BusCard({ bus, token }: { bus: Bus; token: string | null }) {
  const [open, setOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const boarding = bus.boardingPoints ?? [];
  const dropping = bus.droppingPoints ?? [];
  const policies = bus.cancellationPolicies ?? [];
  const hasDetail = boarding.length > 0 || dropping.length > 0 || policies.length > 0;

  return (
    <article className="rounded-xl border border-border/50 bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-foreground">{bus.operator || "Coach service"}</h3>
          <div className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {[bus.busType, bus.origin && bus.destination ? `${bus.origin} → ${bus.destination}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg text-primary">{fmtPrice(bus.price, bus.currency)}</div>
          {typeof bus.seatsAvailable === "number" ? (
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              {bus.seatsAvailable} seats
              {bus.maxSeatsPerTicket ? ` · max ${bus.maxSeatsPerTicket}/ticket` : ""}
            </div>
          ) : null}
        </div>
      </div>

      {bus.departure || bus.arrival || bus.durationMin ? (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {bus.departure ? (
            <div>
              <span className="text-foreground">Depart</span> · {fmtTime(bus.departure)}
            </div>
          ) : null}
          {bus.arrival ? (
            <div>
              <span className="text-foreground">Arrive</span> · {fmtTime(bus.arrival)}
            </div>
          ) : null}
          {bus.durationMin ? (
            <div>
              <span className="text-foreground">Duration</span> · {fmtDuration(bus.durationMin)}
            </div>
          ) : null}
        </div>
      ) : null}

      {bus.refundable ? <div className="mt-2 text-xs text-emerald-500">Refundable</div> : null}

      {bus.amenities && bus.amenities.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {bus.amenities.slice(0, 8).map((a, ai) => (
            <span
              key={ai}
              className="rounded-full border border-border/60 bg-background/40 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
            >
              {a}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        {hasDetail ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-full border border-border/60 px-4 py-1.5 text-[10px] uppercase tracking-[0.25em] text-foreground transition-colors hover:border-primary/60 hover:text-primary"
          >
            {open ? "Hide details" : "Boarding, dropping & policy"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={!token}
          onClick={() => setBooking((v) => !v)}
          className="rounded-full bg-primary px-4 py-1.5 text-[10px] uppercase tracking-[0.25em] text-primary-foreground disabled:opacity-40"
        >
          {booking ? "Close" : "Book seats"}
        </button>
      </div>
      {booking && token ? (
        <div className="mt-4">
          <BusBookPanel resultIndex={bus.resultIndex} token={token} operator={bus.operator} route={`${bus.origin} → ${bus.destination}`} departure={bus.departure ?? null} />
        </div>
      ) : null}

      {open && hasDetail ? (
        <div className="mt-4 grid gap-5 border-t border-border/50 pt-4 md:grid-cols-3">
          <PointList title="Boarding points" points={boarding} />
          <PointList title="Dropping points" points={dropping} />
          {policies.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-primary">
                Cancellation policy
              </div>
              <ul className="mt-2 space-y-1.5">
                {policies.map((p, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="text-foreground">{fmtCharge(p, bus.currency)}</span>
                    {p.policy ? ` · ${p.policy}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function Up17BusResults({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: unknown;
}) {
  const buses = useMemo<Bus[]>(() => readBuses(data), [data]);
  const token = data && typeof data === "object" && typeof (data as { searchTokenId?: unknown }).searchTokenId === "string" ? (data as { searchTokenId: string }).searchTokenId : null;

  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.3em] text-primary">Live Buses</div>
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
              <BusCard key={`${b.resultIndex}-${i}`} bus={b} token={token} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
