import { createFileRoute, Link } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { getCollection } from "@/lib/collections";
import { crystalWorldCruisesByYear } from "@/lib/crystal/world-cruises";
import { mediaUrl } from "@/lib/media";

const KIND = "cruises-world" as const;

export const Route = createFileRoute("/world-cruises/")({
  loader: () => getCollection(KIND),
  head: () => {
    const meta = getCollection(KIND).meta;
    const url = "https://worldwaytravelsgroup.com/world-cruises";
    const description =
      "Crystal world cruises for 2027, 2028 and 2029 — full itineraries, ports and published fares, plus grand voyages from Silversea, Cunard and Regent.";
    return {
      meta: [
        { title: `${meta.title} — Worldway Travels Group` },
        { name: "description", content: description },
        { property: "og:title", content: `${meta.title} — Worldway Travels Group` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: Page,
});

function CrystalWorldCruises() {
  const voyages = crystalWorldCruisesByYear();
  if (voyages.length === 0) return null;
  return (
    <section className="border-b border-border/60 bg-muted/20">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.4em] text-primary">Worldway Luxury Cruises</p>
        <h2 className="mt-3 font-serif text-3xl">World cruises 2027, 2028 &amp; 2029</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Crystal&rsquo;s full world voyages, with the complete day-by-day itinerary, every port and
          Crystal&rsquo;s published suite fares. Held and confirmed personally by our cruise desk.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {voyages.map((v) => (
            <article
              key={v.code}
              className="overflow-hidden rounded-2xl border border-border/60 bg-background"
            >
              {v.media.hero ? (
                <img
                  src={mediaUrl(v.media.hero)}
                  alt={`${v.shipName} on Crystal's ${v.departureDate.slice(0, 4)} world cruise`}
                  loading="lazy"
                  className="h-44 w-full object-cover"
                />
              ) : null}
              <div className="p-6">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                  {v.shipName}
                </p>
                <h3 className="mt-2 font-serif text-xl">{v.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {v.nights} nights · {v.embarkPort} to {v.disembarkPort}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Departs {v.departureDate} · {v.itinerary.length} itinerary days
                  {v.countries.length ? ` · ${v.countries.length} countries` : ""}
                </p>
                {v.priceFrom ? (
                  <p className="mt-3 text-sm">
                    From{" "}
                    <span className="font-medium">
                      {v.currency} {v.priceFrom.toLocaleString()}
                    </span>{" "}
                    per guest
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to="/crystal-cruises/voyages/$code"
                    params={{ code: v.code }}
                    className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                  >
                    View itinerary
                  </Link>
                  <Link
                    to="/crystal-cruises/quote"
                    search={{ voyage: v.code }}
                    className="rounded-full border border-border px-5 py-2 text-sm"
                  >
                    Request fares
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Page() {
  return <CollectionLanding kind={KIND} featureSection={<CrystalWorldCruises />} />;
}
