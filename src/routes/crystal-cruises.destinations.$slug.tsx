import { getCrystalVoyages } from "@/lib/crystal/crystal.functions";
import { hydrateLicensedVoyages } from "@/lib/crystal/inventory";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CRYSTAL_PORTS, destinationBySlug } from "@/lib/crystal/content";
import { voyagesForDestination } from "@/lib/crystal/inventory";
import {
  Crumbs,
  FaqList,
  LicenceNotice,
  Section,
  VoyageGrid,
  breadcrumbSchema,
  faqSchema,
} from "@/components/crystal/crystal-ui";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/crystal-cruises/destinations/$slug")({
  loader: async ({ params }) => {
    const destination = destinationBySlug(params.slug);
    if (!destination) throw notFound();
    const feed = await getCrystalVoyages({ data: {} });
    return {
      ...feed, destination };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Unavailable — Worldway Travels Group" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const d = loaderData.destination;
    const url = `https://worldwaytravelsgroup.com/crystal-cruises/destinations/${params.slug}`;
    const title = `${d.name} Cruises with Crystal — Ports & Seasons | Worldway`;
    const description = `${d.overview}`.slice(0, 155);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: d.hero },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: d.hero },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(faqSchema(d.faqs)) },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Home", url: "https://worldwaytravelsgroup.com/" },
              { name: "Crystal Cruises", url: "https://worldwaytravelsgroup.com/crystal-cruises" },
              {
                name: "Destinations",
                url: "https://worldwaytravelsgroup.com/crystal-cruises/destinations",
              },
              { name: d.name, url },
            ]),
          ),
        },
      ],
    };
  },
  component: DestinationPage,
});

function DestinationPage() {
  const loaderData = Route.useLoaderData();
  hydrateLicensedVoyages(loaderData.voyages);
  const { destination: d } = Route.useLoaderData();
  const voyages = voyagesForDestination(d.slug);
  const ports = CRYSTAL_PORTS.filter((p) => d.ports.includes(p.slug));

  return (
    <>
      <section className="relative overflow-hidden border-b border-border/60">
        <img
          src={mediaUrl(d.hero)}
          alt={`${d.name} cruise region`}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="relative mx-auto max-w-7xl px-6 py-20">
          <Crumbs
            items={[
              { label: "Crystal Cruises", to: "/crystal-cruises" },
              { label: "Destinations", to: "/crystal-cruises/destinations" },
              { label: d.name },
            ]}
          />
          <h1 className="mt-4 font-serif text-4xl md:text-5xl">{d.name} cruises</h1>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">{d.overview}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-primary">{d.bestTime}</p>
        </div>
      </section>

      <Section
        eyebrow="Availability"
        title={`Voyages in the ${d.name}`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/crystal-cruises/search" search={{ destination: d.slug }}>
              Refine in the cruise finder
            </Link>
          </Button>
        }
      >
        {voyages.length === 0 ? <LicenceNotice className="mb-6" /> : null}
        <VoyageGrid voyages={voyages} empty={`No licensed ${d.name} voyages published yet`} />
      </Section>

      <Section eyebrow="Ports" title="Signature ports of call">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ports.map((p) => (
            <div key={p.slug} className="rounded-xl border border-border/60 p-5">
              <h3 className="font-serif text-lg">{p.name}</h3>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {p.country}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{p.summary}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Planning" title="Season and countries">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 p-5">
            <h3 className="font-serif text-lg">Cruising season</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d.season.join(" · ")}</p>
          </div>
          <div className="rounded-xl border border-border/60 p-5">
            <h3 className="font-serif text-lg">Countries visited</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d.countries.join(" · ")}</p>
          </div>
        </div>
      </Section>

      {d.related.length ? (
        <Section eyebrow="Related" title="Other regions to consider">
          <div className="flex flex-wrap gap-2">
            {d.related.map((slug: string) => {
              const r = destinationBySlug(slug);
              if (!r) return null;
              return (
                <Button key={slug} asChild variant="outline" size="sm">
                  <Link to="/crystal-cruises/destinations/$slug" params={{ slug }}>
                    {r.name}
                  </Link>
                </Button>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section eyebrow="Questions" title={`${d.name} cruise FAQs`}>
        <FaqList faqs={d.faqs} />
      </Section>
    </>
  );
}
