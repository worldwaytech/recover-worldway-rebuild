import { createFileRoute } from "@tanstack/react-router";
import { StatTile, PortalCard } from "@/components/portal-shell";
import {
  Plane,
  Hotel,
  Route as RouteIcon,
  PlaneTakeoff,
  ShieldCheck,
  Receipt,
  Users,
  Globe2,
} from "lucide-react";

export const Route = createFileRoute("/b2b/")({
  head: () => ({
    meta: [
      { title: "Corporate Travel — Worldway" },
      { name: "description", content: "Corporate travel dashboard for your organisation." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Corporate Travel — Worldway" },
      { property: "og:description", content: "Corporate travel dashboard for your organisation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BOverview,
});

function B2BOverview() {
  const stats = [
    { l: "Active travelers", v: "42", h: "+6 vs last month" },
    { l: "MTD spend", v: "$186,420", h: "USD equivalent" },
    { l: "Open trips", v: "8", h: "3 awaiting approval" },
    { l: "Policy compliance", v: "97%", h: "Target ≥ 95%" },
  ];
  const tiles = [
    {
      t: "Flights",
      d: "Corporate fares & seat maps.",
      to: "/flights",
      i: <Plane className="h-5 w-5" />,
    },
    {
      t: "Hotels",
      d: "Negotiated corporate rates.",
      to: "/hotels",
      i: <Hotel className="h-5 w-5" />,
    },
    {
      t: "Trip Builder",
      d: "Multi-city with approval.",
      to: "/trip-builder",
      i: <RouteIcon className="h-5 w-5" />,
    },
    {
      t: "Private Jets",
      d: "On-demand executive charter.",
      to: "/private-jets",
      i: <PlaneTakeoff className="h-5 w-5" />,
    },
  ];
  const perks = [
    { i: <Users className="h-4 w-4" />, t: "Dedicated corporate account manager" },
    { i: <Receipt className="h-4 w-4" />, t: "Centralised billing · GST/VAT-ready" },
    { i: <ShieldCheck className="h-4 w-4" />, t: "Policy engine with approval workflow" },
    { i: <Globe2 className="h-4 w-4" />, t: "Duty-of-care & traveller tracking" },
  ];
  return (
    <div className="space-y-10">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">
          Corporate overview
        </div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Company travel at a glance</h1>
        <p className="text-sm text-muted-foreground">
          Live spend, compliance, and open trips across your organisation.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatTile key={s.l} label={s.l} value={s.v} hint={s.h} />
        ))}
      </div>
      <div>
        <h2 className="font-serif text-2xl text-primary">Book on behalf of</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <PortalCard key={t.to} title={t.t} description={t.d} to={t.to} icon={t.i} />
          ))}
        </div>
      </div>
      <div
        className="rounded-3xl border border-border/60 bg-card/60 p-8"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <h2 className="font-serif text-2xl text-primary">All-inclusive corporate</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {perks.map((p) => (
            <li
              key={p.t}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3 text-sm text-muted-foreground"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                {p.i}
              </span>
              {p.t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
