import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CONCIERGE_PROMPTS,
  CRYSTAL_DESTINATIONS,
  CRYSTAL_FAQS,
  CRYSTAL_HERO_IMAGE,
  CRYSTAL_SHIPS,
  MEMBERSHIP_BENEFITS,
  WHY_CRYSTAL,
} from "@/lib/crystal/content";
import { searchVoyages } from "@/lib/crystal/inventory";
import {
  FaqList,
  LicenceNotice,
  Section,
  VoyageGrid,
  breadcrumbSchema,
  faqSchema,
} from "@/components/crystal/crystal-ui";

const URL = "https://worldwaytravelsgroup.com/crystal-cruises";
const TITLE = "Crystal Cruises — Luxury Voyages | Worldway Travels Group";
const DESCRIPTION =
  "Plan a Crystal Cruises voyage with Worldway: all-suite ocean and expedition sailings, destination guidance, ship profiles and specialist booking support.";

export const Route = createFileRoute("/crystal-cruises/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: CRYSTAL_HERO_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: CRYSTAL_HERO_IMAGE },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(faqSchema(CRYSTAL_FAQS)),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Home", url: "https://worldwaytravelsgroup.com/" },
            { name: "Crystal Cruises", url: URL },
          ]),
        ),
      },
    ],
  }),
  component: CrystalHub,
});

function CrystalHub() {
  const featured = searchVoyages({ sort: "date-asc" });

  return (
    <>
      <section className="relative overflow-hidden border-b border-border/60">
        <img
          src={CRYSTAL_HERO_IMAGE}
          alt="Luxury cruise ship at sea"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-32">
          <p className="text-[11px] uppercase tracking-[0.4em] text-primary">Crystal Cruises</p>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">
            All-suite ocean and expedition voyages, arranged end to end
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
            Worldway advisors plan the voyage, the flights, the pre- and post-cruise stays and the
            documentation on a single booking record — with cruise pricing published only from
            authorised distribution.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/crystal-cruises/search">Find a voyage</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/crystal-cruises/destinations">Explore destinations</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/crystal-cruises/quote">Request a quote</Link>
            </Button>
          </div>
        </div>
      </section>

      <Section
        eyebrow="Availability"
        title="Featured voyages"
        intro="Live inventory appears here as soon as Crystal's authorised feed is connected to this account."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/crystal-cruises/search">Open the cruise finder</Link>
          </Button>
        }
      >
        {!featured.licensed ? <LicenceNotice className="mb-6" /> : null}
        <VoyageGrid
          voyages={featured.voyages.slice(0, 6)}
          empty="Licensed voyage inventory is not yet connected"
        />
      </Section>

      <Section eyebrow="Destinations" title="Where Crystal sails">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CRYSTAL_DESTINATIONS.map((d) => (
            <Link
              key={d.slug}
              to="/crystal-cruises/destinations/$slug"
              params={{ slug: d.slug }}
              className="group overflow-hidden rounded-xl border border-border/60"
            >
              <div className="h-36 overflow-hidden">
                <img
                  src={d.hero}
                  alt={`${d.name} cruising region`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <h3 className="font-serif text-lg">{d.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.overview}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Fleet" title="Ships and suite grades">
        <div className="grid gap-6 md:grid-cols-2">
          {CRYSTAL_SHIPS.map((s) => (
            <Card key={s.slug} className="overflow-hidden border-border/60">
              <Link to="/crystal-cruises/ships/$slug" params={{ slug: s.slug }}>
                <img
                  src={s.hero}
                  alt={s.name}
                  loading="lazy"
                  className="h-48 w-full object-cover"
                />
                <div className="p-5">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {s.classification}
                  </p>
                  <h3 className="mt-1 font-serif text-xl">{s.name}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{s.overview}</p>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      </Section>

      <Section eyebrow="Why book here" title="What Worldway adds">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_CRYSTAL.map((w) => (
            <div key={w.title} className="rounded-xl border border-border/60 p-5">
              <h3 className="font-serif text-lg">{w.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{w.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Concierge" title="Ask the AI Cruise Concierge">
        <div className="flex flex-wrap gap-2">
          {CONCIERGE_PROMPTS.map((p) => (
            <Button key={p} asChild variant="outline" size="sm">
              <Link to="/concierge" search={{ prompt: p }}>
                {p}
              </Link>
            </Button>
          ))}
        </div>
      </Section>

      <Section eyebrow="Membership" title="Worldway member benefits on Crystal bookings">
        <ul className="grid gap-3 sm:grid-cols-2">
          {MEMBERSHIP_BENEFITS.map((b) => (
            <li key={b} className="rounded-lg border border-border/60 p-4 text-sm">
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link to="/membership">See membership tiers</Link>
          </Button>
        </div>
      </Section>

      <Section eyebrow="Questions" title="Crystal Cruises FAQs">
        <FaqList faqs={CRYSTAL_FAQS} />
      </Section>
    </>
  );
}
