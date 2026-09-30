import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { getTourExplore, getTourFacets, searchTourMarketplace } from "@/lib/travelshop/tours.functions";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/marketplace/")({
  head: () => ({
    meta: [
      { title: "Tours Marketplace — Worldway Travels" },
      { name: "description", content: "Browse thousands of tours, day trips and multi-day journeys worldwide with live availability and pricing." },
      { property: "og:title", content: "Tours Marketplace — Worldway Travels" },
      { property: "og:description", content: "Live tours and experiences with real-time availability and pricing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplacePage,
});

type Filters = {
  query?: string; region?: string; city?: string; country?: string; destination?: string; category?: string; activity?: string; language?: string;
  duration?: "day" | "2-4" | "5-8" | "9+"; minPrice?: number; maxPrice?: number; minRating?: number;
  sort?: "popular" | "price-asc" | "price-desc" | "rating" | "duration"; page?: number;
};

const sel = "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

function MarketplacePage() {
  const [f, setF] = useState<Filters>({ page: 1 });
  const [text, setText] = useState("");
  const set = (p: Partial<Filters>) => setF((o) => ({ ...o, ...p, page: p.page ?? 1 }));
  const facets = useQuery({ queryKey: ["tour-facets"], queryFn: () => getTourFacets(), staleTime: 3600_000 });
  const { data, isLoading } = useQuery({
    queryKey: ["tour-market", f],
    queryFn: () => searchTourMarketplace({ data: f }),
    placeholderData: keepPreviousData,
  });
  const ex = useQuery({ queryKey: ["tour-explore"], queryFn: () => getTourExplore(), staleTime: 3600_000 });
  const region = ex.data?.hierarchy.find((r) => r.region === f.region);
  const countryNode = (region?.countries ?? ex.data?.hierarchy.flatMap((r) => r.countries))?.find((c) => c.country === f.country);
  const filtered = Boolean(f.query || f.region || f.country || f.city || f.destination || f.category || f.activity);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const fc = facets.data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-foreground">Tours Marketplace</h1>
      <p className="mt-2 text-muted-foreground">Live availability and pricing on tours, day trips and journeys worldwide.</p>

      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); set({ query: text.trim() || undefined }); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search tours, cities or countries" maxLength={120}
          className="w-full rounded-md border border-border bg-background px-4 py-2 text-foreground" />
        <button type="submit" className="rounded-md bg-primary px-5 py-2 text-primary-foreground">Search</button>
      </form>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5">
        <select aria-label="Region" className={sel} value={f.region ?? ""} onChange={(e) => set({ region: e.target.value || undefined, country: undefined, city: undefined })}>
          <option value="">All regions</option>
          {ex.data?.hierarchy.map((r) => <option key={r.region} value={r.region}>{r.region} ({r.count})</option>)}
        </select>
        <select aria-label="Country" className={sel} value={f.country ?? ""} onChange={(e) => set({ country: e.target.value || undefined, city: undefined })}>
          <option value="">All countries</option>
          {(region ? region.countries.map((c) => ({ value: c.country, count: c.count })) : fc?.countries ?? []).map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
        </select>
        <select aria-label="City" className={sel} value={f.city ?? ""} disabled={!countryNode} onChange={(e) => set({ city: e.target.value || undefined })}>
          <option value="">{countryNode ? "All cities" : "Pick a country"}</option>
          {countryNode?.cities.map((c) => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}
        </select>
        <select aria-label="Destination" className={sel} value={f.destination ?? ""} onChange={(e) => set({ destination: e.target.value || undefined })}>
          <option value="">All destinations</option>
          {fc?.destinations.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
        </select>
        <select aria-label="Category" className={sel} value={f.category ?? ""} onChange={(e) => set({ category: e.target.value || undefined })}>
          <option value="">All categories</option>
          {fc?.categories.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.count})</option>)}
        </select>
        <select aria-label="Activity" className={sel} value={f.activity ?? ""} onChange={(e) => set({ activity: e.target.value || undefined })}>
          <option value="">All activities</option>
          {fc?.activities.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
        </select>
        <select aria-label="Duration" className={sel} value={f.duration ?? ""} onChange={(e) => set({ duration: (e.target.value || undefined) as Filters["duration"] })}>
          <option value="">Any duration</option><option value="day">1 day</option><option value="2-4">2–4 days</option><option value="5-8">5–8 days</option><option value="9+">9+ days</option>
        </select>
        <select aria-label="Rating" className={sel} value={f.minRating ?? ""} onChange={(e) => set({ minRating: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any rating</option><option value="4.5">4.5+</option><option value="4">4.0+</option><option value="3.5">3.5+</option>
        </select>
        <select aria-label="Language" className={sel} value={f.language ?? ""} onChange={(e) => set({ language: e.target.value || undefined })}>
          <option value="">Any language</option>
          {fc?.languages.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
        </select>
        <select aria-label="Sort" className={sel} value={f.sort ?? "popular"} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}>
          <option value="popular">Most popular</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="rating">Top rated</option><option value="duration">Shortest first</option>
        </select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <input aria-label="Minimum price" type="number" min={0} placeholder="Min price" className={`${sel} w-28`} onChange={(e) => set({ minPrice: e.target.value ? Number(e.target.value) : undefined })} />
        <input aria-label="Maximum price" type="number" min={0} placeholder="Max price" className={`${sel} w-28`} onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })} />
        {data && <span className="text-muted-foreground">{data.total.toLocaleString()} tours</span>}
      </div>

      {!filtered && ex.data && (
        <div className="mt-10 space-y-10">
          <Row title="Featured tours" items={ex.data.featured} />
          <Row title="Best-selling tours" items={ex.data.bestSelling} />
          <section>
            <h2 className="text-xl font-semibold text-foreground">Trending destinations</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {ex.data.trending.map((t) => <button key={t.value} onClick={() => set({ destination: t.value })} className="rounded-full border border-border px-3 py-1 text-sm text-foreground hover:bg-muted">{t.value} · {t.count} tours</button>)}
            </div>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Things to do</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {fc?.activities.slice(0, 24).map((a) => <button key={a.value} onClick={() => set({ activity: a.value })} className="rounded-full bg-muted px-3 py-1 text-sm text-foreground hover:bg-accent">{a.value} ({a.count})</button>)}
            </div>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Categories</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {fc?.categories.map((c) => <button key={c.value} onClick={() => set({ category: c.value })} className="rounded-full border border-border px-3 py-1 text-sm text-foreground hover:bg-muted">{c.label} ({c.count})</button>)}
            </div>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Travel guides by country</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              {ex.data.hierarchy.map((r) => (
                <div key={r.region}>
                  <p className="text-sm font-medium text-foreground">{r.region}</p>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {r.countries.slice(0, 8).map((c) => <li key={c.country}><Link to="/marketplace/guide/$country" params={{ country: c.country }} className="text-muted-foreground hover:text-foreground">{c.country} ({c.count})</Link></li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
          <h2 className="text-xl font-semibold text-foreground">All tours</h2>
        </div>
      )}

      {isLoading && <p className="mt-10 text-muted-foreground">Loading tours…</p>}
      {data?.error && <p className="mt-10 text-muted-foreground">The catalogue is temporarily unavailable. Please try again.</p>}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((p) => (
          <TourCard key={p.slug} p={p} />
        ))}
      </div>
      {data && data.items.length === 0 && !isLoading && !data.error && <p className="mt-10 text-muted-foreground">No tours matched your filters.</p>}
      {data && pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          <button className={sel} disabled={(f.page ?? 1) <= 1} onClick={() => set({ page: (f.page ?? 1) - 1 })}>Previous</button>
          <span className="text-muted-foreground">Page {f.page ?? 1} of {pages}</span>
          <button className={sel} disabled={(f.page ?? 1) >= pages} onClick={() => set({ page: (f.page ?? 1) + 1 })}>Next</button>
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">"From" prices come from our last catalogue refresh. Live price and availability are checked when you choose a date.</p>
    </main>
  );
}

type Card = Awaited<ReturnType<typeof searchTourMarketplace>>["items"][number];

function TourCard({ p }: { p: Card }) {
  return (
          <Link to="/marketplace/$id" params={{ id: p.slug }} className="overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-lg">
            {p.cover_image ? <img src={mediaUrl(p.cover_image)} alt={p.name} className="h-44 w-full object-cover" loading="lazy" /> : <div className="h-44 w-full bg-muted" />}
            <div className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{p.category_name}</p>
              <h3 className="mt-1 line-clamp-2 font-medium text-foreground">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {[p.destinations?.[0], p.country].filter(Boolean).join(", ")}
                {p.duration_days ? ` · ${p.duration_days} day${p.duration_days > 1 ? "s" : ""}` : ""}
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                {p.price_from !== null ? <span className="font-semibold text-foreground">From {p.currency} {Number(p.price_from).toFixed(0)}</span> : <span className="text-muted-foreground">Price on request</span>}
                {p.rating ? <span className="text-muted-foreground">★ {Number(p.rating).toFixed(1)} ({p.review_count})</span> : null}
              </div>
            </div>
          </Link>
  );
}

function Row({ title, items }: { title: string; items: Card[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{items.map((p) => <TourCard key={p.slug} p={p} />)}</div>
    </section>
  );
}
