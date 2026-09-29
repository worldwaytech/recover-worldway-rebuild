import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero, PageShell } from "@/components/search-shell";

const VOYAGE_PRODUCTS = [
  {
    to: "/voyages/cruisea",
    label: "Cruisea",
    blurb: "Search every Cruisea company and ship, hold cabins and confirm instantly.",
  },
  { to: "/cruises", label: "Luxury Cruises", blurb: "Curated small-ship and premium sailings." },
  {
    to: "/expedition-cruises",
    label: "Expedition Cruises",
    blurb: "Polar, wildlife and remote-coast expeditions.",
  },
  { to: "/river-cruises", label: "River Cruises", blurb: "Europe, Nile and Mekong river journeys." },
  { to: "/world-cruises", label: "World Cruises", blurb: "Grand voyages and full world circuits." },
  { to: "/crystal-cruises", label: "Worldway Luxury Cruises", blurb: "Live luxury cruise inventory and suites." },
  { to: "/rail", label: "Luxury Rail", blurb: "Iconic rail journeys across continents." },
  { to: "/yachts", label: "Yacht Charters", blurb: "Private yacht and gulet charters." },
] as const;

export const Route = createFileRoute("/voyages/")({
  head: () => ({
    meta: [
      { title: "Voyages — Cruises, Rail & Yachts | Worldway Travels Group" },
      {
        name: "description",
        content:
          "Explore every Worldway voyage: Cruisea cruise search, luxury and expedition cruises, river and world cruises, Crystal, luxury rail and yacht charters.",
      },
      { property: "og:title", content: "Voyages — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Cruise, rail and yacht voyages with live availability and booking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoyagesIndexPage,
});

function VoyagesIndexPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Worldway · Voyages"
        title="Voyages by sea, river and rail."
        subtitle="Start with Cruisea for full cruise search, holds and confirmation."
        image="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80"
      />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {VOYAGE_PRODUCTS.map((product) => (
            <Link
              key={product.to}
              to={product.to}
              className="rounded-2xl border border-border/60 bg-card/60 p-6 transition hover:border-primary/60"
            >
              <h2 className="font-serif text-2xl text-foreground">{product.label}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{product.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
