import { createFileRoute, Link } from "@tanstack/react-router";
import { CRYSTAL_DESTINATIONS } from "@/lib/crystal/content";
import { Crumbs, Section, breadcrumbSchema } from "@/components/crystal/crystal-ui";
import { mediaUrl } from "@/lib/media";

const URL = "https://worldwaytravelsgroup.com/crystal-cruises/destinations";
const TITLE = "Crystal Cruise Destinations — Regions & Ports | Worldway";
const DESCRIPTION =
  "Explore Worldway Luxury Cruises destinations: Mediterranean, Northern Europe, Alaska, Japan, the Caribbean, Antarctica and world cruise regions, with seasons and ports.";

export const Route = createFileRoute("/crystal-cruises/destinations/")({
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
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Home", url: "https://worldwaytravelsgroup.com/" },
            { name: "Worldway Luxury Cruises", url: "https://worldwaytravelsgroup.com/crystal-cruises" },
            { name: "Destinations", url: URL },
          ]),
        ),
      },
    ],
  }),
  component: DestinationsIndex,
});

function DestinationsIndex() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <Crumbs
          items={[{ label: "Worldway Luxury Cruises", to: "/crystal-cruises" }, { label: "Destinations" }]}
        />
      </div>
      <Section
        eyebrow="Destinations"
        title="Where Crystal sails"
        intro="Worldway-authored regional guidance: seasons, sea conditions, signature ports and how each region pairs with land arrangements."
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CRYSTAL_DESTINATIONS.map((d) => (
            <Link
              key={d.slug}
              to="/crystal-cruises/destinations/$slug"
              params={{ slug: d.slug }}
              className="group overflow-hidden rounded-xl border border-border/60"
            >
              <div className="h-40 overflow-hidden">
                <img
                  src={mediaUrl(d.hero)}
                  alt={`${d.name} cruise region`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="space-y-2 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {d.region}
                </p>
                <h2 className="font-serif text-xl">{d.name}</h2>
                <p className="line-clamp-3 text-sm text-muted-foreground">{d.overview}</p>
                <p className="text-xs text-muted-foreground">{d.bestTime}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
