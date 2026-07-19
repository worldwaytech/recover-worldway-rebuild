import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";

const faqs = [
  { q: "How do I plan a journey with Worldway Luxe?", a: "Share your dates, destinations and interests via our enquiry form or call us — a specialist will craft a proposal within one business day." },
  { q: "Can you arrange fully private journeys?", a: "Yes. Every itinerary is designed uniquely for you, with private guides, transfers and accommodation throughout." },
  { q: "Do you offer group departures?", a: "We offer intimate small-group journeys as well as fully private and tailor-made experiences." },
  { q: "Is my booking financially protected?", a: "Yes — all Worldway Luxe bookings carry full financial protection under industry-standard schemes." },
  { q: "What if I need help during my journey?", a: "You'll have 24/7 access to a dedicated specialist and local concierge support at every stop." },
];

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Center | Worldway Luxe" },
      { name: "description", content: "Answers to common questions about planning, booking and travelling with Worldway Luxe." },
      { property: "og:url", content: "/help" },
    ],
    links: [{ rel: "canonical", href: "/help" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }),
    }],
  }),
  component: Help,
});

function Help() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <SectionHeading eyebrow="Help" title="How can we help?" intro="Common questions about planning, booking and travelling with Worldway Luxe." />
        <div className="mt-12 space-y-6">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-sm border border-border bg-card p-6 shadow-soft">
              <h3 className="font-serif text-xl">{f.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link to="/contact"><Button variant="gold" size="lg">Contact a Specialist</Button></Link>
        </div>
      </section>
    </main>
  );
}
