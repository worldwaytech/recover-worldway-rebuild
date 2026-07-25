import { createFileRoute, Link } from "@tanstack/react-router";
import { regions, categories, journeys, testimonials, images } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { JourneyCard, SectionHeading, StarRow } from "@/components/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Worldway Luxe | Extraordinary Luxury Journeys Worldwide" },
      {
        name: "description",
        content:
          "Tailor-made luxury travel, private journeys, small group departures, expedition cruises and private jet experiences. Worldway Luxe is a Partner with A&K.",
      },
      { property: "og:title", content: "Worldway Luxe | Extraordinary Luxury Journeys Worldwide" },
      {
        property: "og:description",
        content:
          "Tailor-made luxury travel, private journeys, small group departures, expedition cruises and private jet experiences. Worldway Luxe is a Partner with A&K.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
    ],
    links: [
      { rel: "canonical", href: "/" },
      { rel: "preload", as: "image", href: images.hero, fetchPriority: "high" },
    ],
  }),
  component: Home,
});

function Home() {
  const featured = journeys.filter((j) => j.featured);

  return (
    <main>
      {/* HERO */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <img
          src={images.hero}
          alt="Luxury safari at golden hour"
          width={1920}
          height={1080}
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover animate-slow-zoom"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/55 via-ink/25 to-ink/75" />
        <div className="container-lux relative z-10 text-center text-primary-foreground">
          <p className="mb-5 animate-fade-up text-[11px] font-medium uppercase tracking-[0.5em] text-primary-foreground/70">
            Worldway Luxe · Partner with A&amp;K
          </p>
          <h1 className="mx-auto max-w-4xl animate-fade-up font-serif text-5xl font-light leading-[1.05] tracking-tight md:text-7xl">
            Extraordinary journeys <span className="italic">across the world</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg font-light tracking-wide text-primary-foreground/80">
            Unrivalled access to the planet's most secluded wonders — tailored for the discerning
            traveller.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/journeys">
              <Button variant="gold" size="lg" className="rounded-full px-10 py-6">
                Explore Journeys
              </Button>
            </Link>
            <Link to="/trip-builder">
              <Button variant="hero" size="lg" className="rounded-full px-10 py-6">
                Design Bespoke
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6">
            <div className="h-px w-8 bg-white/20" />
            <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-primary-foreground/70">
              Forbes Travel Guide · Five-Star Award Winner
            </span>
            <div className="h-px w-8 bg-white/20" />
          </div>
        </div>
      </section>

      {/* FEATURED DESTINATIONS */}
      <section className="container-lux py-24">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Where to next"
            title="Featured Destinations"
            intro="Six continents of wonder, curated by specialists who know them intimately."
          />
          <Link
            to="/destinations"
            className="hidden shrink-0 text-sm uppercase tracking-widest text-gold md:block"
          >
            All destinations →
          </Link>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {regions.map((r) => (
            <Link
              key={r.slug}
              to="/destinations/$slug"
              params={{ slug: r.slug }}
              className="group relative aspect-[4/5] overflow-hidden rounded-sm"
            >
              <img
                src={r.image}
                alt={`${r.name} luxury destination`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-primary-foreground">
                <h3 className="font-serif text-3xl">{r.name}</h3>
                <p className="mt-1 text-sm text-primary-foreground/80 line-clamp-2">{r.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURED JOURNEYS */}
      <section className="bg-secondary/40 py-24">
        <div className="container-lux">
          <SectionHeading
            eyebrow="Signature collection"
            title="Featured Journeys"
            intro="A selection of our most extraordinary itineraries, ready to inspire."
            align="center"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 6).map((j) => (
              <JourneyCard key={j.slug} journey={j} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/journeys">
              <Button variant="outline-ink" size="lg">
                View All Journeys
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="container-lux py-24">
        <SectionHeading eyebrow="Ways to travel" title="Journey Categories" align="center" />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {categories.slice(1, 5).map((c) => (
            <Link
              key={c.slug}
              to="/journeys"
              className="group overflow-hidden rounded-sm border border-border bg-card"
            >
              <div className="aspect-[3/2] overflow-hidden">
                <img
                  src={c.image}
                  alt={`${c.name} luxury travel experiences`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="font-serif text-xl group-hover:text-gold">{c.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* JET / CRUISE SPLIT */}
      <section className="bg-primary text-primary-foreground">
        <div className="grid lg:grid-cols-2">
          <div className="relative min-h-[400px]">
            <img
              src={images.jet}
              alt="Private jet journeys"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-col justify-center gap-5 px-8 py-16 md:px-16">
            <p className="eyebrow">By private jet</p>
            <h2 className="font-serif text-4xl md:text-5xl">Circle the globe in privacy</h2>
            <p className="text-primary-foreground/75">
              Fully chartered private jet journeys to the world's most extraordinary places, with
              expert guides and the finest hotels at every stop.
            </p>
            <div>
              <Link to="/journeys">
                <Button variant="gold" size="lg">
                  Explore Private Jet Journeys
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="grid lg:grid-cols-2">
          <div className="order-2 flex flex-col justify-center gap-5 px-8 py-16 md:px-16 lg:order-1">
            <p className="eyebrow">By small ship</p>
            <h2 className="font-serif text-4xl md:text-5xl">
              Expedition cruises to the edges of the map
            </h2>
            <p className="text-primary-foreground/75">
              Intimate voyages to remote coastlines and polar frontiers, with expert naturalists and
              genuine comfort aboard.
            </p>
            <div>
              <Link to="/journeys">
                <Button variant="gold" size="lg">
                  Explore Expedition Cruises
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative order-1 min-h-[400px] lg:order-2">
            <img
              src={images.cruise}
              alt="Expedition cruises"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* WHY WORLDWAY */}
      <section className="container-lux py-24">
        <SectionHeading eyebrow="The Worldway difference" title="Why travel with us" align="center" />
        <div className="mx-auto mt-12 grid max-w-5xl gap-10 md:grid-cols-3">
          {[
            { t: "Crafted by specialists", d: "Every journey is designed by destination experts who travel the world so they can perfect yours." },
            { t: "Effortless from end to end", d: "Private guides, seamless transfers and 24/7 concierge support — every detail anticipated." },
            { t: "Access without equal", d: "Doors that open only for us: private viewings, after-hours access and the finest accommodation." },
          ].map((f) => (
            <div key={f.t} className="text-center">
              <h3 className="font-serif text-2xl">{f.t}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PARTNER */}
      <section className="bg-secondary/50 py-20">
        <div className="container-lux max-w-3xl text-center">
          <p className="eyebrow mb-4">Trusted partnership</p>
          <h2 className="font-serif text-4xl md:text-5xl">Worldway Luxe is a Partner with A&amp;K</h2>
          <p className="mt-5 text-muted-foreground">
            Our partnership with A&amp;K unites Worldway Luxe with one of the most respected names in
            luxury travel — bringing you unrivalled access, expertise and on-the-ground care across
            every continent.
          </p>
          <div className="mt-8">
            <Link to="/about">
              <Button variant="outline-ink" size="lg">
                Discover Our Story
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="container-lux py-24">
        <SectionHeading eyebrow="In their words" title="Stories from our travellers" align="center" />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {testimonials.map((t) => (
            <figure key={t.name} className="rounded-sm border border-border bg-card p-8 shadow-soft">
              <StarRow rating={t.rating} />
              <blockquote className="mt-4 font-serif text-xl leading-relaxed">"{t.quote}"</blockquote>
              <figcaption className="mt-5 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground"> · {t.trip}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
