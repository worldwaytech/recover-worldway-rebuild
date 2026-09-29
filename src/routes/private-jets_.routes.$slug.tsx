import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { AircraftPhoto } from "@/components/aviation/aircraft-photo";
import { aircraftForDistance, airport, routeBySlug, routeTitle, JET_ROUTES } from "@/lib/aviation/jet-market";

export const Route = createFileRoute("/private-jets_/routes/$slug")({
  loader: ({ params }) => {
    const route = routeBySlug(params.slug);
    if (!route) throw notFound();
    return { route };
  },
  head: ({ loaderData }) => {
    const r = loaderData?.route;
    const t = r ? `Private Jet ${routeTitle(r)} — Charter | Worldway` : "Private jet route — Worldway";
    const d = r
      ? `Charter a private jet from ${airport(r.from).city} (${r.from}) to ${airport(r.to).city} (${r.to}) — ${r.distanceNm.toLocaleString()} nm. Suitable aircraft and live partner pricing from Worldway Private Aviation.`
      : "";
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: RoutePage,
  notFoundComponent: () => (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-32 text-center">
        <h1 className="font-serif text-3xl">Route not found</h1>
        <Link to="/private-jets" className="mt-4 inline-block text-primary underline">Search any route</Link>
      </div>
    </PageShell>
  ),
});

function RoutePage() {
  const { route: r } = Route.useLoaderData();
  const o = airport(r.from);
  const d = airport(r.to);
  const { nonstop, withStop } = aircraftForDistance(r.distanceNm);
  const reverse = JET_ROUTES.find((x) => x.from === r.to && x.to === r.from);
  const related = JET_ROUTES.filter((x) => x.slug !== r.slug && (x.from === r.from || x.to === r.to || x.from === r.to)).slice(0, 6);

  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
        <Link to="/private-jets" className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-primary">← Private jets</Link>
        <h1 className="mt-4 font-serif text-4xl md:text-5xl">Private jet {o.city} to {d.city}</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Fact label="From" value={`${o.name} (${o.iata} / ${o.icao})`} sub={o.country} />
          <Fact label="To" value={`${d.name} (${d.iata} / ${d.icao})`} sub={d.country} />
          <Fact label="Great-circle distance" value={`${r.distanceNm.toLocaleString()} nm`} sub={`${Math.round(r.distanceNm * 1.852).toLocaleString()} km`} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <div className="flex-1 text-sm">
            <div className="font-serif text-xl">Price on request</div>
            <div className="text-xs text-muted-foreground">Get live partner pricing for this route in one click — we never publish estimated fares.</div>
          </div>
          <Link to="/private-jets" search={{ from: r.from, to: r.to }} className="rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-primary-foreground">Get live price</Link>
        </div>

        <h2 className="mt-12 font-serif text-2xl">Aircraft with the range to fly nonstop</h2>
        <p className="mt-1 text-xs text-muted-foreground">Published range covers this distance with a 10% margin. Nonstop capability is always confirmed by the operator for payload, winds and runway.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {nonstop.map((a) => (
            <article key={a.slug} className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
              <AircraftPhoto aircraft={a} className="aspect-[16/10]" credit={false} />
              <div className="p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">{a.category}</div>
                <Link to="/aircraft/$slug" params={{ slug: a.slug }} className="mt-1 block font-serif text-lg hover:text-primary">{a.name}</Link>
                <div className="text-xs text-muted-foreground">Up to {a.maxPassengers} passengers · {a.rangeNm?.toLocaleString()} nm</div>
                <div className="mt-2 text-xs">Price on request</div>
                <Link to="/private-jets" search={{ from: r.from, to: r.to, aircraft: a.slug }} className="mt-3 inline-block text-[10px] uppercase tracking-[0.25em] text-primary hover:underline">Get live price →</Link>
              </div>
            </article>
          ))}
        </div>
        {withStop.length ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Also possible with a fuel stop: {withStop.map((a) => a.name).join(", ")}.
          </p>
        ) : null}

        {reverse || related.length ? (
          <section className="mt-12">
            <h2 className="font-serif text-2xl">Related routes</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...(reverse ? [reverse] : []), ...related.filter((x) => x !== reverse)].map((x) => (
                <Link key={x.slug} to="/private-jets/routes/$slug" params={{ slug: x.slug }} className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                  {routeTitle(x)}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
