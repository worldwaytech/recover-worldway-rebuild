import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getTourTaxonomy, getTourDealsList } from "@/lib/tours.functions";

export type TaxonomyEntry = { id: string; name: string; count: number | null; description?: string };
export type Taxonomy = {
  configured: boolean;
  countsReady: boolean;
  regions: TaxonomyEntry[];
  countries: TaxonomyEntry[];
  travelStyles: TaxonomyEntry[];
  interests: TaxonomyEntry[];
  serviceLevels: TaxonomyEntry[];
  physicalGrading: TaxonomyEntry[];
};
type Deal = {
  id: string;
  name: string;
  discountPercent: number | null;
  promotionCode: string;
  saleFinishDate: string | null;
  departureDate: string | null;
  tourId: string | null;
  tourName: string | null;
  image: string | null;
};

/** Loads the supplier taxonomy once and keeps polling until counts are ready. */
export function useTourTaxonomy() {
  const load = useServerFn(getTourTaxonomy);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (attempt: number) => {
      try {
        const res = (await load()) as Taxonomy;
        if (cancelled) return;
        setTaxonomy(res);
        if (!res.countsReady && res.configured && attempt < 12)
          timer = setTimeout(() => void tick(attempt + 1), 6000);
      } catch {
        /* taxonomy is progressive enhancement — ignore */
      }
    };
    void tick(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  return taxonomy;
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary"
      }`}
    >
      {label}
      {count ? <span className="ml-2 text-[10px] opacity-60">{count}</span> : null}
    </button>
  );
}

export function BrowseSection({
  eyebrow,
  title,
  intro,
  entries,
  active,
  onSelect,
  limit = 24,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  entries: TaxonomyEntry[];
  active: string;
  onSelect: (value: string) => void;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return null;
  const shown = expanded ? entries : entries.slice(0, limit);
  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.3em] text-primary">{eyebrow}</div>
        <h2 className="mt-2 font-serif text-2xl text-foreground">{title}</h2>
        {intro ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{intro}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {active ? <Chip label="All" active={false} onClick={() => onSelect("")} /> : null}
        {shown.map((e) => (
          <Chip
            key={e.id}
            label={e.name}
            count={e.count}
            active={active === e.name}
            onClick={() => onSelect(active === e.name ? "" : e.name)}
          />
        ))}
        {entries.length > limit ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full border border-primary/40 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-primary"
          >
            {expanded ? "Show fewer" : `All ${entries.length}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function DealsSection() {
  const load = useServerFn(getTourDealsList);
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = (await load({ data: { limit: 8 } })) as { deals?: Deal[] };
        if (!cancelled) setDeals(res.deals ?? []);
      } catch {
        /* deals are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!deals.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.3em] text-primary">Deals</div>
        <h2 className="mt-2 font-serif text-2xl text-foreground">Live promotions</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Current operator promotions, applied automatically at booking.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {deals.map((d) => (
          <Link
            key={d.id}
            to="/tours/journey/$id"
            params={{ id: d.tourId ?? "" }}
            className="group overflow-hidden rounded-2xl border border-border/60 bg-card/70 transition-colors hover:border-primary/50"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/30">
              {d.image ? (
                <img
                  src={d.image}
                  alt={d.tourName ?? d.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : null}
              {d.discountPercent ? (
                <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-primary-foreground">
                  {Math.round(d.discountPercent)}% off
                </span>
              ) : null}
            </div>
            <div className="space-y-2 p-5">
              <h3 className="font-serif text-base leading-snug text-foreground">
                {d.tourName ?? d.name}
              </h3>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {d.departureDate
                  ? `Departs ${new Date(d.departureDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                  : "Limited availability"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
