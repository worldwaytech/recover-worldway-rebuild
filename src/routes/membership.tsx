import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/membership")({
  head: () => ({
    meta: [
      { title: "Worldway Luxe Membership | Private Access" },
      { name: "description", content: "Private-access membership for the discerning traveller — global concierge, priority allocations and members-only journeys." },
      { property: "og:title", content: "Worldway Luxe Membership" },
      { property: "og:url", content: "/membership" },
    ],
    links: [{ rel: "canonical", href: "/membership" }],
  }),
  component: Membership,
});

function Membership() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16 text-center">
        <p className="eyebrow mb-4">By invitation & application</p>
        <h1 className="font-serif text-5xl md:text-7xl">The Worldway Circle</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          A private membership for the discerning traveller — global concierge, priority allocations at the
          world's most sought-after properties, and members-only journeys.
        </p>
      </section>

      <section className="container-lux pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Global Concierge", d: "24/7 access to a personal travel specialist — anywhere, anytime." },
            { t: "Priority Allocations", d: "First access to soon-to-open properties and rare seasonal departures." },
            { t: "Members-Only Journeys", d: "Small-group private-jet and expedition experiences reserved for members." },
          ].map((f) => (
            <div key={f.t} className="rounded-sm border border-border bg-card p-8 shadow-soft">
              <h3 className="font-serif text-2xl">{f.t}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link to="/contact"><Button variant="gold" size="lg">Request an Invitation</Button></Link>
        </div>
      </section>
    </main>
  );
}
