import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageShell, PageHero, SearchCard, Field } from "@/components/search-shell";
import { inputClass } from "@/components/search-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTtcCatalogueFacets, searchTtcTours } from "@/lib/ttc/ttc.functions";
import { TTC_SORT_OPTIONS, ttcTourPath } from "@/lib/ttc/config";
import type { TtcCatalogueResult, TtcFacets } from "@/lib/ttc/types";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/ttc/")({
  head: () => ({
    meta: [
      { title: "Guided Journeys | Worldway Travels Group" },
      {
        name: "description",
        content:
          "Browse Worldway guided journeys with full itineraries, inclusions and pricing.",
      },
      { property: "og:title", content: "Guided Journeys — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Worldway guided journeys in one place: day-by-day itineraries, inclusions, accommodation, transport and lead-in pricing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => {
    const [facets, first] = await Promise.all([
      getTtcCatalogueFacets(),
      searchTtcTours({ data: { page: 1, pageSize: 24, sort: "featured" } }),
    ]);
    return { facets, first };
  },
  component: TtcCataloguePage,
});

function money(amount: number | null, currency: string | null) {
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${Math.round(amount)}`.trim();
  }
}

function TtcCataloguePage() {
  const { facets, first } = Route.useLoaderData() as { facets: TtcFacets; first: TtcCatalogueResult };
  const search = useServerFn(searchTtcTours);

  const [result, setResult] = useState<TtcCatalogueResult>(first);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [style, setStyle] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [sort, setSort] = useState<string>("featured");

  const run = useCallback(
    async (page: number, overrides: { sort?: string; brands?: string[] } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const selectedBrands = overrides.brands ?? brands;
        const res = (await search({
          data: {
            page,
            pageSize: 24,
            sort: overrides.sort ?? sort,
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(selectedBrands.length ? { brands: selectedBrands } : {}),
            ...(country ? { country } : {}),
            ...(style ? { tourStyle: style } : {}),
            ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
            ...(minDays ? { minDays: Number(minDays) } : {}),
            ...(maxDays ? { maxDays: Number(maxDays) } : {}),
          },
        })) as TtcCatalogueResult;
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The guided journeys could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [search, q, brands, country, style, maxPrice, minDays, maxDays, sort],
  );

  const [pendingSort, setPendingSort] = useState<string | null>(null);
  const visibleBrands = facets.brands;
  useEffect(() => {
    if (pendingSort === null) return;
    void run(1, { sort: pendingSort });
    setPendingSort(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSort]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(1);
  }

  function toggleBrand(brand: string) {
    const next = brands.includes(brand) ? brands.filter((b) => b !== brand) : [...brands, brand];
    setBrands(next);
    void run(1, { brands: next });
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Worldway Guided Journeys"
        title="Guided journeys, curated by Worldway."
        subtitle="Classic, premium, luxury, value and youth guided journeys — full itineraries, inclusions, accommodation and lead-in pricing in one searchable collection."
        image="https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=2000&q=80"
      />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-wrap gap-2 px-6 pb-20 pt-4">
        {([] as typeof visibleBrands).map((brand) => (
          <Button
            key={brand.brand}
            type="button"
            variant="outline"
            onClick={() => toggleBrand(brand.brand)}
            className={`h-auto min-h-9 max-w-full whitespace-normal rounded-full px-5 py-2 text-center text-[0.7rem] uppercase tracking-[0.25em] transition-colors ${
              brands.includes(brand.brand)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-primary"
            }`}
          >
            {brand.label}
            <span className="ml-2 text-[0.6rem] opacity-70">{brand.count}</span>
          </Button>
        ))}
      </div>

      <SearchCard title="Search guided journeys">
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="md:col-span-2">
            <Field label="Journey or destination">
              <input
                className={inputClass}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Italy, Japan, Highlands…"
              />
            </Field>
          </div>
          <Field label="Country">
            <select className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {facets.countries.map((entry) => (
                <option key={entry.country} value={entry.country}>
                  {entry.country} ({entry.count})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Style">
            <select className={inputClass} value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="">Any style</option>
              {facets.tourStyles.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Min days">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={minDays}
              onChange={(e) => setMinDays(e.target.value)}
            />
          </Field>
          <Field label="Max days">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={maxDays}
              onChange={(e) => setMaxDays(e.target.value)}
            />
          </Field>
          <Field label="Max price">
            <input
              className={inputClass}
              type="number"
              min={0}
              step={100}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Any"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Sort by">
              <select
                className={inputClass}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPendingSort(e.target.value);
                }}
              >
                {TTC_SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex items-end md:col-span-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Searching…" : "Search journeys"}
            </Button>
          </div>
        </form>
      </SearchCard>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          {result.total.toLocaleString()} guided journeys
        </h2>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Page {result.page} of {result.pageCount}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((tour) => (
          <Link
            key={tour.id}
            to="/ttc/$brand/$slug"
            params={{ brand: String(tour.brand), slug: tour.slug }}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              {tour.heroImage ? (
                <img
                  src={mediaUrl(tour.heroImage)}
                  alt={`${tour.name} — Worldway guided journey`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : null}
              <Badge className="absolute left-3 top-3 bg-background/90 text-foreground">
                Worldway Guided Journey
              </Badge>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <h3 className="text-base font-semibold leading-snug">{tour.name}</h3>
              {tour.summary ? (
                <p className="line-clamp-2 text-sm text-muted-foreground">{tour.summary}</p>
              ) : null}
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {[
                  tour.durationDays ? `${tour.durationDays} days` : null,
                  tour.countries.slice(0, 3).join(" · ") || null,
                ]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
              <div className="mt-auto flex items-end justify-between pt-3">
                <span className="text-sm font-semibold">
                  {money(tour.priceFrom, tour.priceCurrency) ?? "Price on request"}
                </span>
                {tour.reviewRating ? (
                  <span className="text-xs text-muted-foreground">
                    {tour.reviewRating.toFixed(1)}★
                    {tour.reviewCount ? ` (${tour.reviewCount})` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {result.items.length === 0 && !loading ? (
        <p className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          No guided journeys match these filters yet.
        </p>
      ) : null}

      {result.pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            disabled={result.page <= 1 || loading}
            onClick={() => void run(result.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={result.page >= result.pageCount || loading}
            onClick={() => void run(result.page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
