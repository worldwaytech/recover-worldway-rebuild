import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  getCountry,
  getDestination,
  getRegion,
  journeysForDestination,
  catalogueFor,
  destinationFaqs,
  mapEmbedUrl,
  relatedDestinations,
  type CountryNode,
  type DestinationNode,
  type RegionNode,
} from "@/lib/destinations";
import { JourneyGrid, DemoNotice } from "@/components/partners/journey-ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import type { Journey } from "@/lib/journeys";
import type { CatalogueProduct } from "@/lib/catalogue-types";

export const Route = createFileRoute("/destinations/$region/$country/$destination")({
  loader: ({ params }) => {
    const region = getRegion(params.region);
    const country = getCountry(params.region, params.country);
    const destination = getDestination(params.region, params.country, params.destination);
    if (!region || !country || !destination) throw notFound();
    return {
      region,
      country,
      destination,
      journeys: journeysForDestination(destination.slug),
      products: catalogueFor([destination.name]),
      nearby: relatedDestinations(region.slug, destination.slug),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Destination unavailable — Worldway" },
          { name: "robots", content: "noindex" },
        ],
      };
    const d = loaderData.destination;
    const title = `${d.name} Luxury Travel Guide — Worldway Travels Group`;
    const description = d.blurb.slice(0, 155);
    const url = `https://worldwaytravelsgroup.com/destinations/${loaderData.region.slug}/${loaderData.country.slug}/${d.slug}`;
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
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TouristDestination",
            name: d.name,
            description: d.blurb,
            geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng },
            containedInPlace: { "@type": "Country", name: loaderData.country.name },
          }),
        },
      ],
    };
  },
  notFoundComponent: MissingNotFound,
  errorComponent: MissingError,
  component: DestinationPage,
});

function MissingError() {
  return <UnavailableScreen />;
}

function MissingNotFound() {
  return <UnavailableScreen />;
}

function UnavailableScreen() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Destination unavailable</h1>
      <Button asChild className="mt-6">
        <Link to="/destinations">All destinations</Link>
      </Button>
    </div>
  );
}

function DestinationPage() {
  const {
    region,
    country,
    destination: d,
    journeys,
    products,
    nearby,
  } = Route.useLoaderData() as {
    region: RegionNode;
    country: CountryNode;
    destination: DestinationNode;
    journeys: Journey[];
    products: CatalogueProduct[];
    nearby: { region: string; country: CountryNode; dest: DestinationNode }[];
  };
  const faqs = destinationFaqs(d.name, d.bestMonths);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
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
        /{" "}
        <Link
          to="/destinations/$region/$country"
          params={{ region: region.slug, country: country.slug }}
          className="underline underline-offset-4"
        >
          {country.name}
        </Link>{" "}
        / {d.name}
      </nav>
      <h1 className="mt-3 font-serif text-4xl">{d.name}</h1>
      {d.state ? (
        <p className="text-sm text-muted-foreground">
          {d.state}, {country.name}
        </p>
      ) : null}
      <p className="mt-4 max-w-3xl text-muted-foreground">{d.blurb}</p>
      <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
        Best months: {d.bestMonths.join(", ")}
      </p>
      <DemoNotice className="mt-5 max-w-3xl" />

      <div className="mt-8 overflow-hidden rounded-lg border border-border/60">
        <iframe
          title={`Map of ${d.name}`}
          src={mapEmbedUrl(d.lat, d.lng)}
          loading="lazy"
          className="h-[320px] w-full"
        />
      </div>

      <h2 className="mt-14 font-serif text-2xl">Journeys featuring {d.name}</h2>
      <div className="mt-5">
        <JourneyGrid journeys={journeys} />
      </div>

      {products.length > 0 && (
        <section className="mt-14">
          <h2 className="font-serif text-2xl">Catalogue matches</h2>
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

      <section className="mt-14">
        <h2 className="font-serif text-2xl">Frequently asked</h2>
        <Accordion type="single" collapsible className="mt-4 max-w-3xl">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {nearby.length > 0 && (
        <section className="mt-14">
          <h2 className="font-serif text-2xl">Nearby destinations</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {nearby.map((n) => (
              <Button key={n.dest.slug} asChild size="sm" variant="outline">
                <Link
                  to="/destinations/$region/$country/$destination"
                  params={{ region: n.region, country: n.country.slug, destination: n.dest.slug }}
                >
                  {n.dest.name}
                </Link>
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
