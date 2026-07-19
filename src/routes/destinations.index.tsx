import { createFileRoute, Link } from "@tanstack/react-router";
import { regions } from "@/lib/data";
import { SectionHeading } from "@/components/site";

export const Route = createFileRoute("/destinations/")({
  head: () => ({
    meta: [
      { title: "Destinations | Worldway Luxe" },
      { name: "description", content: "Extraordinary luxury travel destinations across all seven continents, curated by Worldway Luxe specialists." },
      { property: "og:title", content: "Destinations | Worldway Luxe" },
      { property: "og:description", content: "Extraordinary luxury travel destinations across all seven continents." },
      { property: "og:url", content: "/destinations" },
    ],
    links: [{ rel: "canonical", href: "/destinations" }],
  }),
  component: DestinationsIndex,
});

function DestinationsIndex() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <SectionHeading
          eyebrow="Explore the world"
          title="Destinations"
          intro="From the plains of Africa to the ice of Antarctica, discover the destinations Worldway Luxe brings to life."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {regions.map((r) => (
            <Link
              key={r.slug}
              to="/destinations/$slug"
              params={{ slug: r.slug }}
              className="group relative aspect-[4/5] overflow-hidden rounded-sm"
            >
              <img src={r.image} alt={r.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-primary-foreground">
                <h3 className="font-serif text-3xl">{r.name}</h3>
                <p className="mt-1 text-sm text-primary-foreground/80 line-clamp-2">{r.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
