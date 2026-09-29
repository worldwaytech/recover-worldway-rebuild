import { getCrystalVoyages } from "@/lib/crystal/crystal.functions";
import { hydrateLicensedVoyages } from "@/lib/crystal/inventory";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { shipBySlug } from "@/lib/crystal/content";
import { voyagesForShip } from "@/lib/crystal/inventory";
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

export const Route = createFileRoute("/crystal-cruises/ships/$slug")({
  loader: async ({ params }) => {
    const ship = shipBySlug(params.slug);
    if (!ship) throw notFound();
    const feed = await getCrystalVoyages({ data: {} });
    return {
      ...feed, ship };
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
    const s = loaderData.ship;
    const url = `https://worldwaytravelsgroup.com/crystal-cruises/ships/${params.slug}`;
    const title = `${s.name} — Suites, Dining & Deck Overview | Worldway`;
    const description = s.overview.slice(0, 155);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: s.hero },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: s.hero },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(faqSchema(s.faqs)) },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbSchema([
              { name: "Home", url: "https://worldwaytravelsgroup.com/" },
              { name: "Crystal Cruises", url: "https://worldwaytravelsgroup.com/crystal-cruises" },
              { name: "Ships", url: "https://worldwaytravelsgroup.com/crystal-cruises/ships" },
              { name: s.name, url },
            ]),
          ),
        },
      ],
    };
  },
  component: ShipPage,
});

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border/60 p-5">
      <h3 className="font-serif text-lg">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function ShipPage() {
  const loaderData = Route.useLoaderData();
  hydrateLicensedVoyages(loaderData.voyages);
  const { ship: s } = Route.useLoaderData();
  const voyages = voyagesForShip(s.slug);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border/60">
        <img
          src={mediaUrl(s.hero)}
          alt={s.name}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="relative mx-auto max-w-7xl px-6 py-20">
          <Crumbs
            items={[
              { label: "Crystal Cruises", to: "/crystal-cruises" },
              { label: "Ships", to: "/crystal-cruises/ships" },
              { label: s.name },
            ]}
          />
          <h1 className="mt-4 font-serif text-4xl md:text-5xl">{s.name}</h1>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">{s.overview}</p>
        </div>
      </section>

      <Section eyebrow="Specification" title="At a glance">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {s.specs.map((sp: { label: string; value: string }) => (
            <div key={sp.label} className="rounded-xl border border-border/60 p-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {sp.label}
              </p>
              <p className="mt-1 text-sm">{sp.value}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Accommodation" title="Suite grades">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {s.suites.map((su: (typeof s.suites)[number]) => (
            <div key={su.id} className="rounded-xl border border-border/60 p-5">
              <h3 className="font-serif text-lg">{su.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{su.description}</p>
              {su.sizeSqFt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {su.sizeSqFt} sq ft · sleeps {su.occupancy ?? 2}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Life on board" title="Dining, lounges and wellness">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <List title="Dining" items={s.dining} />
          <List title="Lounges and bars" items={s.lounges} />
          <List title="Wellness" items={s.wellness} />
          <List title="Enrichment" items={s.enrichment} />
          <List title="Accessibility" items={s.accessibility} />
          <List title="Sustainability" items={s.sustainability} />
        </div>
      </Section>

      <Section eyebrow="Decks" title="Deck layout">
        <div className="grid gap-4 sm:grid-cols-3">
          {s.decks.map((d: { name: string; summary: string }) => (
            <div key={d.name} className="rounded-xl border border-border/60 p-5">
              <h3 className="font-serif text-lg">{d.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d.summary}</p>
            </div>
          ))}
        </div>
        {s.deckPlanUrl ? (
          <Button asChild className="mt-6" variant="outline">
            <a href={s.deckPlanUrl} target="_blank" rel="noreferrer">
              View licensed deck plan
            </a>
          </Button>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Deck plans and virtual tours render here once licensed assets are supplied.
          </p>
        )}
      </Section>

      <Section
        eyebrow="Availability"
        title={`Voyages aboard ${s.name}`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/crystal-cruises/search" search={{ ship: s.slug }}>
              Search this ship
            </Link>
          </Button>
        }
      >
        {voyages.length === 0 ? <LicenceNotice className="mb-6" /> : null}
        <VoyageGrid voyages={voyages} empty={`No licensed ${s.name} voyages published yet`} />
      </Section>

      <Section eyebrow="Questions" title={`${s.name} FAQs`}>
        <FaqList faqs={s.faqs} />
      </Section>
    </>
  );
}
