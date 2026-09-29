import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { AircraftPhoto } from "@/components/aviation/aircraft-photo";
import { aircraftBySlug } from "@/lib/aviation/aircraft-catalogue.data";
import { airport, routesFor, routeTitle } from "@/lib/aviation/jet-market";

export const Route = createFileRoute("/aircraft_/$slug")({
  loader: ({ params }) => {
    const a = aircraftBySlug(params.slug);
    if (!a) throw notFound();
    return { a };
  },
  head: ({ loaderData }) => {
    const a = loaderData?.a;
    const title = a ? `${a.name} Private Jet Charter — Worldway` : "Aircraft — Worldway";
    const desc = a ? `${a.name} by ${a.manufacturer}: ${a.category}, up to ${a.maxPassengers} passengers${a.rangeNm ? `, ${a.rangeNm.toLocaleString()} nm range` : ""}. Request live charter pricing.` : "";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(a?.photo ? [{ property: "og:image", content: a.photo.url }, { name: "twitter:image", content: a.photo.url }] : []),
      ],
    };
  },
  component: AircraftPage,
  notFoundComponent: () => (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-32 text-center">
        <h1 className="font-serif text-3xl">Aircraft not found</h1>
        <Link to="/aircraft" className="mt-4 inline-block text-primary underline">Browse the catalogue</Link>
      </div>
    </PageShell>
  ),
});

function AircraftPage() {
  const { a } = Route.useLoaderData();
  const routes = routesFor(a.slug, 8);
  const rows: [string, string][] = [
    ["Manufacturer", a.manufacturer],
    ["Category", a.category],
    ["Maximum passengers", String(a.maxPassengers)],
    ["Typical seating", a.typicalSeating ?? "—"],
    ["Range", a.rangeNm ? `${a.rangeNm.toLocaleString()} nm` : "Not published in source"],
    ["Cruise speed", a.cruise ?? "—"],
    ["Maximum speed", a.maxSpeed ?? "—"],
  ];
  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
        <Link to="/aircraft" className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-primary">← Aircraft catalogue</Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          <AircraftPhoto aircraft={a} className="aspect-[4/3] rounded-2xl" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-primary">{a.category}</div>
            <h1 className="mt-2 font-serif text-4xl">{a.name}</h1>
            <dl className="mt-6 divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/60">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-4 text-sm">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Pricing</div>
              <div className="mt-1 font-serif text-xl">Price on request</div>
              <p className="mt-1 text-xs text-muted-foreground">Charter prices depend on route, dates and aircraft position. Enter your trip for live partner pricing.</p>
            </div>
            <Link to="/private-jets" search={{ aircraft: a.slug }} className="mt-5 inline-block rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-primary-foreground">Get a live price for this aircraft</Link>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Specifications: <a href={a.source.url} target="_blank" rel="noopener noreferrer" className="underline">{a.source.title}</a> (manufacturer data). Operator configurations vary.
            </p>
          </div>
        </div>

        {routes.length ? (
          <section className="mt-14">
            <h2 className="font-serif text-2xl">Popular routes within its range</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {routes.map((r) => (
                <Link key={r.slug} to="/private-jets" search={{ from: r.from, to: r.to, aircraft: a.slug }} className="rounded-xl border border-border/60 bg-card/60 p-4 hover:border-primary/60">
                  <div className="font-serif">{routeTitle(r)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{airport(r.from).iata} → {airport(r.to).iata} · {r.distanceNm.toLocaleString()} nm</div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-primary">Get live price →</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
