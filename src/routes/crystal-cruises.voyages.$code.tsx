import { getCrystalVoyages } from "@/lib/crystal/crystal.functions";
import { hydrateLicensedVoyages } from "@/lib/crystal/inventory";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Crumbs,
  AwaitingInventory,
  Section,
  VoyageGrid,
  breadcrumbSchema,
} from "@/components/crystal/crystal-ui";
import { formatFare, relatedVoyages, voyageByCode } from "@/lib/crystal/inventory";
import { crystalPrefs } from "@/lib/crystal/personalisation";
import { SUITE_CATEGORIES } from "@/lib/crystal/inventory";

const NO_CODES: string[] = [];

export const Route = createFileRoute("/crystal-cruises/voyages/$code")({
  head: ({ params }) => {
    const url = `https://worldwaytravelsgroup.com/crystal-cruises/voyages/${params.code}`;
    const title = `Crystal voyage ${params.code} — Itinerary & Fares | Worldway`;
    const description =
      "Voyage itinerary, suite fares, inclusions and booking options, published from licensed Crystal Cruises inventory.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Home", url: "https://worldwaytravelsgroup.com/" },
              { name: "Crystal Cruises", url: "https://worldwaytravelsgroup.com/crystal-cruises" },
              { name: params.code, url },
            ]),
          ),
        },
      ],
    };
  },
  loader: () => getCrystalVoyages({ data: {} }),
  component: VoyagePage,
});

function VoyagePage() {
  const feed = Route.useLoaderData();
  hydrateLicensedVoyages(feed.voyages);
  const { code } = Route.useParams();
  const voyage = voyageByCode(code);
  const wishlist = useSyncExternalStore(
    (cb) => crystalPrefs.subscribe(cb),
    () => crystalPrefs.wishlist(),
    () => NO_CODES,
  );

  useEffect(() => {
    if (voyage) crystalPrefs.pushRecent(voyage.code);
  }, [voyage]);

  if (!voyage) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <Crumbs items={[{ label: "Crystal Cruises", to: "/crystal-cruises" }, { label: code }]} />
        <h1 className="mt-4 font-serif text-3xl">Voyage {code}</h1>
        <div className="mt-6">
          <AwaitingInventory
            label="This voyage is not published from licensed inventory"
            hint="Worldway publishes cruise itineraries and fares only from an authorised Crystal feed. A specialist can quote this voyage directly today."
          />
        </div>
      </div>
    );
  }

  const saved = wishlist.includes(voyage.code);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border/60">
        {voyage.media.hero ? (
          <img
            src={voyage.media.hero}
            alt={voyage.title}
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        ) : null}
        <div className="relative mx-auto max-w-7xl px-6 py-16">
          <Crumbs
            items={[
              { label: "Crystal Cruises", to: "/crystal-cruises" },
              { label: voyage.destinationName },
              { label: voyage.code },
            ]}
          />
          <h1 className="mt-4 max-w-3xl font-serif text-4xl md:text-5xl">{voyage.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {voyage.shipName} · {voyage.nights} nights · {voyage.embarkPort} to{" "}
            {voyage.disembarkPort} · departs {voyage.departureDate}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="font-serif text-2xl">{formatFare(voyage)}</span>
            <Badge variant="secondary">{voyage.availability}</Badge>
            <Button asChild>
              <Link to="/crystal-cruises/quote" search={{ voyage: voyage.code }}>
                Reserve or request a quote
              </Link>
            </Button>
            <Button variant="outline" onClick={() => crystalPrefs.toggleWishlist(voyage.code)}>
              {saved ? "Saved" : "Save voyage"}
            </Button>
            <Button variant="outline" onClick={() => crystalPrefs.toggleCompare(voyage.code)}>
              Add to compare
            </Button>
          </div>
        </div>
      </section>

      <Section eyebrow="Itinerary" title="Day by day">
        <ol className="space-y-3">
          {voyage.itinerary.map((d) => (
            <li key={`${d.day}-${d.port}`} className="rounded-xl border border-border/60 p-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-primary">Day {d.day}</p>
              <h3 className="mt-1 font-serif text-lg">{d.port}</h3>
              {d.summary ? <p className="mt-1 text-sm text-muted-foreground">{d.summary}</p> : null}
              {d.arrive || d.depart ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.arrive ? `Arrive ${d.arrive}` : ""} {d.depart ? `· Depart ${d.depart}` : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Fares" title="Suite categories and pricing">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {voyage.fares.map((f, i) => (
            <div key={`${f.suiteCategory}-${i}`} className="rounded-xl border border-border/60 p-5">
              <h3 className="font-serif text-lg">
                {SUITE_CATEGORIES.find((s) => s.value === f.suiteCategory)?.label ??
                  f.suiteCategory}
              </h3>
              <p className="mt-2 text-sm">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: f.currency || voyage.currency || "USD",
                  maximumFractionDigits: 0,
                }).format(f.price)}
              </p>
              {f.promotion ? (
                <Badge className="mt-2" variant="secondary">
                  {f.promotion}
                </Badge>
              ) : null}
            </div>
          ))}
        </div>
        {voyage.inclusions.length ? (
          <ul className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {voyage.inclusions.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section eyebrow="Related" title="Similar voyages">
        <VoyageGrid
          voyages={relatedVoyages(voyage)}
          empty="No related licensed voyages published yet"
        />
      </Section>
    </>
  );
}
