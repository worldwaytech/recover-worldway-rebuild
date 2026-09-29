import { createFileRoute, Link } from "@tanstack/react-router";
import { CRYSTAL_SHIPS } from "@/lib/crystal/content";
import { Crumbs, Section, breadcrumbSchema } from "@/components/crystal/crystal-ui";
import { mediaUrl } from "@/lib/media";

const URL = "https://worldwaytravelsgroup.com/crystal-cruises/ships";
const TITLE = "Crystal Cruises Ships — Suites, Dining & Wellness | Worldway";
const DESCRIPTION =
  "Compare Crystal Cruises ships: all-suite accommodation grades, dining venues, lounges, wellness, enrichment, accessibility and sustainability.";

export const Route = createFileRoute("/crystal-cruises/ships/")({
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
            { name: "Crystal Cruises", url: "https://worldwaytravelsgroup.com/crystal-cruises" },
            { name: "Ships", url: URL },
          ]),
        ),
      },
    ],
  }),
  component: ShipsIndex,
});

function ShipsIndex() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <Crumbs
          items={[{ label: "Crystal Cruises", to: "/crystal-cruises" }, { label: "Ships" }]}
        />
      </div>
      <Section eyebrow="Fleet" title="Crystal ships">
        <div className="grid gap-6 md:grid-cols-2">
          {CRYSTAL_SHIPS.map((s) => (
            <Link
              key={s.slug}
              to="/crystal-cruises/ships/$slug"
              params={{ slug: s.slug }}
              className="group overflow-hidden rounded-xl border border-border/60"
            >
              <img
                src={mediaUrl(s.hero)}
                alt={s.name}
                loading="lazy"
                className="h-52 w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {s.classification}
                </p>
                <h2 className="mt-1 font-serif text-xl">{s.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{s.overview}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
