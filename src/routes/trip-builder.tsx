import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/trip-builder")({
  head: () => ({
    meta: [
      { title: "Bespoke Trip Builder | Worldway Luxe" },
      { name: "description", content: "Craft your own extraordinary journey with our AI-assisted bespoke trip planner and specialist review." },
      { property: "og:title", content: "Bespoke Trip Builder | Worldway Luxe" },
      { property: "og:url", content: "/trip-builder" },
    ],
    links: [{ rel: "canonical", href: "/trip-builder" }],
  }),
  component: TripBuilder,
});

function TripBuilder() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16 text-center">
        <p className="eyebrow mb-4">Bespoke</p>
        <h1 className="font-serif text-5xl md:text-7xl">Design Your Journey</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Our trip builder pairs AI-assisted itinerary drafting with a Worldway specialist's craft to
          shape a journey uniquely yours.
        </p>
        <div className="mt-8">
          <Link to="/contact"><Button variant="gold" size="lg">Begin with a Specialist</Button></Link>
        </div>
      </section>

      <section className="container-lux pb-20">
        <div className="mx-auto max-w-2xl rounded-sm border border-border bg-card p-12 text-center shadow-soft">
          <p className="eyebrow mb-3">Coming online with Cloud</p>
          <h2 className="font-serif text-3xl">Interactive Planner</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            The full AI-assisted trip planner — with live pricing, availability and instant specialist
            review — activates once Lovable Cloud is enabled on this project. Until then, our
            specialists will craft your itinerary personally.
          </p>
        </div>
      </section>
    </main>
  );
}
