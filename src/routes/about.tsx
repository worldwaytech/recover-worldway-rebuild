import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";
import { images } from "@/lib/data";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Worldway Luxe | A Partner with A&K" },
      { name: "description", content: "Worldway Luxe is a luxury travel house designing tailor-made journeys worldwide, a Partner with A&K since 1997." },
      { property: "og:title", content: "About Worldway Luxe" },
      { property: "og:description", content: "A luxury travel house, Partner with A&K." },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: About,
});

function About() {
  return (
    <main>
      <section className="relative h-[60vh] min-h-[420px] overflow-hidden">
        <img src={images.hero} alt="Worldway Luxe" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 to-ink/70" />
        <div className="container-lux relative z-10 flex h-full flex-col items-center justify-center text-center text-primary-foreground">
          <p className="eyebrow mb-4 text-primary-foreground/80">About us</p>
          <h1 className="font-serif text-5xl md:text-7xl">A Life of Extraordinary Journeys</h1>
        </div>
      </section>

      <section className="container-lux py-20">
        <div className="mx-auto max-w-3xl">
          <SectionHeading eyebrow="Our story" title="Since 1997, a partnership with the extraordinary" />
          <div className="mt-8 space-y-6 text-lg leading-relaxed text-muted-foreground">
            <p>
              Worldway Luxe was founded on a simple belief: that the very finest travel is a conversation
              between a traveller's imagination and a specialist's craft. Over more than two decades, we have
              built enduring partnerships with the world's most respected hotels, expedition operators, private
              guides and drivers — the people who transform a good journey into an unforgettable one.
            </p>
            <p>
              Today, as a Partner with A&amp;K, we bring together the intimacy of a specialist travel house with
              the reach and infrastructure of one of the most respected names in luxury travel. Our clients enjoy
              unrivalled access, seamless logistics and true on-the-ground care across every continent.
            </p>
            <p>
              Every itinerary is designed by hand, by a specialist who has walked the ground, tasted the food and
              met the people. Nothing is left to chance. From the first briefing to the final farewell, we are with
              you — quietly, precisely, and always one step ahead.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-secondary/40 py-20">
        <div className="container-lux grid gap-8 md:grid-cols-4">
          {[
            { n: "25+", l: "Years designing journeys" },
            { n: "100+", l: "Countries covered" },
            { n: "5★", l: "Forbes Travel Guide Award" },
            { n: "24/7", l: "Concierge support" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <p className="font-serif text-5xl text-gold">{s.n}</p>
              <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-lux py-20 text-center">
        <SectionHeading eyebrow="Speak with us" title="Begin your journey" align="center" />
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/contact"><Button variant="gold" size="lg">Contact a Specialist</Button></Link>
          <Link to="/journeys"><Button variant="outline-ink" size="lg">Browse Journeys</Button></Link>
        </div>
      </section>
    </main>
  );
}
