import { createFileRoute } from "@tanstack/react-router";
import { CTASection } from "@/components/enterprise";
import { Award, Sparkles, Plane, Hotel, Utensils, Compass } from "lucide-react";

const benefits = [
  { icon: Hotel, title: "Hotel benefits", text: "Room upgrades, complimentary breakfast, resort credits, priority late check-out at 800+ hand-picked properties." },
  { icon: Plane, title: "Aviation", text: "Priority private-jet allocations, first-class fare optimisation and lounge access worldwide." },
  { icon: Utensils, title: "Dining & experiences", text: "Members-only tables at Michelin-starred restaurants and rare access to festivals, ateliers and estates." },
  { icon: Compass, title: "Discovery", text: "Signature journeys curated only for members — no publicly listed departures." },
  { icon: Sparkles, title: "Concierge", text: "24/7 travel and lifestyle desk speaking twelve languages, anywhere in the world." },
  { icon: Award, title: "Recognition", text: "VIP recognition across our partner network — arrivals, amenities and small kindnesses that add up." },
];

export const Route = createFileRoute("/membership/benefits")({
  head: () => ({
    meta: [
      { title: "Membership Benefits | Worldway Luxe" },
      { name: "description", content: "Complete benefits catalogue — hotel upgrades, aviation, dining, discovery and 24/7 concierge for Worldway members." },
    ],
    links: [{ rel: "canonical", href: "/membership/benefits" }],
  }),
  component: () => (
    <main className="pt-24">
      <section className="container-lux py-14 text-center">
        <p className="eyebrow mb-3">Members benefits</p>
        <h1 className="font-serif text-5xl md:text-6xl">Every detail, elevated</h1>
      </section>
      <section className="container-lux pb-14">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div key={b.title} className="rounded-sm border border-border bg-card p-6 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-gold/15 text-gold"><b.icon className="h-5 w-5" /></div>
              <h3 className="mt-4 font-serif text-xl">{b.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{b.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="container-lux pb-20">
        <CTASection title="Request an invitation" intro="Speak with the head of membership to explore whether the Circle is the right fit." primaryTo="/membership/join" primaryLabel="Apply now" secondaryTo="/membership/tiers" secondaryLabel="Compare tiers" />
      </section>
    </main>
  ),
});
