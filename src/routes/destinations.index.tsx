import { createFileRoute, Link } from "@tanstack/react-router";
import { allRegions, countRegion } from "@/lib/destinations";
import { DemoNotice } from "@/components/partners/journey-ui";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/destinations/")({
  head: () => {
    const title = "Destinations — Worldway Travels Group";
    const description =
      "Explore the world by region, country and destination: luxury journeys, partner voyages and specialist advice for every corner of the map.";
    const url = "https://worldwaytravelsgroup.com/destinations";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: DestinationsIndex,
});

function DestinationsIndex() {
  const regions = allRegions();
  return (
    <div className="mx-auto max-w-7xl px-4 py-14">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        Where we travel
      </p>
      <h1 className="mt-2 font-serif text-4xl">Destinations</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Every Worldway destination is mapped to the partners, ships, lodges and guides we trust
        there. Choose a region to drill down through countries, states and individual destinations.
      </p>
      <DemoNotice className="mt-5 max-w-3xl" />

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {regions.map((r) => {
          const c = countRegion(r);
          return (
            <Link
              key={r.slug}
              to="/destinations/$region"
              params={{ region: r.slug }}
              className="group relative block overflow-hidden rounded-lg border border-border/60"
            >
              <img
                src={mediaUrl(r.heroImage)}
                alt={`${r.name} luxury travel`}
                loading="lazy"
                className="h-64 w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
              <div className="absolute bottom-0 p-5">
                <h2 className="font-serif text-2xl">{r.headline}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.countries} countries · {c.destinations} destinations · {c.journeys} journeys
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
