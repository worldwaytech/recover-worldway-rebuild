import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search as SearchIcon, Clock, Flame, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, CollectionItemCard, SectionHeading } from "@/components/CollectionTemplate";
import { globalSearch, searchSuggestions, POPULAR_SEARCHES } from "@/lib/catalogue-engine";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  trackCatalogueEvent,
} from "@/lib/catalogue-client";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q.slice(0, 120) : "",
  }),
  head: ({ match }) => {
    const q = (match.search as { q?: string }).q;
    const title = q ? `Search: ${q} — Worldway Travels Group` : "Search the Worldway catalogue";
    const description = q
      ? `Voyages, stays, journeys and experiences matching "${q}" across the Worldway luxury travel catalogue.`
      : "Search every Worldway collection — cruises, safaris, rail journeys, villas, yachts, private aviation and more.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(q ? [{ name: "robots", content: "noindex,follow" }] : []),
      ],
      links: [{ rel: "canonical", href: "https://worldwaytravelsgroup.com/search" }],
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [term, setTerm] = useState<string>(q);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setTerm(q), [q]);
  useEffect(() => setRecent(getRecentSearches()), []);
  useEffect(() => {
    if (!q) return;
    addRecentSearch(q);
    setRecent(getRecentSearches());
    trackCatalogueEvent("search", { query: q });
  }, [q]);

  const results = useMemo(() => (q ? globalSearch(q, 24) : null), [q]);
  const suggestions = useMemo(() => searchSuggestions(term, 8), [term]);

  const run = (value: string) => navigate({ to: "/search", search: { q: value } });

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-card/40">
          <div className="container-lux py-4">
            <Breadcrumbs crumbs={[{ label: "Home", to: "/" }, { label: "Search" }]} />
          </div>
        </section>

        <section className="container-lux py-12">
          <div className="max-w-3xl">
            <p className="eyebrow text-gold">Enterprise catalogue search</p>
            <h1 className="mt-2 font-serif text-3xl md:text-4xl">Search everything Worldway</h1>
            <p className="mt-4 text-muted-foreground">
              Destinations, countries, cities, collections, travel styles and interests — across every vertical we operate.
            </p>
          </div>

          <form
            className="mt-8 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(term.trim());
            }}
          >
            <div className="relative min-w-[240px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Antarctica, Kenya safari, Orient Express, Amalfi villa…"
                className="h-12 pl-9"
                aria-label="Search the catalogue"
              />
            </div>
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>

          {term && suggestions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => run(s)}
                  className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs hover:border-gold hover:text-gold"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <p className="eyebrow flex items-center gap-2">
                <Flame className="h-3.5 w-3.5 text-gold" /> Popular searches
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => run(p)}
                    className="rounded-sm border border-border px-3 py-1.5 text-xs hover:border-gold hover:text-gold"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {recent.length > 0 && (
              <div>
                <p className="eyebrow flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-gold" /> Recent searches
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => run(r)}
                      className="rounded-sm border border-border px-3 py-1.5 text-xs hover:border-gold hover:text-gold"
                    >
                      {r}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      clearRecentSearches();
                      setRecent([]);
                    }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {results && (
          <section className="container-lux pb-16">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {results.total} result{results.total === 1 ? "" : "s"} for “{q}”
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-3">
              {results.destinations.length > 0 && (
                <div className="rounded-sm border border-border bg-card p-5">
                  <p className="eyebrow">Destinations</p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {results.destinations.map((d) => (
                      <li key={d}>
                        <button className="hover:text-gold" onClick={() => run(d)}>
                          {d}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.countries.length > 0 && (
                <div className="rounded-sm border border-border bg-card p-5">
                  <p className="eyebrow">Countries & cities</p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {results.countries.map((c) => (
                      <li key={c}>
                        <button className="hover:text-gold" onClick={() => run(c)}>
                          {c}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.collections.length > 0 && (
                <div className="rounded-sm border border-border bg-card p-5">
                  <p className="eyebrow">Collections</p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {results.collections.map((c) => (
                      <li key={c.slug}>
                        <Link to={c.path} className="hover:text-gold">
                          {c.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {results.products.length === 0 ? (
              <div className="mt-10 rounded-sm border border-border bg-card p-10 text-center">
                <p className="font-serif text-2xl">Nothing matched “{q}”</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a destination, a collection, or ask the concierge to source it for you.
                </p>
                <Link to="/concierge" className="mt-5 inline-block">
                  <Button variant="outline">Ask the AI Concierge</Button>
                </Link>
              </div>
            ) : (
              <div className="mt-10 space-y-12">
                {results.groups.map((g) => (
                  <div key={g.kind}>
                    <div className="flex items-end justify-between gap-4">
                      <h2 className="font-serif text-2xl">{g.title}</h2>
                      <Link
                        to={g.basePath}
                        className="text-xs uppercase tracking-widest text-gold hover:text-foreground"
                      >
                        All {g.total} →
                      </Link>
                    </div>
                    <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                      {g.items.map((item) => (
                        <CollectionItemCard
                          key={`${item.kind}-${item.slug}`}
                          item={item}
                          detailBase={item.detailBase}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
