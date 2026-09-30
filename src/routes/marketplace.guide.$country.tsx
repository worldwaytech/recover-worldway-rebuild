import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCountryGuide } from "@/lib/travelshop/tours.functions";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/marketplace/guide/$country")({
  head: ({ params }) => {
    const c = params.country;
    return {
      meta: [
        { title: `${c} travel guide: tours & things to do — Worldway` },
        { name: "description", content: `Cities, activities, tour types and top-rated tours in ${c}, with live availability and pricing.` },
        { property: "og:title", content: `${c} travel guide — Worldway Tours` },
        { property: "og:description", content: `Things to do and top tours in ${c}.` },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: GuidePage,
});

function Chips({ title, items }: { title: string; items: Array<{ value: string; count: number }> }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((i) => <span key={i.value} className="rounded-full bg-muted px-3 py-1 text-sm text-foreground">{i.value} · {i.count}</span>)}
      </div>
    </section>
  );
}

function GuidePage() {
  const { country } = Route.useParams();
  const { data: g, isLoading, error } = useQuery({ queryKey: ["tour-guide", country], queryFn: () => getCountryGuide({ data: { country } }), staleTime: 3600_000 });
  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Loading guide…</main>;
  if (error) return <main className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">This guide is temporarily unavailable.</main>;
  if (!g) return <main className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">We don't have tours in {country} right now. <Link to="/marketplace" className="underline">Browse all tours</Link></main>;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/marketplace" className="text-sm text-muted-foreground hover:text-foreground">← Tours Marketplace</Link>
      <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">{g.region}</p>
      <h1 className="text-3xl font-semibold text-foreground">{g.country} travel guide</h1>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Tours" value={g.tourCount.toLocaleString()} />
        <Stat label="Day trips / multi-day" value={`${g.dayTrips} / ${g.multiDay}`} />
        <Stat label="Traveller rating" value={g.avgRating ? `★ ${g.avgRating} (${g.reviews.toLocaleString()} reviews)` : "No reviews yet"} />
        <Stat label="Tours from" value={g.priceFrom !== null ? `${g.currency} ${g.priceFrom.toFixed(0)}` : "Price on request"} />
      </div>
      <Chips title="Where to go" items={g.cities} />
      <Chips title="Things to do" items={g.activities} />
      <Chips title="Tour types" items={g.categories} />
      <Chips title="Guided in" items={g.languages} />
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Most-booked tours in {g.country}</h2>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {g.topTours.map((p) => (
            <Link key={p.slug} to="/marketplace/$id" params={{ id: p.slug }} className="overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-lg">
              {p.cover_image ? <img src={mediaUrl(p.cover_image)} alt={p.name} className="h-40 w-full object-cover" loading="lazy" /> : <div className="h-40 w-full bg-muted" />}
              <div className="p-4">
                <h3 className="line-clamp-2 font-medium text-foreground">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.price_from !== null ? `From ${p.currency} ${Number(p.price_from).toFixed(0)}` : "Price on request"}{p.rating ? ` · ★ ${Number(p.rating).toFixed(1)}` : ""}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <p className="mt-8 text-xs text-muted-foreground">Figures come from our current tour catalogue. Live prices and dates are checked when you pick a date.</p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium text-foreground">{value}</p></div>;
}
