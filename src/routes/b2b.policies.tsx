import { createFileRoute } from "@tanstack/react-router";
import { Plane, Hotel, Car, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/b2b/policies")({
  head: () => ({
    meta: [
      { title: "Travel Policies — Worldway" },
      { name: "description", content: "Configure corporate travel policies and approvals." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Travel Policies — Worldway" },
      { property: "og:description", content: "Configure corporate travel policies and approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Policies,
});

function Policies() {
  const policies: { t: string; d: string; i: ReactNode }[] = [
    {
      t: "Flights",
      d: "Economy up to 6h · Business over 6h · First on approval.",
      i: <Plane className="h-5 w-5" />,
    },
    {
      t: "Hotels",
      d: "Up to $450/night in Tier-1 cities · $250 elsewhere.",
      i: <Hotel className="h-5 w-5" />,
    },
    {
      t: "Ground",
      d: "Chauffeured transfer allowed on international arrivals.",
      i: <Car className="h-5 w-5" />,
    },
    {
      t: "Approval",
      d: "Trips over $5,000 require line manager approval.",
      i: <ShieldCheck className="h-5 w-5" />,
    },
  ];
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Governance</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Travel policy</h1>
        <p className="text-sm text-muted-foreground">
          Enforced at checkout across every booking channel.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {policies.map((p) => (
          <div key={p.t} className="rounded-2xl border border-border/60 bg-card/60 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                {p.i}
              </span>
              <div className="font-serif text-lg text-primary">{p.t}</div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{p.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
