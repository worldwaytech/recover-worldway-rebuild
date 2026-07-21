import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { TrustIndicators, Testimonials, CTASection } from "@/components/enterprise";

export const Route = createFileRoute("/membership/")({
  head: () => ({
    meta: [
      { title: "Worldway Luxe Membership | Private Access" },
      { name: "description", content: "Private-access membership — global concierge, priority allocations and members-only journeys." },
    ],
    links: [{ rel: "canonical", href: "/membership" }],
  }),
  component: MembershipLanding,
});

function MembershipLanding() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16 text-center">
        <p className="eyebrow mb-4">By invitation & application</p>
        <h1 className="font-serif text-5xl md:text-7xl">The Worldway Circle</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          A private membership for the discerning traveller — global concierge, priority allocations at the
          world's most sought-after properties, and members-only journeys.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/membership/tiers"><Button variant="gold" size="lg">Compare tiers</Button></Link>
          <Link to="/membership/benefits"><Button variant="outline-ink" size="lg">Explore benefits</Button></Link>
        </div>
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
      </section>

      <section className="container-lux pb-20"><TrustIndicators /></section>

      <section className="container-lux pb-20">
        <Testimonials quotes={[
          { quote: "Worldway rebooked our Antarctica departure from a storm in twelve hours — flawlessly.", author: "Ms. R.", role: "Circle member since 2022", rating: 5 },
          { quote: "The suite upgrade at Amanpuri alone paid the annual dues.", author: "Mr. K.", role: "Signature member", rating: 5 },
          { quote: "Our specialist knew the general manager by name in every city.", author: "The A. family", role: "Global member", rating: 5 },
        ]} />
      </section>

      <section className="container-lux pb-20">
        <CTASection title="Apply to the Worldway Circle" intro="Membership is by invitation and application. Speak with our head of membership today." primaryTo="/membership/join" primaryLabel="Request an invitation" secondaryTo="/membership/tiers" secondaryLabel="Compare tiers" />
      </section>
    </main>
  );
}
