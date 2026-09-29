import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  getCountry,
  getRegion,
  journeysForCountry,
  catalogueFor,
  type CountryNode,
  type RegionNode,
} from "@/lib/destinations";
import { JourneyGrid, DemoNotice } from "@/components/partners/journey-ui";
import { DestinationIntelPanel } from "@/components/destinations/destination-intel";
import type { Journey } from "@/lib/journeys";
import type { CatalogueProduct } from "@/lib/catalogue-types";
import { Button } from "@/components/ui/button";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/destinations/$region/$country/")({
  loader: ({ params }) => {
    const region = getRegion(params.region);
    const country = getCountry(params.region, params.country);
    if (!region || !country) throw notFound();
    return {
      region,
      country,
      journeys: journeysForCountry(country.slug),
      products: catalogueFor([country.name, ...country.destinations.map((d) => d.name)]),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [{ title: "Country unavailable — Worldway" }, { name: "robots", content: "noindex" }],
      };
    const c = loaderData.country;
    const title = `${c.name} Luxury Travel — Worldway Travels Group`;
    const description = c.blurb.slice(0, 155);
    const url = `https://worldwaytravelsgroup.com/destinations/${loaderData.region.slug}/${c.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:image", content: c.heroImage },
        { name: "twitter:image", content: c.heroImage },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "TouristDestination",
                name: c.name,
                description,
                url,
                image: c.heroImage,
                containedInPlace: { "@type": "Place", name: loaderData.region.name },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: "Destinations",
                    item: "https://worldwaytravelsgroup.com/destinations",
                  },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: loaderData.region.name,
                    item: `https://worldwaytravelsgroup.com/destinations/${loaderData.region.slug}`,
                  },
                  { "@type": "ListItem", position: 3, name: c.name, item: url },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: [
                  {
                    "@type": "Question",
                    name: `When is the best time to travel to ${c.name}?`,
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `Peak conditions in ${c.name} are ${c.destinations[0]?.bestMonths.join(", ") ?? "year-round"}. Live departure months are shown on each licensed journey.`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: `Are journeys in ${c.name} bookable online?`,
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `Yes. Every journey listed for ${c.name} comes from a licensed operator feed with live departures, pricing and availability.`,
                    },
                  },
                ],
              },
            ],
          }),
        },
      ],
    };
  },
  notFoundComponent: Missing,
  errorComponent: Missing,
  component: CountryPage,
});

function Missing() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Country unavailable</h1>
      <Button asChild className="mt-6">
        <Link to="/destinations">All destinations</Link>
      </Button>
    </div>
  );
}

function CountryPage() {
  const { region, country, journeys, products } = Route.useLoaderData() as {
    region: RegionNode;
    country: CountryNode;
    journeys: Journey[];
    products: CatalogueProduct[];
  };

  return (
    <div>
      <header className="relative h-[42vh] min-h-[300px] overflow-hidden">
        <img
          src={mediaUrl(country.heroImage)}
          alt={`${country.name} luxury travel`}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-6xl px-4 pb-8">
          <nav className="text-xs text-muted-foreground">
            <Link to="/destinations" className="underline underline-offset-4">
              Destinations
            </Link>{" "}
            /{" "}
            <Link
              to="/destinations/$region"
              params={{ region: region.slug }}
              className="underline underline-offset-4"
            >
              {region.name}
            </Link>{" "}
            / {country.name}
          </nav>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">{country.name}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="max-w-3xl text-muted-foreground">{country.blurb}</p>
        {country.states.length > 0 && (
          <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
            States &amp; provinces we cover: {country.states.join(" · ")}
          </p>
        )}
        <DemoNotice className="mt-5 max-w-3xl" />

        <h2 className="mt-12 font-serif text-2xl">Destinations in {country.name}</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {country.destinations.map((d) => (
            <Link
              key={d.slug}
              to="/destinations/$region/$country/$destination"
              params={{ region: region.slug, country: country.slug, destination: d.slug }}
              className="rounded-lg border border-border/60 p-5 transition-colors hover:border-primary/50"
            >
              <h3 className="font-serif text-xl">{d.name}</h3>
              {d.state ? <p className="text-xs text-muted-foreground">{d.state}</p> : null}
              <p className="mt-2 text-sm text-muted-foreground">{d.blurb}</p>
              <p className="mt-3 text-xs text-muted-foreground">Best: {d.bestMonths.join(", ")}</p>
            </Link>
          ))}
        </div>

        <h2 className="mt-14 font-serif text-2xl">Journeys in {country.name}</h2>
        <div className="mt-5">
          <JourneyGrid journeys={journeys} />
        </div>

        <DestinationIntelPanel country={country.name} />

        {products.length > 0 && (
          <section className="mt-14">
            <h2 className="font-serif text-2xl">More from the Worldway catalogue</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <a
                  key={`${p.kind}-${p.slug}`}
                  href={`${p.detailBase}/${p.slug}`}
                  className="rounded-lg border border-border/60 p-4 transition-colors hover:border-primary/50"
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {p.collectionTitle}
                  </p>
                  <p className="mt-1 font-serif text-lg">{p.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.location} · {p.duration}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
