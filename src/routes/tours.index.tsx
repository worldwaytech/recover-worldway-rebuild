import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { ToursCatalogue, type ToursSearchState } from "@/components/tours-catalogue";
import { HubGrid } from "@/components/tours/browse-hub";
import { HUB_GROUPS } from "@/lib/browse-hubs";

const url = "https://worldwaytravelsgroup.com/tours";
const description =
  "Browse 900+ multi-day guided tours worldwide with full day-by-day itineraries, live pricing, live availability and instant booking.";

export const Route = createFileRoute("/tours/")({
  validateSearch: (search: Record<string, unknown>): ToursSearchState => {
    const str = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
    const sort = str("sort");
    return {
      q: str("q"),
      country: str("country"),
      region: str("region"),
      category: str("category"),
      duration: str("duration"),
      budget: str("budget"),
      month: str("month"),
      sort:
        sort === "NAME" || sort === "PRICE" || sort === "DEPARTURE"
          ? (sort as ToursSearchState["sort"])
          : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Tours — Guided Journeys Worldwide | Worldway Travels Group" },
      { name: "description", content: description },
      { property: "og:title", content: "Tours — Guided Journeys Worldwide" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: url }],
  }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  return (
    <PageShell>
      <PageHero
        eyebrow="Tours"
        title="Multi-day journeys, expertly led."
        subtitle="Small-group and independent tours with day-by-day itineraries, live departures and live pricing."
        image="https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=2000&q=80"
      />
      <ToursCatalogue initial={search} />
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="text-[11px] uppercase tracking-[0.3em] text-primary">Collections</div>
        <h2 className="mt-3 font-serif text-2xl text-foreground md:text-3xl">
          Browse by the way you travel
        </h2>
        <div className="mt-8 space-y-10">
          {HUB_GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-4 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {g.title}
              </h3>
              <HubGrid slugs={g.slugs} />
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
