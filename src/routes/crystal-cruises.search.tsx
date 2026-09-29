import { getCrystalVoyages } from "@/lib/crystal/crystal.functions";
import { hydrateLicensedVoyages } from "@/lib/crystal/inventory";
import { createFileRoute } from "@tanstack/react-router";
import { CruiseFinder, type FinderSearch } from "@/components/crystal/cruise-finder";

const URL = "https://worldwaytravelsgroup.com/crystal-cruises/search";
const TITLE = "Crystal Cruise Finder — Search Luxury Voyages | Worldway";
const DESCRIPTION =
  "Search Worldway Luxury Cruises voyages by destination, ship, departure month, voyage length, suite grade and cruise style, with natural-language search.";

export const Route = createFileRoute("/crystal-cruises/search")({
  validateSearch: (raw: Record<string, unknown>): FinderSearch => {
    const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    return {
      q: str(raw.q),
      destination: str(raw.destination),
      ship: str(raw.ship),
      month: str(raw.month),
      suite: str(raw.suite),
      style: str(raw.style),
      minNights: num(raw.minNights),
      maxNights: num(raw.maxNights),
      maxPrice: num(raw.maxPrice),
      sort: str(raw.sort),
    };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  loader: () => getCrystalVoyages({ data: {} }),
  component: SearchPage,
});

function SearchPage() {
  const feed = Route.useLoaderData();
  hydrateLicensedVoyages(feed.voyages);
  const search = Route.useSearch();
  return (
    <>
      <div className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <p className="text-[11px] uppercase tracking-[0.4em] text-primary">Worldway Luxury Cruises</p>
          <h1 className="mt-3 font-serif text-3xl md:text-4xl">Cruise finder</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Faceted and natural-language search across destination, ship, month, length, suite grade
            and cruise style.
          </p>
        </div>
      </div>
      <CruiseFinder search={search} />
    </>
  );
}
