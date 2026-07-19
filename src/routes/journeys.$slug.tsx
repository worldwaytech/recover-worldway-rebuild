import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { journeys, formatPrice, formatJourneyTitle } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { AvailabilityBadge, SectionHeading } from "@/components/site";
import { Clock, MapPin, Users } from "lucide-react";

export const Route = createFileRoute("/journeys/$slug")({
  loader: ({ params }) => {
    const journey = journeys.find((j) => j.slug === params.slug);
    if (!journey) throw notFound();
    return { journey };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Not found" }, { name: "robots", content: "noindex" }] };
    const j = loaderData.journey;
    const title = formatJourneyTitle(j.slug, j.title);
    return {
      meta: [
        { title: `${title} | Worldway Luxe` },
        { name: "description", content: j.overview.slice(0, 155) },
        { property: "og:title", content: `${title} | Worldway Luxe` },
        { property: "og:description", content: j.overview.slice(0, 155) },
        { property: "og:image", content: j.image },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `/journeys/${j.slug}` },
      ],
      links: [{ rel: "canonical", href: `/journeys/${j.slug}` }],
    };
  },
  component: JourneyDetail,
});

function JourneyDetail() {
  const { journey: j } = Route.useLoaderData();
  const title = formatJourneyTitle(j.slug, j.title);

  return (
    <main>
      <section className="relative h-[70vh] min-h-[500px] overflow-hidden">
        <img src={j.image} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/20 to-ink/80" />
        <div className="container-lux relative z-10 flex h-full flex-col items-start justify-end pb-16 text-primary-foreground">
          <AvailabilityBadge status={j.availability} />
          <h1 className="mt-4 font-serif text-5xl md:text-6xl">{title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-6 text-sm text-primary-foreground/80">
            <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {j.destination}</span>
            <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> {j.duration} days</span>
            <span className="flex items-center gap-2"><Users className="h-4 w-4" /> {j.style.join(", ")}</span>
            <span className="font-medium text-gold">{formatPrice(j.priceFrom)}</span>
          </div>
        </div>
      </section>

      <section className="container-lux py-16">
        <div className="grid gap-12 lg:grid-cols-[2fr_1fr]">
          <div>
            <SectionHeading eyebrow="Overview" title="The journey" />
            <p className="mt-6 text-muted-foreground leading-relaxed">{j.overview}</p>

            <h3 className="mt-12 font-serif text-2xl">Highlights</h3>
            <ul className="mt-4 space-y-2">
              {j.highlights.map((h: string) => (
                <li key={h} className="border-l-2 border-gold pl-4 text-sm">{h}</li>
              ))}
            </ul>

            <h3 className="mt-12 font-serif text-2xl">Signature Accommodation</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {j.accommodations.map((a: string) => <li key={a}>· {a}</li>)}
            </ul>
          </div>

          <aside className="rounded-sm border border-border bg-card p-6 shadow-soft h-fit lg:sticky lg:top-28">
            <p className="eyebrow mb-3">Departures</p>
            <ul className="space-y-1 text-sm">
              {j.departures.map((d: string) => <li key={d}>{d}</li>)}
            </ul>
            <div className="mt-6 border-t border-border pt-6">
              <p className="text-2xl font-serif">{formatPrice(j.priceFrom)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Excludes international flights.</p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Link to="/contact"><Button variant="gold" className="w-full">Enquire</Button></Link>
              <Link to="/trip-builder"><Button variant="outline-ink" className="w-full">Customise</Button></Link>
            </div>
            <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
              <p><strong>Includes:</strong> {j.inclusions.join(", ")}</p>
              <p><strong>Excludes:</strong> {j.exclusions.join(", ")}</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
