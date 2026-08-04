import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell, PageHero } from "@/components/search-shell";
import { EmptyLegInquiry } from "@/components/empty-leg-inquiry";
import {
  CATEGORIES,
  REGIONS,
  getAircraft,
  AIRCRAFT_IMAGE_FALLBACK,
  type Aircraft,
  type EmptyLeg,
  type EmptyLegStatus,
} from "@/lib/empty-legs-data";
import { activeProvider } from "@/lib/aviation-provider";

export const Route = createFileRoute("/private-aviation/empty-legs")({
  head: () => ({
    meta: [
      { title: "Empty Legs Marketplace — Worldway Private Aviation" },
      {
        name: "description",
        content:
          "Discover indicative empty-leg opportunities across Europe, the Americas, the Middle East and Asia. Verified and quoted by the Worldway Private Aviation Concierge.",
      },
      { property: "og:title", content: "Empty Legs Marketplace — Worldway Private Aviation" },
      {
        property: "og:description",
        content:
          "Curated empty-leg opportunities on Gulfstream, Bombardier, Dassault, Embraer, Cessna and more.",
      },
      {
        property: "og:image",
        content:
          "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1600&q=80",
      },
    ],
  }),
  component: EmptyLegsPage,
});

type Intent = "book" | "quote" | "callback";

function EmptyLegsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All Regions");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All Aircraft");
  const [pax, setPax] = useState<number>(1);
  const [statusOnly, setStatusOnly] = useState(true);
  const [selected, setSelected] = useState<EmptyLeg | null>(null);
  const [intent, setIntent] = useState<Intent>("quote");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allLegs, setAllLegs] = useState<EmptyLeg[]>([]);
  const [featuredAircraft, setFeaturedAircraft] = useState<Aircraft[]>([]);

  // Data comes through the aviation provider abstraction so a future live
  // partner API can be swapped in without changing the UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [legs, ac] = await Promise.all([
        activeProvider.listEmptyLegs({ includeSold: true }),
        activeProvider.listAircraft(),
      ]);
      if (cancelled) return;
      setAllLegs(legs);
      setFeaturedAircraft(ac.slice(0, 4));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    return allLegs.filter((l) => {
      const ac = getAircraft(l.aircraftSlug);
      if (from && !`${l.fromCity} ${l.fromIata}`.toLowerCase().includes(from.toLowerCase()))
        return false;
      if (to && !`${l.toCity} ${l.toIata}`.toLowerCase().includes(to.toLowerCase())) return false;
      if (region !== "All Regions" && l.region !== region) return false;
      if (category !== "All Aircraft" && ac?.category !== category) return false;
      if (pax > l.seats) return false;
      if (date) {
        const d = new Date(date).toISOString().slice(0, 10);
        const start = l.departWindowStart.slice(0, 10);
        const end = l.departWindowEnd.slice(0, 10);
        if (d < start || d > end) return false;
      }
      if (statusOnly && (l.status === "Sold" || l.status === "Expired")) return false;
      return true;
    });
  }, [allLegs, from, to, date, region, category, pax, statusOnly]);

  function openInquiry(leg: EmptyLeg, next: Intent) {
    setSelected(leg);
    setIntent(next);
    setDialogOpen(true);
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Private Aviation · Empty Legs"
        title="Empty legs. Curated. Quiet luxury, at up to 70% off."
        subtitle="Indicative one-way opportunities on the world's finest business jets — verified and quoted by our Private Aviation Concierge."
        image="https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80"
      />

      {/* Search */}
      <section className="mx-auto -mt-16 max-w-6xl px-6">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-primary">
            Search the Fleet
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="From (city or airport)">
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="London, LTN…"
                className={fieldClass}
              />
            </Field>
            <Field label="To (city or airport)">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Nice, NCE…"
                className={fieldClass}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Passengers">
              <input
                type="number"
                min={1}
                max={25}
                value={pax}
                onChange={(e) => setPax(Number(e.target.value) || 1)}
                className={fieldClass}
              />
            </Field>
            <Field label="Region">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as typeof region)}
                className={fieldClass}
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Aircraft Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className={fieldClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={statusOnly}
                onChange={(e) => setStatusOnly(e.target.checked)}
                className="h-4 w-4"
              />
              Hide sold / expired
            </label>
            <div className="flex items-end justify-end">
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setDate("");
                  setRegion("All Regions");
                  setCategory("All Aircraft");
                  setPax(1);
                }}
                className="rounded-full border border-border px-5 py-2.5 text-xs uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-primary"
              >
                Reset
              </button>
            </div>
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Availability is indicative only and subject to confirmation by our Private Aviation
            Team.
          </p>
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto mt-14 max-w-7xl px-6">
        <div className="mb-6 rounded-xl border border-primary/40 bg-primary/10 p-4 text-xs leading-relaxed text-foreground md:text-sm">
          <span className="mr-2 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-primary-foreground">
            Indicative
          </span>
          Availability shown is <strong>indicative only</strong> and subject to confirmation by our
          Private Aviation Team. Empty Leg flights may change or become unavailable without notice.
          Final pricing and availability are confirmed at the time of booking. Source:{" "}
          {activeProvider.label}.
        </div>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-serif text-3xl">
            {results.length} opportunit{results.length === 1 ? "y" : "ies"}
          </h2>
          <Link
            to="/aircraft"
            className="text-xs uppercase tracking-[0.3em] text-primary hover:underline"
          >
            Browse Aircraft Catalogue →
          </Link>
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-10 text-center text-sm text-muted-foreground">
            No matches. Adjust filters or request a bespoke charter via the concierge.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {results.map((leg) => (
              <LegCard key={leg.id} leg={leg} onInquire={openInquiry} />
            ))}
          </div>
        )}
      </section>

      {/* Workflow */}
      <section className="mx-auto mt-24 max-w-6xl px-6">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-primary">
            The Worldway Workflow
          </div>
          <h3 className="mt-3 font-serif text-3xl">From request to wheels-up.</h3>
          <ol className="mt-6 grid gap-4 text-sm text-muted-foreground md:grid-cols-3 lg:grid-cols-6">
            {[
              "Request Booking",
              "Aviation Concierge",
              "Availability Verification",
              "Partner Confirmation",
              "Final Quote",
              "Secure Payment",
            ].map((step, i) => (
              <li key={step} className="rounded-lg border border-border/50 bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                  Step {i + 1}
                </div>
                <div className="mt-1 text-foreground">{step}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Featured aircraft strip */}
      <section className="mx-auto mt-24 max-w-7xl px-6 pb-24">
        <div className="mb-6 flex items-baseline justify-between">
          <h3 className="font-serif text-3xl">Featured aircraft</h3>
          <Link
            to="/aircraft"
            className="text-xs uppercase tracking-[0.3em] text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {featuredAircraft.map((a) => (
            <div
              key={a.slug}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-card/60"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={a.image}
                  alt={a.name}
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src !== AIRCRAFT_IMAGE_FALLBACK) img.src = AIRCRAFT_IMAGE_FALLBACK;
                  }}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                  {a.category}
                </div>
                <div className="mt-1 font-serif text-lg">{a.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {a.seats} seats · {a.rangeNm.toLocaleString()} nm · Mach{" "}
                  {(a.cruiseKt / 660).toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <EmptyLegInquiry
        leg={selected}
        open={dialogOpen}
        intent={intent}
        onOpenChange={setDialogOpen}
      />
    </PageShell>
  );
}

function LegCard({
  leg,
  onInquire,
}: {
  leg: EmptyLeg;
  onInquire: (l: EmptyLeg, i: Intent) => void;
}) {
  const ac = getAircraft(leg.aircraftSlug);
  const start = new Date(leg.departWindowStart);
  const end = new Date(leg.departWindowEnd);
  const dateLabel = start.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const windowLabel = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const disabled = leg.status === "Sold" || leg.status === "Expired";

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 transition-all hover:border-primary/40 hover:shadow-[0_20px_60px_-30px_theme(colors.amber.400/40%)]">
      <div className="relative aspect-[16/10] overflow-hidden">
        {ac ? (
          <img
            src={ac.image}
            alt={ac.name}
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src !== AIRCRAFT_IMAGE_FALLBACK) img.src = AIRCRAFT_IMAGE_FALLBACK;
            }}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-background/90 to-transparent p-3">
          <StatusPill status={leg.status} />
          <span className="rounded-full bg-primary/90 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-primary-foreground">
            Save up to {leg.savingsPct}%
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] text-primary">{ac?.category}</div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <div className="font-serif text-xl leading-tight">
            {leg.fromCity} <span className="text-muted-foreground">({leg.fromIata})</span>
            <span className="mx-2 text-primary">→</span>
            {leg.toCity} <span className="text-muted-foreground">({leg.toIata})</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {ac?.name} · {leg.seats} seats · {leg.durationHours.toFixed(1)}h est.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <InfoRow label="Date" value={dateLabel} />
          <InfoRow label="Window" value={windowLabel} />
          <InfoRow label="From (indicative)" value={`$${leg.indicativeFromUsd.toLocaleString()}`} />
          <InfoRow label="Region" value={leg.region} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onInquire(leg, "book")}
            className="flex-1 rounded-full bg-primary px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Request Booking
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onInquire(leg, "quote")}
            className="flex-1 rounded-full border border-primary/50 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
          >
            Request Quote
          </button>
          <button
            type="button"
            onClick={() => onInquire(leg, "callback")}
            className="w-full rounded-full border border-border px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-primary"
          >
            Concierge Callback
          </button>
          <button
            type="button"
            onClick={() => onInquire(leg, "callback")}
            className="flex-1 rounded-full border border-border px-4 py-2 text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-primary"
          >
            WhatsApp Concierge
          </button>
          <a
            href={`mailto:aviation@worldwaytravelsgroup.com?subject=${encodeURIComponent(`Empty leg enquiry ${leg.id}`)}&body=${encodeURIComponent(`Route: ${leg.fromCity} (${leg.fromIata}) → ${leg.toCity} (${leg.toIata})\nDate: ${dateLabel}\nAircraft: ${ac?.name}`)}`}
            className="flex-1 rounded-full border border-border px-4 py-2 text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-primary"
          >
            Email
          </a>
        </div>
      </div>
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: EmptyLegStatus }) {
  const tone: Record<EmptyLegStatus, string> = {
    Available: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    "On Request": "bg-amber-500/20 text-amber-300 border-amber-500/40",
    Sold: "bg-muted text-muted-foreground border-border",
    Expired: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] ${tone[status]}`}
    >
      {status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const fieldClass =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none";
