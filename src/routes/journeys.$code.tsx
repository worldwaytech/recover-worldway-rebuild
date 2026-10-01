// Journey detail route.
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { JourneyTemplate } from "@/components/partners/journey-template";
import { getJourney, relatedJourneys, type Journey } from "@/lib/journeys";
import { templateForKind, getTemplate } from "@/lib/partners/templates";

export const Route = createFileRoute("/journeys/$code")({
  loader: ({ params }) => {
    const journey = getJourney(params.code);
    if (!journey) throw notFound();
    return { journey, related: relatedJourneys(journey) };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Journey unavailable — Worldway Travels Group" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const j = loaderData.journey;
    const title = `${j.title} | Worldway Travels Group`;
    const description = `${j.durationDays}-day ${j.collection.toLowerCase()} in ${j.country} curated by Worldway. From ${j.currency} ${j.priceFrom.toLocaleString()} per person.`;
    const url = `https://worldwaytravelsgroup.com/journeys/${j.code}`;
    return {
      meta: [
        { title },
        { name: "description", content: description.slice(0, 158) },
        { property: "og:title", content: title },
        { property: "og:description", content: description.slice(0, 158) },
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
            "@type": (
              (j.templateId ? getTemplate(j.templateId) : null) ?? templateForKind(j.collectionKind)
            ).schemaType,
            name: j.title,
            description: j.subtitle,
            touristType: j.groupStyle,
            provider: { "@type": "Organization", name: "Worldway Travels Group" },
            offers: { "@type": "Offer", price: j.priceFrom, priceCurrency: j.currency },
            aggregateRating: j.reviewCount
              ? { "@type": "AggregateRating", ratingValue: j.rating, reviewCount: j.reviewCount }
              : undefined,
          }),
        },
      ],
    };
  },
  notFoundComponent: JourneyNotFound,
  errorComponent: JourneyError,
  component: JourneyDetail,
});

function JourneyError() {
  return <JourneyUnavailable />;
}

function JourneyNotFound() {
  return <JourneyUnavailable />;
}

function JourneyUnavailable() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Journey unavailable</h1>
      <p className="mt-3 text-muted-foreground">
        This itinerary is no longer published. Browse the full collection instead.
      </p>
      <Button asChild className="mt-6">
        <Link to="/journeys">All journeys</Link>
      </Button>
    </div>
  );
}

function JourneyDetail() {
  const { journey, related } = Route.useLoaderData() as { journey: Journey; related: Journey[] };
  return <JourneyTemplate journey={journey} related={related} />;
}
