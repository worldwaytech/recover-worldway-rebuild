import { createFileRoute } from "@tanstack/react-router";
import { journeys, categories } from "@/lib/data";
import { JourneyCard, SectionHeading } from "@/components/site";

export const Route = createFileRoute("/journeys/")({
  head: () => ({
    meta: [
      { title: "Luxury Journeys | Worldway Luxe" },
      { name: "description", content: "Signature private journeys, small-group departures, expedition cruises and private jet experiences from Worldway Luxe." },
      { property: "og:title", content: "Luxury Journeys | Worldway Luxe" },
      { property: "og:description", content: "Signature private journeys and expedition experiences." },
      { property: "og:url", content: "/journeys" },
    ],
    links: [{ rel: "canonical", href: "/journeys" }],
  }),
  component: JourneysIndex,
});

function JourneysIndex() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <SectionHeading
          eyebrow="Signature collection"
          title="Luxury Journeys"
          intro="Extraordinary itineraries — from small-group departures to fully private, tailor-made experiences."
        />

        <div className="mt-8 flex flex-wrap gap-2">
          {categories.slice(0, 8).map((c) => (
            <span key={c.slug} className="rounded-full border border-border bg-card px-4 py-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              {c.name}
            </span>
          ))}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {journeys.map((j) => <JourneyCard key={j.slug} journey={j} />)}
        </div>
      </section>
    </main>
  );
}
