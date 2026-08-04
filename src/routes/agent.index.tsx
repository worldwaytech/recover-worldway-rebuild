import { createFileRoute } from "@tanstack/react-router";
import { PortalCard, StatTile } from "@/components/portal-shell";
import { Plane, Route as RouteIcon, PlaneTakeoff } from "lucide-react";

export const Route = createFileRoute("/agent/")({
  head: () => ({
    meta: [
      { title: "Agent Portal — Worldway" },
      { name: "description", content: "Travel agent workspace for bookings and commissions." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Agent Portal — Worldway" },
      {
        property: "og:description",
        content: "Travel agent workspace for bookings and commissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentHome,
});

function AgentHome() {
  const stats = [
    { l: "Open quotes", v: "12" },
    { l: "MTD commission", v: "$8,420" },
    { l: "Confirmed trips", v: "27" },
  ];
  const tiles = [
    {
      t: "Quote a flight",
      d: "Live fares · agent net rates.",
      to: "/flights",
      i: <Plane className="h-5 w-5" />,
    },
    {
      t: "Build a trip",
      d: "Multi-city itinerary quoter.",
      to: "/trip-builder",
      i: <RouteIcon className="h-5 w-5" />,
    },
    {
      t: "Private jets",
      d: "On-demand charter quotes.",
      to: "/private-jets",
      i: <PlaneTakeoff className="h-5 w-5" />,
    },
  ];
  return (
    <div className="space-y-10">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Agent portal</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Dashboard</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <StatTile key={s.l} label={s.l} value={s.v} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((c) => (
          <PortalCard key={c.to} title={c.t} description={c.d} to={c.to} icon={c.i} />
        ))}
      </div>
    </div>
  );
}
