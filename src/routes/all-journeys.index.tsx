import { useMemo, useState, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { journeys as staticJourneys } from "@/lib/all-journeys-content";
import { getSyncedJourneyCards } from "@/lib/catalogue-sync/sync.functions";
import { mergeCatalogue } from "@/lib/catalogue-sync/merge";
import {
  categories,
  regions,
  styleOptions,
  formatPrice,
  type Journey,
  formatJourneyTitle,
} from "@/lib/data";
import { JourneyCard, Breadcrumbs } from "@/components/site";
import { AvailabilityBadge } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Check, MapPin, Calendar, Clock, X } from "lucide-react";

type Search = { category?: string; region?: string; style?: string; duration?: string; q?: string };

export const Route = createFileRoute("/all-journeys/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    category: (s.category as string) || "all-journeys",
    region: (s.region as string) || undefined,
    style: (s.style as string) || undefined,
    duration: (s.duration as string) || undefined,
    q: (s.q as string) || undefined,
  }),
  loader: async () => {
    try {
      return await getSyncedJourneyCards();
    } catch {
      return { cards: [], inactive: [] };
    }
  },
  head: () => ({
    meta: [
      { title: "Luxury Journeys & Tours | Worldway Travels Group" },
      {
        name: "description",
        content:
          "Browse all luxury journeys — small group, private ready-to-book, expedition cruises, private jet journeys and charters. Filter by destination, style and more.",
      },
      { property: "og:title", content: "Luxury Journeys | Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Browse all luxury journeys — small group, private ready-to-book, expedition cruises and private jet charters. Filter by destination, style and duration.",
      },
      { property: "og:url", content: "https://worldwaytravelsgroup.com/journeys" },
    ],
    links: [{ rel: "canonical", href: "https://worldwaytravelsgroup.com/journeys" }],
  }),
  component: Journeys,
});

function Journeys() {
  const search = Route.useSearch();
  const synced = Route.useLoaderData();
  const journeys = useMemo(() => mergeCatalogue(staticJourneys, synced), [synced]);
  const navigate = useNavigate();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expandedSlug && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [expandedSlug]);
  const cat = categories.find((c) => c.slug === search.category) ?? categories[0];

  function update(patch: Partial<Search>) {
    navigate({ to: "/all-journeys", search: { ...search, ...patch } });
  }

  const filtered = useMemo(
    () =>
      journeys.filter((j) => {
        if (search.category && search.category !== "all-journeys") {
          const matchCat = j.category === search.category;
          const matchStyle = j.style.some((s) =>
            s
              .toLowerCase()
              .includes(search.category!.replace(/-/g, " ").replace("journeys", "").trim()),
          );
          if (!matchCat && !matchStyle) return false;
        }
        if (search.region && j.region !== search.region) return false;
        if (search.style && !j.style.includes(search.style)) return false;
        if (search.duration === "short" && j.duration > 8) return false;
        if (search.duration === "medium" && (j.duration < 9 || j.duration > 14)) return false;
        if (search.duration === "long" && j.duration < 15) return false;
        if (
          search.q &&
          !`${j.title} ${j.destination} ${j.overview}`
            .toLowerCase()
            .includes(search.q.toLowerCase())
        )
          return false;
        return true;
      }),
    [search, journeys],
  );

  const expandedJourney = filtered.find((j) => j.slug === expandedSlug) ?? null;

  function handleViewJourney(journey: Journey) {
    setExpandedSlug((current) => (current === journey.slug ? null : journey.slug));
  }

  return (
    <main className="pt-20">
      <section className="relative flex h-[45vh] items-center overflow-hidden">
        <img
          src={cat.image}
          alt={cat.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-ink/55" />
        <div className="container-lux relative z-10 text-primary-foreground">
          <p className="eyebrow mb-3">Worldway Travels Group</p>
          <h1 className="font-serif text-5xl md:text-6xl">{cat.name}</h1>
          <p className="mt-3 max-w-xl text-primary-foreground/85">{cat.blurb}</p>
        </div>
      </section>

      <section className="container-lux py-8">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Journeys", to: "/all-journeys" },
            { label: cat.name },
          ]}
        />
      </section>

      {/* Category pills */}
      <section className="container-lux flex flex-wrap gap-2 pb-8">
        {categories.map((c) => (
          <button
            key={c.slug}
            onClick={() => update({ category: c.slug })}
            className={`rounded-sm border px-4 py-2 text-xs uppercase tracking-wider transition-colors ${search.category === c.slug ? "border-gold bg-gold text-gold-foreground" : "border-border hover:border-gold"}`}
          >
            {c.name}
          </button>
        ))}
      </section>

      <section className="container-lux grid gap-10 pb-24 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className="h-fit space-y-6 rounded-sm border border-border bg-card p-6">
          <div>
            <label htmlFor="journey-search" className="eyebrow mb-2 block">
              Search
            </label>
            <input
              id="journey-search"
              value={search.q ?? ""}
              onChange={(e) => update({ q: e.target.value || undefined })}
              placeholder="Search journeys"
              className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="journey-region" className="eyebrow mb-2 block">
              Region
            </label>
            <select
              id="journey-region"
              value={search.region ?? ""}
              onChange={(e) => update({ region: e.target.value || undefined })}
              className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="journey-style" className="eyebrow mb-2 block">
              Travel style
            </label>
            <select
              id="journey-style"
              value={search.style ?? ""}
              onChange={(e) => update({ style: e.target.value || undefined })}
              className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="">All styles</option>
              {styleOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="journey-duration" className="eyebrow mb-2 block">
              Duration
            </label>
            <select
              id="journey-duration"
              value={search.duration ?? ""}
              onChange={(e) => update({ duration: e.target.value || undefined })}
              className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="">Any length</option>
              <option value="short">Up to 8 days</option>
              <option value="medium">9–14 days</option>
              <option value="long">15+ days</option>
            </select>
          </div>
          <button
            onClick={() => navigate({ to: "/all-journeys", search: { category: "all-journeys" } })}
            className="text-xs uppercase tracking-widest text-gold"
          >
            Reset filters
          </button>
        </aside>

        <div>
          <p className="mb-6 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "journey" : "journeys"} found
          </p>
          {filtered.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border py-20 text-center">
              <p className="font-serif text-2xl">No journeys match your filters</p>
              <Link
                to="/contact"
                className="mt-3 inline-block text-sm uppercase tracking-widest text-gold"
              >
                Request a tailor-made journey →
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((j) => (
                  <JourneyCard
                    key={j.slug}
                    journey={{ ...j, title: formatJourneyTitle(j.slug, j.title) }}
                    onViewJourney={handleViewJourney}
                    expanded={expandedSlug === j.slug}
                  />
                ))}
              </div>

              {expandedJourney && (
                <div ref={detailRef} className="scroll-mt-24">
                  <JourneyDetailPanel
                    journey={{
                      ...expandedJourney,
                      title: formatJourneyTitle(expandedJourney.slug, expandedJourney.title),
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function JourneyDetailPanel({ journey }: { journey: Journey }) {
  return (
    <section
      id={`journey-details-${journey.slug}`}
      className="rounded-sm border border-border bg-card p-6 shadow-elegant md:p-8"
    >
      <div className="grid gap-8 lg:grid-cols-[1.4fr_360px]">
        <div className="space-y-8">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <AvailabilityBadge status={journey.availability} />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {journey.category.replace(/-/g, " ")}
              </span>
            </div>
            <h2 className="font-serif text-3xl md:text-4xl">{journey.title}</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">{journey.overview}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-sm border border-border p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <MapPin className="h-4 w-4" /> Destination
              </p>
              <p className="mt-2 font-medium">{journey.destination}</p>
            </div>
            <div className="rounded-sm border border-border p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Clock className="h-4 w-4" /> Duration
              </p>
              <p className="mt-2 font-medium">{journey.duration} days</p>
            </div>
            <div className="rounded-sm border border-border p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Calendar className="h-4 w-4" /> Departures
              </p>
              <p className="mt-2 font-medium">{journey.departures.join(" · ")}</p>
            </div>
          </div>

          <div>
            <h3 className="font-serif text-2xl">Highlights</h3>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {journey.highlights.map((highlight) => (
                <li key={highlight} className="flex gap-2 text-sm">
                  <span className="text-gold">◆</span>
                  {highlight}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-serif text-2xl">Full itinerary</h3>
            <div className="mt-5 space-y-5 border-l border-border pl-6">
              {journey.itinerary.map((item, index) => (
                <div
                  key={`${journey.slug}-${item.day}-${item.title}-${index}`}
                  className="relative"
                >
                  <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
                  <p className="text-xs uppercase tracking-widest text-gold">{item.day}</p>
                  <p className="mt-1 font-serif text-xl">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="font-serif text-2xl">What's included</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {journey.inclusions.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="h-4 w-4 shrink-0 text-forest" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-serif text-2xl">Not included</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {journey.exclusions.map((item) => (
                  <li key={item} className="flex gap-2 text-muted-foreground">
                    <X className="h-4 w-4 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h3 className="font-serif text-2xl">Accommodations</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {journey.accommodations.map((accommodation) => (
                <li key={accommodation} className="flex gap-2">
                  <span className="text-gold">◆</span>
                  {accommodation}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="h-fit rounded-sm border border-border bg-background p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">From</p>
          <p className="mt-2 font-serif text-3xl">{formatPrice(journey.priceFrom)}</p>
          <div className="mt-4">
            <AvailabilityBadge status={journey.availability} />
          </div>
          <dl className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Region</dt>
              <dd className="text-right">
                {regions.find((region) => region.slug === journey.region)?.name ?? journey.region}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Country</dt>
              <dd className="text-right">{journey.country}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Style</dt>
              <dd className="text-right">{journey.style.join(", ")}</dd>
            </div>
          </dl>
          <div className="mt-6 space-y-3">
            <Link to="/book/$kind/$slug" params={{ kind: "journey", slug: journey.slug }} className="block">
              <Button variant="gold" className="w-full">
                Request Availability
              </Button>
            </Link>
            <Link to="/all-journeys/$slug" params={{ slug: journey.slug }} className="block">
              <Button variant="outline-ink" className="w-full">
                Open Full Page
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
