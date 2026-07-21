import { createFileRoute, Link } from "@tanstack/react-router";
import { ComparisonTable } from "@/components/enterprise";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/membership/tiers")({
  head: () => ({
    meta: [
      { title: "Membership Tiers | Worldway Luxe" },
      { name: "description", content: "Compare Signature, Global and Circle memberships — annual dues, concierge hours, upgrades and members-only journeys." },
      { property: "og:title", content: "Membership Tiers | Worldway Luxe" },
    ],
    links: [{ rel: "canonical", href: "/membership/tiers" }],
  }),
  component: Tiers,
});

function Tiers() {
  return (
    <main className="pt-24">
      <section className="container-lux py-14 text-center">
        <p className="eyebrow mb-3">Three tiers · one Circle</p>
        <h1 className="font-serif text-5xl md:text-6xl">Choose your Worldway</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Every tier includes 24/7 concierge, preferential rates and members-only allocations. Higher tiers unlock deeper access, priority upgrades and members-only journeys.</p>
      </section>

      <section className="container-lux pb-14">
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            { name: "Signature", price: "$2,500 / yr", features: ["24/7 concierge", "Preferred hotel rates", "VIP amenities at 800+ properties"], variant: "outline-ink" as const },
            { name: "Global", price: "$7,500 / yr", features: ["Everything in Signature", "Guaranteed room upgrades", "Priority departures", "Named specialist"], variant: "gold" as const, highlight: true },
            { name: "Circle", price: "By invitation", features: ["Everything in Global", "Members-only journeys", "Private-jet allocations", "Personal head of membership"], variant: "outline-ink" as const },
          ].map((t) => (
            <div key={t.name} className={`rounded-sm border p-8 shadow-soft ${t.highlight ? "border-gold bg-card" : "border-border bg-card"}`}>
              {t.highlight && <p className="eyebrow text-gold">Most popular</p>}
              <h2 className="mt-1 font-serif text-3xl">{t.name}</h2>
              <p className="mt-2 font-serif text-2xl">{t.price}</p>
              <ul className="mt-6 space-y-2 text-sm">
                {t.features.map((f) => <li key={f} className="border-l-2 border-gold pl-3">{f}</li>)}
              </ul>
              <Link to="/membership/join" className="mt-8 block"><Button variant={t.variant} className="w-full">Apply</Button></Link>
            </div>
          ))}
        </div>
      </section>

      <section className="container-lux pb-20">
        <p className="eyebrow mb-4">Detailed comparison</p>
        <ComparisonTable
          columns={[
            { key: "s", label: "Signature" },
            { key: "g", label: "Global", highlight: true },
            { key: "c", label: "Circle" },
          ]}
          rows={[
            { label: "Concierge hours", values: ["Business hours", "24/7", "24/7 dedicated"] },
            { label: "Named specialist", values: [false, true, true] },
            { label: "Preferred hotel rates", values: [true, true, true] },
            { label: "Guaranteed upgrades", values: [false, true, true] },
            { label: "Members-only journeys", values: [false, false, true] },
            { label: "Private-jet allocations", values: [false, false, true] },
            { label: "Companion pass", values: [false, "1 / year", "Unlimited"] },
            { label: "Annual dues", values: ["$2,500", "$7,500", "By invitation"] },
          ]}
        />
      </section>
    </main>
  );
}
