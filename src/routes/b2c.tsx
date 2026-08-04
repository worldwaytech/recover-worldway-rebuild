import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { PortalShell, PortalCard } from "@/components/portal-shell";
import {
  Plane,
  Hotel,
  Compass,
  Car,
  Route as RouteIcon,
  PlaneTakeoff,
  Sparkles,
  Wallet,
  ShieldCheck,
  HeartPulse,
  Ticket,
  Headphones,
} from "lucide-react";

export const Route = createFileRoute("/b2c")({
  head: () => ({
    meta: [
      { title: "Guest Portal — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Book flights, hotels, activities, transfers, and private jets — one wallet, one concierge, 24/7 white-glove support.",
      },
    ],
  }),
  component: B2CPortal,
});

function B2CPortal() {
  const nav = useNavigate();
  const [me, setMe] = useState<PortalUser | null>(null);
  useEffect(() => {
    const s = portal.session();
    if (!s) {
      nav({ to: "/auth" });
      return;
    }
    setMe(s);
  }, [nav]);
  if (!me) return null;

  const tiles = [
    {
      t: "Flights",
      d: "Business & first class fares.",
      to: "/flights" as const,
      i: <Plane className="h-5 w-5" />,
    },
    {
      t: "Hotels",
      d: "Five-star & private residences.",
      to: "/hotels" as const,
      i: <Hotel className="h-5 w-5" />,
    },
    {
      t: "Activities",
      d: "Curated by locals.",
      to: "/activities" as const,
      i: <Compass className="h-5 w-5" />,
    },
    {
      t: "Transfers",
      d: "Chauffeured arrivals.",
      to: "/transfers" as const,
      i: <Car className="h-5 w-5" />,
    },
    {
      t: "Trip Builder",
      d: "Design a full itinerary.",
      to: "/trip-builder" as const,
      i: <RouteIcon className="h-5 w-5" />,
    },
    {
      t: "Private Jets",
      d: "On-demand charter.",
      to: "/private-jets" as const,
      i: <PlaneTakeoff className="h-5 w-5" />,
    },
    {
      t: "AI Concierge",
      d: "24/7 assistant.",
      to: "/concierge" as const,
      i: <Sparkles className="h-5 w-5" />,
    },
    {
      t: "Wallet",
      d: "Balance & top-up.",
      to: "/wallet" as const,
      i: <Wallet className="h-5 w-5" />,
    },
  ];

  const perks = [
    { i: <Headphones className="h-4 w-4" />, t: "24/7 human + AI concierge" },
    { i: <Ticket className="h-4 w-4" />, t: "Free cancellations on refundable inventory" },
    { i: <ShieldCheck className="h-4 w-4" />, t: "Airport fast-track & lounge access" },
    { i: <Sparkles className="h-4 w-4" />, t: "Loyalty points on every booking" },
    { i: <Wallet className="h-4 w-4" />, t: "Multi-currency wallet · Razorpay & PayPal" },
    { i: <HeartPulse className="h-4 w-4" />, t: "Trip protection & medical hotline" },
  ];

  return (
    <PortalShell
      user={me}
      label="Guest · B2C"
      hero={{
        kicker: "Guest portal",
        title: `Welcome back, ${me.name.split(" ")[0]}.`,
        subtitle:
          "One wallet. One concierge. Every journey — flights, hotels, jets, and beyond — under one roof.",
        actions: (
          <Link
            to="/trip-builder"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-primary-foreground"
            style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow)" }}
          >
            Build a trip
          </Link>
        ),
      }}
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t, idx) => (
          <PortalCard
            key={t.to}
            title={t.t}
            description={t.d}
            to={t.to}
            icon={t.i}
            accent={idx === 4}
          />
        ))}
      </section>

      <section
        className="mt-14 rounded-3xl border border-border/60 bg-card/60 p-8"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">
              All-inclusive
            </div>
            <h2 className="mt-2 font-serif text-3xl text-primary">Membership perks</h2>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Included with every Worldway account, at no extra cost.
          </p>
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>
    </PortalShell>
  );
}
