import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { ContentHero } from "@/components/content-page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Centre — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Answers on bookings, changes and cancellations, payments and wallet, membership tiers, documents and the AI Concierge.",
      },
      { property: "og:title", content: "Worldway Help Centre" },
      {
        property: "og:description",
        content: "Answers on bookings, changes, payments, membership and the AI Concierge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

const SECTIONS: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: "Bookings",
    items: [
      {
        q: "Where do I find my bookings?",
        a: "Every confirmed booking appears under Account → Bookings, with the supplier reference, travel dates and current status.",
      },
      {
        q: "Why does a search sometimes return no results?",
        a: "All inventory is queried live from suppliers. When a supplier has no availability for your dates or is temporarily unreachable, we show that plainly instead of displaying illustrative fares.",
      },
      {
        q: "Can I change or cancel a booking?",
        a: "Change and cancellation rules are set by each supplier and are shown before you confirm. Send a change request from Account → Bookings or contact the concierge desk.",
      },
    ],
  },
  {
    group: "Payments & wallet",
    items: [
      {
        q: "How does the Worldway wallet work?",
        a: "Your wallet holds a prepaid balance you can top up by card or PayPal and apply to eligible bookings. Balances and transactions are visible under Wallet.",
      },
      {
        q: "Which payment methods are accepted?",
        a: "Major credit and debit cards, PayPal, and wallet balance. Corporate accounts can be invoiced through the corporate portal.",
      },
    ],
  },
  {
    group: "Membership",
    items: [
      {
        q: "What do membership tiers include?",
        a: "Traveler is free. Travel Plus and Elite add member pricing, priority support and expanded concierge access. Enterprise covers corporate programmes.",
      },
      {
        q: "How do I upgrade?",
        a: "Open the Membership page and choose a plan; upgrades are confirmed by the concierge desk and applied to your account server-side.",
      },
    ],
  },
  {
    group: "AI Concierge",
    items: [
      {
        q: "What can the concierge do?",
        a: "It searches live inventory, drafts itineraries, answers destination and policy questions, and hands off to a human specialist when needed.",
      },
      {
        q: "Is the concierge available to all members?",
        a: "Yes — every signed-in member can use the AI Concierge.",
      },
    ],
  },
];

function HelpPage() {
  return (
    <PageShell>
      <ContentHero
        eyebrow="Help centre"
        title="Answers, without the hold music."
        subtitle="The questions our desk answers most. If yours isn't here, the concierge desk replies within two hours."
      />
      <div className="mx-auto max-w-3xl space-y-10 px-6 py-16">
        {SECTIONS.map((s) => (
          <section key={s.group}>
            <h2 className="mb-3 text-[11px] uppercase tracking-[0.3em] text-primary">{s.group}</h2>
            <Accordion
              type="single"
              collapsible
              className="rounded-xl border border-border/60 bg-card/50 px-4"
            >
              {s.items.map((it) => (
                <AccordionItem key={it.q} value={it.q}>
                  <AccordionTrigger className="text-left text-sm">{it.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {it.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
        <p className="text-sm text-muted-foreground">
          Still stuck?{" "}
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
            Contact the concierge desk
          </Link>
          .
        </p>
      </div>
    </PageShell>
  );
}
