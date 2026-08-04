import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, PageHero } from "@/components/search-shell";
import { AIRCRAFT, AIRCRAFT_IMAGE_FALLBACK, CATEGORIES } from "@/lib/empty-legs-data";

export const Route = createFileRoute("/aircraft")({
  head: () => ({
    meta: [
      { title: "Aircraft Catalogue — Worldway Private Aviation" },
      {
        name: "description",
        content:
          "Explore the fleet: Gulfstream, Bombardier, Dassault Falcon, Embraer, Cessna Citation, HondaJet, Pilatus, Airbus & Boeing VIP airliners.",
      },
      { property: "og:title", content: "Aircraft Catalogue — Worldway Private Aviation" },
      {
        property: "og:description",
        content: "Specifications, seating and range for the world's finest business jets.",
      },
      {
        property: "og:image",
        content:
          "https://images.unsplash.com/photo-1583500178690-f7fd39c69217?auto=format&fit=crop&w=1600&q=80",
      },
    ],
  }),
  component: AircraftCatalogue,
});

function AircraftCatalogue() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All Aircraft");
  const list = AIRCRAFT.filter((a) => category === "All Aircraft" || a.category === category);

  return (
    <PageShell>
      <PageHero
        eyebrow="Aircraft Catalogue"
        title="A fleet built for anywhere."
        subtitle="From nimble very-light jets to VIP-configured airliners — each aircraft is chartered through vetted operators worldwide."
        image="https://images.unsplash.com/photo-1583500178690-f7fd39c69217?auto=format&fit=crop&w=2000&q=80"
      />

      <section className="mx-auto -mt-16 max-w-6xl px-6">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-xl backdrop-blur-xl">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.25em] transition-colors ${
                  c === category
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-primary"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <article
              key={a.slug}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70"
            >
              <div className="aspect-[16/10] overflow-hidden">
                <img
                  src={a.image}
                  alt={a.name}
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src !== AIRCRAFT_IMAGE_FALLBACK) img.src = AIRCRAFT_IMAGE_FALLBACK;
                  }}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                  {a.category}
                </div>
                <div className="mt-2 font-serif text-2xl leading-tight">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.manufacturer}</div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Spec label="Seats" value={`${a.seats}`} />
                  <Spec label="Range" value={`${a.rangeNm.toLocaleString()} nm`} />
                  <Spec label="Cruise" value={`${a.cruiseKt} kt`} />
                  <Spec label="Cabin height" value={`${a.cabinHeightFt} ft`} />
                  <Spec label="Baggage" value={`${a.baggageCuFt} cu ft`} />
                </dl>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {a.amenities.map((am) => (
                    <span
                      key={am}
                      className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[10px] text-muted-foreground"
                    >
                      {am}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex gap-2">
                  <Link
                    to="/private-aviation/empty-legs"
                    className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-[11px] uppercase tracking-[0.25em] text-primary-foreground hover:opacity-90"
                  >
                    See empty legs
                  </Link>
                  <Link
                    to="/private-jets"
                    className="flex-1 rounded-full border border-primary/50 px-4 py-2 text-center text-[11px] uppercase tracking-[0.25em] text-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    Request quote
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
