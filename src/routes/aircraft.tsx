import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, PageHero } from "@/components/search-shell";
import { AircraftPhoto } from "@/components/aviation/aircraft-photo";
import { AIRCRAFT_CATALOGUE, AIRCRAFT_CATEGORY_ORDER, type AircraftCategoryName } from "@/lib/aviation/aircraft-catalogue.data";

const HERO = "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80";

export const Route = createFileRoute("/aircraft")({
  head: () => ({
    meta: [
      { title: "Private Jet Aircraft Catalogue — Worldway Private Aviation" },
      { name: "description", content: "Gulfstream, Bombardier, Dassault Falcon, Embraer, Cessna Citation, Pilatus and HondaJet — sourced specifications, seating and range, with live charter pricing on request." },
      { property: "og:title", content: "Private Jet Aircraft Catalogue — Worldway" },
      { property: "og:description", content: "Sourced specifications for 31 business aircraft, each bookable through Worldway Private Aviation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AircraftCatalogue,
});

function AircraftCatalogue() {
  const [category, setCategory] = useState<AircraftCategoryName | "All">("All");
  const list = AIRCRAFT_CATALOGUE.filter((a) => category === "All" || a.category === category);
  const cats = AIRCRAFT_CATEGORY_ORDER.filter((c) => AIRCRAFT_CATALOGUE.some((a) => a.category === c));

  return (
    <PageShell>
      <PageHero eyebrow="Worldway Private Aviation · Aircraft" title="A fleet built for anywhere." subtitle="Sourced specifications for every model. Live charter pricing is requested per trip — never estimated from a brochure." image={HERO} />

      <section className="mx-auto -mt-16 max-w-6xl px-6">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-xl backdrop-blur-xl">
          {(["All", ...cats] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.25em] ${c === category ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-primary"}`}>
              {c === "All" ? "All aircraft" : c}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <article key={a.slug} className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70">
              <AircraftPhoto aircraft={a} className="aspect-[16/10]" />
              <div className="flex flex-1 flex-col p-5">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">{a.category}</div>
                <Link to="/aircraft/$slug" params={{ slug: a.slug }} className="mt-2 font-serif text-2xl leading-tight hover:text-primary">{a.name}</Link>
                <div className="text-xs text-muted-foreground">{a.manufacturer}</div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Spec label="Passengers" value={a.typicalSeating ? `${a.typicalSeating} · max ${a.maxPassengers}` : `Up to ${a.maxPassengers}`} />
                  <Spec label="Range" value={a.rangeNm ? `${a.rangeNm.toLocaleString()} nm` : "—"} />
                  <Spec label="Cruise" value={a.cruise ?? "—"} />
                  <Spec label="Price" value="On request · live quote" />
                </dl>
                <div className="mt-auto flex gap-2 pt-5">
                  <Link to="/aircraft/$slug" params={{ slug: a.slug }} className="flex-1 rounded-full border border-primary/50 px-4 py-2 text-center text-[11px] uppercase tracking-[0.25em] text-primary hover:bg-primary hover:text-primary-foreground">Details</Link>
                  <Link to="/private-jets" search={{ aircraft: a.slug }} className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-[11px] uppercase tracking-[0.25em] text-primary-foreground hover:opacity-90">Get live price</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted-foreground">Specifications are manufacturer-published figures as cited on each aircraft page; actual seating and range vary by operator configuration, payload and conditions.</p>
      </section>
    </PageShell>
  );
}

export function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
