import { createFileRoute } from "@tanstack/react-router";
import { PageHero, PageShell } from "@/components/search-shell";
import { CruiseaSearch } from "@/components/cruisea/cruisea-search";
import { getCruiseaFacetsFn, searchCruisea } from "@/lib/cruisea/cruisea.functions";
import type { CruiseaFacets, CruiseaSailingSummary } from "@/lib/cruisea/types";

export const Route = createFileRoute("/voyages/cruisea/")({
  loader: async () => {
    const [facets, initial] = await Promise.all([
      getCruiseaFacetsFn(),
      searchCruisea({ data: { page: 1, sort: "departure" } }),
    ]);
    return {
      facets: facets as CruiseaFacets,
      initial: initial as {
        results: CruiseaSailingSummary[];
        total: number;
        page: number;
        pageCount: number;
      },
    };
  },
  head: () => ({
    meta: [
      { title: "Cruisea Voyages — Cruise Search & Booking | Worldway" },
      {
        name: "description",
        content:
          "Search Cruisea ocean, river, luxury and expedition voyages by company, ship, region, departure date and cabin grade, then hold and confirm your cabin.",
      },
      { property: "og:title", content: "Cruisea Voyages — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Cruise company and ship search, live cabin availability, holds, booking and confirmation — native to Worldway.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-serif text-3xl">Cruisea is temporarily unavailable</h1>
        <p className="mt-3 text-muted-foreground">
          Please refresh in a moment — our cruise desk is standing by if you need help.
        </p>
      </div>
    </PageShell>
  ),
  notFoundComponent: () => (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-serif text-3xl">Voyage not found</h1>
      </div>
    </PageShell>
  ),
  component: CruiseaIndexPage,
});

function CruiseaIndexPage() {
  const { facets, initial } = Route.useLoaderData();
  return (
    <PageShell>
      <PageHero
        eyebrow="Voyages · Cruisea"
        title="Cruisea: every ship, every sailing, one search."
        subtitle="Ocean, river, luxury and expedition voyages with live cabin availability, holds and instant confirmation."
        image="https://images.unsplash.com/photo-1548574505-5e239809ee19?auto=format&fit=crop&w=2000&q=80"
      />
      <CruiseaSearch facets={facets} initial={initial} />
    </PageShell>
  );
}
