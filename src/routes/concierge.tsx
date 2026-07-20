import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";

// TODO(Lovable Cloud): AI Concierge streams from Lovable AI Gateway
// (google/gemini-2.5-flash) with a system prompt hydrated from user profile,
// booking context and CRM history. This shell demonstrates the UI surface.

export const Route = createFileRoute("/concierge")({
  head: () => ({
    meta: [
      { title: "AI Concierge | Worldway Luxe" },
      { name: "description", content: "Speak with the Worldway AI Concierge — instant answers, itinerary drafts and booking support around the clock." },
    ],
    links: [{ rel: "canonical", href: "https://recover-worldway-rebuild.lovable.app/concierge" }],
  }),
  component: Concierge,
});

function Concierge() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <p className="eyebrow text-gold">Powered by Worldway Intelligence</p>
        <h1 className="mt-3 font-serif text-5xl md:text-6xl">AI Concierge</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          The Worldway AI Concierge drafts itineraries, answers destination questions and hands off seamlessly to a
          human specialist when you're ready to book.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_2fr]">
          <aside className="rounded-sm border border-border bg-card p-6 shadow-soft">
            <p className="eyebrow mb-3">Try asking</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>"Two weeks in Japan for cherry blossom, family of four"</li>
              <li>"Antarctica in December — fly-cruise vs Drake?"</li>
              <li>"Anniversary trip to the Maldives, 10 nights, all-villa"</li>
              <li>"Private jet expedition January to March"</li>
            </ul>
          </aside>
          <div className="rounded-sm border border-border bg-card p-6 shadow-soft min-h-[420px] flex flex-col">
            <div className="flex-1 space-y-3 text-sm">
              <div className="rounded-sm bg-sand/60 p-3">Hello — I'm the Worldway AI Concierge. Where in the world are you dreaming of?</div>
              <div className="rounded-sm border border-dashed border-border p-3 text-muted-foreground">
                TODO(Lovable Cloud): connect to Lovable AI Gateway streaming endpoint. Enable Cloud to activate live conversation.
              </div>
            </div>
            <form className="mt-4 flex gap-2">
              <input disabled placeholder="Enable Lovable Cloud to chat…" className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm" />
              <Button variant="gold" disabled>Send</Button>
            </form>
          </div>
        </div>
        <div className="mt-8 flex gap-3">
          <Link to="/contact"><Button variant="outline-ink">Prefer a human?</Button></Link>
          <Link to="/trip-builder"><Button variant="gold">Open trip builder</Button></Link>
        </div>
      </section>
    </main>
  );
}
