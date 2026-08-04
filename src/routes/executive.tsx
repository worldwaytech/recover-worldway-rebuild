import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPartnerReadiness } from "@/lib/partners/readiness.functions";
import type { PartnerReadiness } from "@/lib/partners/types";
import { allJourneys, journeyPartners } from "@/lib/journeys";
import { allRegions, countRegion } from "@/lib/destinations";
import { allCollections } from "@/lib/collections";

const TITLE = "Executive Readiness — Worldway Travels Group";
const DESCRIPTION =
  "Live platform readiness for enterprise luxury travel partners: connector status, catalogue depth, destination coverage and guided demonstration journeys.";
const URL = "https://worldwaytravelsgroup.com/executive";

export const Route = createFileRoute("/executive")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  loader: () => getPartnerReadiness(),
  errorComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">Readiness console unavailable</h1>
      <p className="mt-3 text-muted-foreground">
        Please refresh — the connector status service did not respond.
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">Not found</h1>
    </div>
  ),
  component: ExecutivePage,
});

const MODE_LABEL: Record<string, string> = {
  live: "Live",
  demonstration: "Demonstration",
  "awaiting-credentials": "Awaiting credentials",
  disabled: "Disabled",
};

function ExecutivePage() {
  const { partners, generatedAt, templateCoverage } = Route.useLoaderData() as PartnerReadiness;
  const regions = allRegions();
  const journeys = allJourneys();
  const countries = regions.reduce((n, r) => n + countRegion(r).countries, 0);
  const destinations = regions.reduce((n, r) => n + countRegion(r).destinations, 0);
  const live = partners.filter((p) => p.mode === "live").length;

  const stats = [
    { label: "Curated journeys", value: String(journeys.length) },
    { label: "Partner operators", value: String(journeyPartners().length) },
    { label: "Collections", value: String(allCollections.length) },
    { label: "Regions", value: String(regions.length) },
    { label: "Countries", value: String(countries) },
    { label: "Destinations", value: String(destinations) },
  ];

  const demos = [
    {
      to: "/journeys",
      title: "Journey catalogue",
      body: "Browse partner itineraries with filters by operator, region and interest.",
    },
    {
      to: "/destinations",
      title: "Destination hierarchy",
      body: "World → region → country → destination, each with maps, seasons and FAQs.",
    },
    {
      to: "/concierge",
      title: "AI Concierge",
      body: "Guided conversational planning that hands off to a human specialist.",
    },
    {
      to: "/search",
      title: "Unified search",
      body: "One query across flights, residences, cruises, rail, villas and experiences.",
    },
    {
      to: "/membership",
      title: "Membership & wallet",
      body: "Tiered benefits, secure server-side upgrades and wallet ledger.",
    },
    {
      to: "/admin/partners",
      title: "Partner console",
      body: "Connector health, sync runs and request logs for operations teams.",
    },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        Executive briefing
      </p>
      <h1 className="mt-2 font-serif text-4xl sm:text-5xl">Platform readiness</h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">
        Every workflow below is fully operational. Where an official partner contract is still being
        finalised, the connector runs in clearly-marked demonstration mode — switching to live data
        requires only the partner's credentials, with no code change.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Generated {new Date(generatedAt).toUTCString()} · {live} of {partners.length} connectors
        live
      </p>

      <section aria-labelledby="coverage" className="mt-12">
        <h2 id="coverage" className="font-serif text-2xl">
          Catalogue coverage
        </h2>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border/60 bg-card p-5">
              <dt className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </dt>
              <dd className="mt-2 font-serif text-3xl text-primary">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="connectors" className="mt-14">
        <h2 id="connectors" className="font-serif text-2xl">
          Partner integration status
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {partners.map((p) => (
            <article key={p.id} className="rounded-xl border border-border/60 bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-serif text-lg">{p.name}</h3>
                <Badge variant={p.mode === "live" ? "default" : "secondary"}>
                  {MODE_LABEL[p.mode] ?? p.mode}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.summary}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.capabilities.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <span className="uppercase tracking-[0.16em]">Contract</span>
                  <div className="mt-1 text-foreground">{p.contractStatus.replace("-", " ")}</div>
                </div>
                <div>
                  <span className="uppercase tracking-[0.16em]">Credentials</span>
                  <div className="mt-1 text-foreground">
                    {p.credentialsConfigured}/{p.credentialsRequired} configured · {p.authKind}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="uppercase tracking-[0.16em]">Ingestion</span>
                <div className="mt-1 text-foreground">
                  {p.feed
                    ? `REST + ${p.feed.format.toUpperCase()} feed · ${p.feed.mappedFields} mapped fields${p.feed.push ? " · signed push endpoint" : ""}`
                    : "REST catalogue"}
                </div>
                {p.templates.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.templates.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-border/60 px-2 py-0.5 text-[11px]"
                      >
                        {t.replace(/-/g, " ")}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="templates" className="mt-14">
        <h2 id="templates" className="font-serif text-2xl">
          Vertical template coverage
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Each product line renders from one configuration-driven template: itinerary, route map,
          gallery, vessel or residence, inclusions, availability calendar, departures, reviews,
          documents, FAQs, quote and booking, plus AI Concierge hand-off.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templateCoverage.map((t) => (
            <article key={t.id} className="rounded-xl border border-border/60 bg-card p-5">
              <h3 className="font-serif text-lg">{t.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.sections} sections · {t.sampleJourneys} sample{" "}
                {t.sampleJourneys === 1 ? "journey" : "journeys"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.suppliers.length ? t.suppliers.join(", ") : "Awaiting partner content"}
              </p>
              <Link
                to={t.routeBase}
                className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-primary"
              >
                Open →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="demos" className="mt-14">
        <h2 id="demos" className="font-serif text-2xl">
          Guided demonstration
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map((d) => (
            <Link
              key={d.to}
              to={d.to}
              className="group rounded-xl border border-border/60 bg-card p-6 transition-colors hover:border-primary/50"
            >
              <h3 className="font-serif text-lg group-hover:text-primary">{d.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d.body}</p>
              <span className="mt-4 inline-block text-xs uppercase tracking-[0.18em] text-primary">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-border/60 bg-card p-8">
        <h2 className="font-serif text-2xl">Ready for onboarding</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          To activate Abercrombie &amp; Kent, Crystal Cruises or any registered operator, provide
          the sandbox credentials listed in their connector record. The runtime handles
          authentication, retries, rate limiting, caching and normalisation automatically.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/contact">Talk to our integration team</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/journeys">Explore the catalogue</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
