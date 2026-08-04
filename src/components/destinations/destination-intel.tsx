import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getCountryIntel } from "@/lib/destination-intel.functions";

type Bucket = { label: string; count: number };
type Tour = {
  id: string;
  name: string;
  image: string | null;
  region: string | null;
  countries: string[];
  fromPrice: number | null;
  currency: string;
  durationDays?: number | null;
};
export type Intel = {
  country: string;
  ok: boolean;
  configured: boolean;
  error?: string;
  currency: string;
  totalCount: number;
  sampleSize: number;
  featured: Tour[];
  styles: Bucket[];
  durations: Bucket[];
  serviceLevels: Bucket[];
  grades: Bucket[];
  regions: string[];
  priceFrom: number | null;
  priceTo: number | null;
  collections: { slug: string; title: string; eyebrow: string; count: number }[];
  relatedCountries: Bucket[];
};

const money = (v: number | null, ccy: string) =>
  v == null
    ? null
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: ccy,
        maximumFractionDigits: 0,
      }).format(v);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-5">
      <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-serif text-2xl text-foreground">{value}</div>
    </div>
  );
}

function Distribution({ title, buckets }: { title: string; buckets: Bucket[] }) {
  if (!buckets.length) return null;
  const max = Math.max(...buckets.map((b) => b.count));
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-[0.24em] text-primary">{title}</h3>
      <ul className="mt-3 space-y-2">
        {buckets.map((b) => (
          <li key={b.label} className="text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground">{b.label}</span>
              <span>{b.count}</span>
            </div>
            <div className="mt-1 h-1 w-full rounded-full bg-muted/40">
              <div
                className="h-1 rounded-full bg-primary/70"
                style={{ width: `${Math.round((b.count / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DestinationIntelPanel({ country }: { country: string }) {
  const run = useServerFn(getCountryIntel);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["country-intel", country],
    queryFn: () => run({ data: { country } }) as Promise<Intel>,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section className="mt-14" aria-busy="true">
        <h2 className="font-serif text-2xl">Licensed inventory in {country}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Reading live operator availability…</p>
      </section>
    );
  }

  if (isError || !data || !data.ok || data.totalCount === 0) {
    return (
      <section className="mt-14">
        <h2 className="font-serif text-2xl">Licensed inventory in {country}</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          No live guided departures are published for {country} by our licensed operators right now.
          Our desk quotes this destination privately.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/contact"
            className="rounded-full border border-primary/50 bg-primary/10 px-6 py-3 text-[10px] uppercase tracking-[0.24em] text-primary"
          >
            Request a proposal
          </Link>
          <Link
            to="/concierge"
            className="rounded-full border border-border/60 px-6 py-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground"
          >
            Ask the AI concierge
          </Link>
        </div>
      </section>
    );
  }

  const price = money(data.priceFrom, data.currency);

  return (
    <section className="mt-14">
      <h2 className="font-serif text-2xl">Licensed inventory in {country}</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Generated live from our licensed operator catalogue — every figure below reflects journeys
        with confirmed future departures.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live journeys" value={String(data.totalCount)} />
        <Stat label="From" value={price ?? "On request"} />
        <Stat
          label="Travel styles"
          value={String(data.styles.length + data.serviceLevels.length)}
        />
        <Stat label="Operator regions" value={data.regions.join(", ") || "—"} />
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        <Distribution title="Travel styles" buckets={data.styles} />
        <Distribution title="Service levels" buckets={data.serviceLevels} />
        <Distribution title="Physical grading" buckets={data.grades} />
        <Distribution title="Trip length" buckets={data.durations} />
      </div>

      {data.featured.length > 0 && (
        <>
          <h3 className="mt-12 font-serif text-xl">Featured journeys</h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.featured.map((t) => (
              <Link
                key={t.id}
                to="/tours/journey/$id"
                params={{ id: t.id }}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-card/60 transition-colors hover:border-primary/50"
              >
                {t.image ? (
                  <div className="aspect-[16/10] overflow-hidden bg-muted/30">
                    <img
                      src={t.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                ) : null}
                <div className="space-y-2 p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-primary">
                    {t.region ?? "Journey"}
                  </div>
                  <h4 className="font-serif text-lg text-foreground">{t.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {t.durationDays ? `${t.durationDays} days` : "Flexible"} ·{" "}
                    {money(t.fromPrice, t.currency) ?? "Price on request"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <Link
            to="/tours"
            search={{ country } as never}
            className="mt-6 inline-block rounded-full border border-primary/50 px-6 py-3 text-[10px] uppercase tracking-[0.24em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            See all {data.totalCount} journeys in {country}
          </Link>
        </>
      )}

      {data.collections.length > 0 && (
        <>
          <h3 className="mt-12 font-serif text-xl">Collections available here</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {data.collections.map((c) => (
              <Link
                key={c.slug}
                to="/tours/browse/$hub"
                params={{ hub: c.slug }}
                className="rounded-full border border-border/60 px-5 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {c.title} · {c.count}
              </Link>
            ))}
          </div>
        </>
      )}

      {data.relatedCountries.length > 0 && (
        <>
          <h3 className="mt-12 font-serif text-xl">Frequently combined with</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {data.relatedCountries.map((c) => (
              <Link
                key={c.label}
                to="/tours"
                search={{ country: c.label } as never}
                className="rounded-full border border-border/60 px-5 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {c.label} · {c.count}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <div className="text-[10px] uppercase tracking-[0.28em] text-primary">AI concierge</div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Ask for a shortlist by budget, month and pace — the concierge answers only from this
          licensed, bookable inventory.
        </p>
        <Link
          to="/concierge"
          search={{ prompt: `Plan a trip to ${country} using our licensed bookable journeys` } as never}
          className="mt-4 inline-block rounded-full border border-primary/50 bg-primary/10 px-6 py-3 text-[10px] uppercase tracking-[0.24em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Plan {country} with the concierge
        </Link>
      </div>
    </section>
  );
}
