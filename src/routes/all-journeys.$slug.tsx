import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { formatPrice, type Journey, formatJourneyTitle } from "@/lib/data";
import { getStaticJourney } from "@/lib/all-journeys.functions";
import { getSyncedJourney } from "@/lib/catalogue-sync/sync.functions";
import { mergeJourney } from "@/lib/catalogue-sync/merge";
import { Button } from "@/components/ui/button";
import { AvailabilityBadge, JourneyCard, SectionHeading, Breadcrumbs } from "@/components/site";
import { Clock, MapPin, Calendar } from "lucide-react";
import {
  JourneyExperience,
  getContentRegistries,
} from "@/components/train-tours/glrep/journey/JourneyExperience";
import { FullPackageInformation } from "@/components/FullPackageInformation";
import { mediaUrl } from "@/lib/media";

const SITE = "https://worldwaytravelsgroup.com";

function JourneyErrorComponent({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <div className="container-lux py-40 text-center">
      <h1 className="font-serif text-4xl">Something went wrong</h1>
      <button
        type="button"
        className="mt-6 underline"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Try again
      </button>
    </div>
  );
}

export const Route = createFileRoute("/all-journeys/$slug")({
  loader: async ({ params }) => {
    // 0) Synced A&K catalogue (active records merged over Worldway content; removed journeys hidden)
    const [synced, st] = await Promise.all([
      getSyncedJourney({ data: { slug: params.slug } }).catch(() => null),
      getStaticJourney({ data: { slug: params.slug } }).catch(() => ({ journey: null, related: [] as Journey[] })),
    ]);
    const staticJourney = st.journey ?? undefined;
    if (synced && !synced.active) throw notFound();
    // 1) Primary marketing catalogue
    const journey = synced
      ? mergeJourney(staticJourney, synced.journey as Journey)
      : staticJourney;
    if (journey) {
      const related = st.related as Journey[];
      return { kind: "marketing" as const, journey, related };
    }
    // 2) Fallback: train-tours / rail journey registry (preserves former /journeys/$journey URLs)
    const r = getContentRegistries();
    const found = r.journeys.getBySlug(params.slug);
    if (found.ok) return { kind: "rail" as const, railJourney: found.value };
    throw notFound();
  },
  head: ({ loaderData }) => {
    if (loaderData?.kind === "rail") {
      const j = loaderData.railJourney;
      const r = getContentRegistries();
      const url = `${SITE}${j.seo.canonicalPath}`;
      const og = j.seo.ogImageAssetId ? r.media.get(j.seo.ogImageAssetId) : undefined;
      const ogImage = og && og.ok ? og.value.url : undefined;
      return {
        meta: [
          { title: j.seo.title },
          { name: "description", content: j.seo.description },
          { name: "keywords", content: j.seo.keywords.join(", ") },
          { property: "og:title", content: j.seo.title },
          { property: "og:description", content: j.seo.description },
          { property: "og:type", content: "website" },
          { property: "og:url", content: url },
          ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
          { name: "twitter:card", content: "summary_large_image" },
          { name: "twitter:title", content: j.seo.title },
          { name: "twitter:description", content: j.seo.description },
        ],
        links: [{ rel: "canonical", href: url }],
        scripts: [
          { type: "application/ld+json", children: JSON.stringify(j.jsonLd) },
          ...(j.faqs.length > 0
            ? [
                {
                  type: "application/ld+json",
                  children: JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    mainEntity: j.faqs.map((f) => ({
                      "@type": "Question",
                      name: f.question,
                      acceptedAnswer: { "@type": "Answer", text: f.answer },
                    })),
                  }),
                },
              ]
            : []),
        ],
      };
    }
    const j = loaderData?.journey;
    const journeyTitle = j?.title?.trim()
      ? j.title
      : j?.slug
        ? j.slug
            .split("-")
            .filter(Boolean)
            .map((segment) =>
              segment.length <= 3
                ? segment.toUpperCase()
                : `${segment[0].toUpperCase()}${segment.slice(1)}`,
            )
            .join(" ")
        : "Journey";
    const canonical = `${SITE}/all-journeys/${j?.slug}`;
    return {
      meta: [
        { title: `${journeyTitle} | Worldway Travels Group` },
        { name: "description", content: j?.overview ?? "" },
        { property: "og:title", content: `${journeyTitle} | Worldway Travels Group` },
        { property: "og:description", content: j?.overview ?? "" },
        { property: "og:image", content: j?.image ?? "" },
        { property: "og:type", content: "product" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${journeyTitle} | Worldway Travels Group` },
        { name: "twitter:description", content: j?.overview ?? "" },
        { name: "twitter:image", content: j?.image ?? "" },
      ],
      links: [
        { rel: "canonical", href: canonical },
        ...(j?.image
          ? [
              {
                rel: "preload",
                as: "image" as const,
                href: j.image,
                fetchPriority: "high" as const,
              },
            ]
          : []),
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: journeyTitle,
            description: j?.overview ?? "",
            image: j?.image ?? "",
            brand: { "@type": "Brand", name: "Worldway Travels Group" },
            offers: {
              "@type": "Offer",
              price: j?.priceFrom ?? undefined,
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: canonical,
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE },
              { "@type": "ListItem", position: 2, name: "Journeys", item: `${SITE}/journeys` },
              { "@type": "ListItem", position: 3, name: journeyTitle, item: canonical },
            ],
          }),
        },
        ...(j?.faqs && j.faqs.length > 0
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: j.faqs.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                  })),
                }),
              },
            ]
          : []),
      ],
    };
  },
  notFoundComponent: () => (
    <div className="container-lux py-40 text-center">
      <h1 className="font-serif text-4xl">Journey not found</h1>
    </div>
  ),
  errorComponent: JourneyErrorComponent,
    return (
      <div className="container-lux py-40 text-center">
        <h1 className="font-serif text-4xl">Something went wrong</h1>
        <button
          type="button"
          className="mt-6 underline"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Try again
        </button>
      </div>
    );
  },
  component: JourneyPage,
});

function JourneyPage() {
  const data = Route.useLoaderData();
  if (data.kind === "rail") {
    return <JourneyExperience journey={data.railJourney} />;
  }
  const { journey: j, related } = data as unknown as { journey: Journey; related: Journey[] };
  const journeyTitle = formatJourneyTitle(j.slug, j.title);

  return (
    <main className="pt-20">
      <section className="relative flex h-[65vh] items-end overflow-hidden">
        <img
          src={mediaUrl(j.image)}
          alt={journeyTitle}
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-ink/20" />
        <div className="container-lux relative z-10 pb-12 text-primary-foreground">
          <div className="mb-4">
            <AvailabilityBadge status={j.availability} />
          </div>
          <h1 className="max-w-3xl font-serif text-5xl md:text-6xl">{journeyTitle}</h1>
          <div className="mt-4 flex flex-wrap gap-5 text-sm text-primary-foreground/85">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {j.destination}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {j.duration} days
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {j.departures.join(" · ")}
            </span>
          </div>
        </div>
      </section>

      <section className="container-lux py-8">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Journeys", to: "/all-journeys" },
            { label: journeyTitle },
          ]}
        />
      </section>

      <section className="container-lux grid gap-12 pb-16 lg:grid-cols-[1fr_340px]">
        <div className="space-y-12">
          <div>
            <SectionHeading eyebrow="The journey" title="Overview" intro={j.overview} />
            <h3 className="mt-8 font-serif text-2xl">Highlights</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {j.highlights.map((h) => (
                <li key={h} className="flex gap-2 text-sm">
                  <span className="text-gold">◆</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>

          <FullPackageInformation
            title={journeyTitle}
            overview={j.overview}
            itinerary={j.itinerary}
            inclusions={j.inclusions}
            exclusions={j.exclusions}
            accommodations={j.accommodations}
            faqs={j.faqs}
            destination={j.destination}
            durationLabel={`${j.duration} days`}
            priceLabel={j.priceFrom != null ? formatPrice(j.priceFrom) : "On request"}
            departures={j.departures}
            supplier="Worldway Travels Group"
            quickFacts={[
              { label: "Travel style", value: j.style.join(", ") },
              { label: "Availability", value: j.availability },
            ]}
          />
        </div>

        {/* Sticky booking */}
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-sm border border-border bg-card p-6 shadow-elegant">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">From</p>
            <p className="font-serif text-3xl">{formatPrice(j.priceFrom)}</p>
            <div className="mt-4">
              <AvailabilityBadge status={j.availability} />
            </div>
            <dl className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{j.duration} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Destination</dt>
                <dd>{j.destination}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Style</dt>
                <dd className="text-right">{j.style.join(", ")}</dd>
              </div>
            </dl>
            <Link to="/book/$kind/$slug" params={{ kind: "journey", slug: j.slug }} className="mt-6 block">
              <Button variant="gold" className="w-full">
                Request Availability
              </Button>
            </Link>
            <Link to="/contact" className="mt-3 block">
              <Button variant="outline-ink" className="w-full">
                Enquire
              </Button>
            </Link>
          </div>
        </aside>
      </section>

      {related.length > 0 && (
        <section className="bg-secondary/40 py-20">
          <div className="container-lux">
            <SectionHeading eyebrow="You may also like" title="Related journeys" />
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <JourneyCard key={r.slug} journey={r} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
