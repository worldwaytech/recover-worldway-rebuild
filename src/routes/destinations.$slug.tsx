import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { regions, journeys } from "@/lib/data";
import { JourneyCard, SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/destinations/$slug")({
  loader: ({ params }) => {
    const region = regions.find((r) => r.slug === params.slug);
    if (!region) throw notFound();
    return { region };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Not found" }, { name: "robots", content: "noindex" }] };
    }
    const r = loaderData.region;
    return {
      meta: [
        { title: `${r.name} Luxury Travel | Worldway Luxe` },
        { name: "description", content: r.blurb },
        { property: "og:title", content: `${r.name} Luxury Travel | Worldway Luxe` },
        { property: "og:description", content: r.blurb },
        { property: "og:image", content: r.image },
        { property: "og:url", content: `/destinations/${r.slug}` },
      ],
      links: [{ rel: "canonical", href: `/destinations/${r.slug}` }],
    };
  },
  component: DestinationPage,
});

function DestinationPage() {
  const { region } = Route.useLoaderData();
  const regionJourneys = journeys.filter((j) => j.region === region.slug);

  return (
    <main>
      <section className="relative h-[70vh] min-h-[500px] overflow-hidden">
        <img src={region.image} alt={region.name} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/20 to-ink/70" />
        <div className="container-lux relative z-10 flex h-full flex-col items-center justify-center text-center text-primary-foreground">
          <p className="eyebrow mb-4 text-primary-foreground/80">Destination</p>
          <h1 className="font-serif text-5xl md:text-7xl">{region.name}</h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/80">{region.blurb}</p>
        </div>
      </section>

      <section className="container-lux py-20">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Overview" title={`Journeys through ${region.name}`} />
            <p className="mt-6 text-muted-foreground leading-relaxed">{region.intro}</p>
            {region.whenToGo && (
              <div className="mt-6">
                <p className="eyebrow mb-2">When to Go</p>
                <p className="text-sm text-muted-foreground">{region.whenToGo}</p>
              </div>
            )}
          </div>
          <div>
            <p className="eyebrow mb-4">Signature Highlights</p>
            <ul className="space-y-3">
              {(region.highlights ?? []).map((h) => (
                <li key={h} className="border-l-2 border-gold pl-4 text-sm">{h}</li>
              ))}
            </ul>
            <p className="eyebrow mb-4 mt-8">Countries</p>
            <div className="flex flex-wrap gap-2">
              {region.countries.map((c) => (
                <span key={c} className="rounded-sm border border-border bg-card px-3 py-1 text-xs">{c}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {regionJourneys.length > 0 && (
        <section className="bg-secondary/40 py-20">
          <div className="container-lux">
            <SectionHeading eyebrow="Featured" title={`Journeys in ${region.name}`} align="center" />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {regionJourneys.map((j) => <JourneyCard key={j.slug} journey={j} />)}
            </div>
          </div>
        </section>
      )}

      <section className="container-lux py-20 text-center">
        <SectionHeading eyebrow="Ready to travel" title="Speak with a specialist" align="center" />
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/contact"><Button variant="gold" size="lg">Enquire Now</Button></Link>
          <Link to="/trip-builder"><Button variant="outline-ink" size="lg">Design Bespoke</Button></Link>
        </div>
      </section>
    </main>
  );
}
