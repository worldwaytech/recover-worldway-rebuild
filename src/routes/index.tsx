import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Worldway Travels Group — Bespoke Luxury Travel" },
      { name: "description", content: "Private jets, five-star residences, curated activities, and a 24/7 AI concierge." },
      { property: "og:title", content: "Worldway Travels Group — Bespoke Luxury Travel" },
      { property: "og:description", content: "Private jets, five-star residences, curated activities, and a 24/7 AI concierge." },
      { property: "og:image", content: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=80" },
    ],
  }),
  component: Home,
});

const TILES = [
  { to: "/flights", label: "Flights", img: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80" },
  { to: "/hotels", label: "Hotels", img: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1200&q=80" },
  { to: "/activities", label: "Activities", img: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80" },
  { to: "/transfers", label: "Transfers", img: "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1200&q=80" },
  { to: "/trip-builder", label: "Trip Builder", img: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80" },
  { to: "/buses", label: "Coach & Bus", img: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80" },
  { to: "/private-jets", label: "Private Jets", img: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=80" },
  { to: "/concierge", label: "AI Concierge", img: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80" },
] as const;

function Home() {
  return (
    <PageShell>
      <section className="relative min-h-[92vh] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=2000&q=90)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />
        <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-end px-6 pb-20 pt-32">
          <div className="text-xs uppercase tracking-[0.5em] text-primary">Worldway Travels Group</div>
          <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.05] text-foreground md:text-7xl">
            The world, arranged in a single, quiet gesture.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Private aviation, ocean-view residences, and curated experiences — orchestrated by a 24/7 concierge, human and AI.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/trip-builder" className="rounded-full bg-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground">
              Build a Journey
            </Link>
            <Link to="/concierge" className="rounded-full border border-primary/40 px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary hover:bg-primary hover:text-primary-foreground">
              Ask the Concierge
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-primary">The Atelier</div>
            <h2 className="mt-2 font-serif text-4xl text-foreground md:text-5xl">Eight ways to travel exquisitely.</h2>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <Link key={t.to} to={t.to} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-border/60">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url(${mediaUrl(t.img)})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-primary">Discover</div>
                <div className="mt-1 font-serif text-2xl text-foreground">{t.label}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
