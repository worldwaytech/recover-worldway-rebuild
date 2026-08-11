import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageShell, PageHero } from "@/components/search-shell";
import { portal, type MemberTier } from "@/lib/portal-store";
import { Check, Crown, Sparkles, Building2 } from "lucide-react";

export const Route = createFileRoute("/membership")({
  head: () => ({
    meta: [
      { title: "Membership — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Traveler, Travel Plus, Elite, and Enterprise memberships from Worldway Travels Group.",
      },
    ],
  }),
  component: MembershipPage,
});

type Plan = {
  id: MemberTier | "enterprise";
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  featured?: boolean;
  icon: React.ReactNode;
};

const PLANS: Plan[] = [
  {
    id: "traveler",
    name: "Traveler",
    price: "Free",
    cadence: "forever",
    tagline: "Everything you need to start.",
    icon: <Sparkles className="h-5 w-5" />,
    features: [
      "Free account & personal dashboard",
      "Booking management",
      "Wishlist & saved itineraries",
      "Book Flights, Hotels, Activities, Buses, Cruises, Rail, Transfers",
      "Unlimited search after registration",
    ],
    cta: "Start free",
  },
  {
    id: "travel_plus",
    name: "Travel Plus",
    price: "$199",
    cadence: "per year",
    tagline: "Member-only pricing & priority care.",
    icon: <Crown className="h-5 w-5" />,
    features: [
      "All Traveler benefits",
      "Member-only pricing & exclusive offers",
      "Priority customer support",
      "Personalized recommendations",
      "Exclusive travel promotions",
      "Loyalty rewards & partner benefits",
    ],
    cta: "Choose Travel Plus",
  },
  {
    id: "elite",
    name: "Elite",
    price: "$299–399",
    cadence: "per year",
    featured: true,
    tagline: "Unlimited AI. Unlimited luxury.",
    icon: <Crown className="h-5 w-5" />,
    features: [
      "All Travel Plus benefits",
      "AI Concierge access",
      "AI Trip Builder",
      "VIP luxury travel concierge",
      "Priority booking assistance",
      "Personalized itinerary planning",
      "Exclusive luxury experiences",
      "Early access to premium offers",
      "Highest-priority support",
    ],
    cta: "Upgrade to Elite",
  },
  {
    id: "elite_plus",
    name: "Elite Plus",
    price: "$599",
    cadence: "per year",
    tagline: "Unlimited AI Concierge. Zero limits.",
    icon: <Crown className="h-5 w-5" />,
    features: [
      "All Elite benefits",
      "Unlimited AI Concierge usage",
      "Unlimited AI Trip Builder",
      "Priority GPU routing for faster answers",
      "Dedicated luxury travel desk",
      "Complimentary itinerary reviews",
      "Early-access invitations & upgrades",
    ],
    cta: "Upgrade to Elite Plus",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "contact sales",
    tagline: "White-label platform & full API.",
    icon: <Building2 className="h-5 w-5" />,
    features: [
      "White-label booking platform",
      "Full API access",
      "Dedicated onboarding",
      "Technical account manager",
      "Enterprise support & SLA",
    ],
    cta: "Contact sales",
  },
];

function MembershipPage() {
  const nav = useNavigate();
  const session = portal.session();
  const { pay, busy, error: payError } = useRazorpayCheckout();

  async function choose(id: Plan["id"]) {
    if (id === "enterprise") {
      nav({ to: "/b2b" });
      return;
    }
    if (!session) {
      nav({ to: "/auth" });
      return;
    }
    if (id === "traveler") {
      nav({ to: "/account" });
      return;
    }

    const plan = MEMBERSHIP_PLANS[id];
    const result = await pay({
      purpose: "membership",
      planId: plan.id,
      currency: plan.currency,
      description: `${plan.name} membership — 1 year`,
      ...(session.email ? { email: session.email } : {}),
      reference: { module: "membership", plan: plan.id },
    });

    if (!result) return;
    toast.success(`${plan.name} membership activated. Welcome to the inner circle.`);
    nav({ to: "/account" });
  }


  return (
    <PageShell>
      <PageHero
        eyebrow="Membership"
        title="Choose how you travel."
        subtitle="From complimentary access to unlimited AI-powered luxury planning."
        image="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=2000&q=80"
      />
      <section className="mx-auto -mt-16 grid max-w-7xl gap-6 px-6 md:grid-cols-2 xl:grid-cols-5">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-xl ${
              p.featured ? "border-primary/50 bg-card/90 shadow-2xl" : "border-border/60 bg-card/70"
            }`}
            style={p.featured ? { boxShadow: "var(--shadow-glow)" } : undefined}
          >
            {p.featured ? (
              <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-primary-foreground">
                Most popular
              </span>
            ) : null}
            <div className="flex items-center gap-2 text-primary">
              {p.icon}
              <span className="text-xs uppercase tracking-[0.25em]">{p.name}</span>
            </div>
            <div className="mt-4 font-serif text-4xl text-foreground">{p.price}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {p.cadence}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{p.tagline}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => choose(p.id)}
              className={`mt-6 w-full rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.25em] transition ${
                p.featured
                  ? "text-primary-foreground"
                  : "border border-border/60 text-foreground hover:border-primary hover:text-primary"
              }`}
              style={p.featured ? { background: "var(--gradient-gold)" } : undefined}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </section>
      <div className="mx-auto mt-10 max-w-3xl px-6 pb-24 text-center text-xs text-muted-foreground">
        Existing Enterprise, Agency, Company, HNI, UHNI, Corporate, White Label, and Partner
        memberships remain unchanged.{" "}
        <Link to="/b2b" className="text-primary">
          Learn more
        </Link>
      </div>
    </PageShell>
  );
}
