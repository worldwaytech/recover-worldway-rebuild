import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  History,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import {
  searchViatorProducts,
  viatorDestinationSuggest,
  getViatorCategories,
} from "@/lib/viator.functions";
import {
  ACTIVITY_THEMES,
  POPULAR_ACTIVITY_SEARCHES,
  TRENDING_DESTINATIONS,
  activityHistory,
  type SavedActivity,
  type SavedSearch,
} from "@/lib/activities-client";
import { trackCatalogueEvent } from "@/lib/catalogue-client";

type Product = {
  productCode: string;
  title: string;
  description: string;
  image: string | null;
  rating: number | null;
  reviewCount: number;
  price: number | null;
  currency: string;
  durationLabel: string | null;
  flags: string[];
  productUrl: string | null;
  destinationNames?: string[];
};

type SearchResult = {
  ok: boolean;
  status: number;
  error?: string;
  configured: boolean;
  environment: "sandbox" | "production";
  destination?: { id: number; name: string } | null;
  totalCount: number;
  page: number;
  pageSize: number;
  products: Product[];
  mode?: "search" | "catalogue";
  hasMore?: boolean;
};

type Filters = {
  q: string;
  destination: string;
  destinationId?: number;
  startDate: string;
  categories: number[];
  priceMin: string;
  priceMax: string;
  duration: string;
  ratingMin: string;
  flags: string[];
  instant: boolean;
  themes: string[];
  sort: string;
};

const EMPTY: Filters = {
  q: "",
  destination: "",
  startDate: "",
  categories: [],
  priceMin: "",
  priceMax: "",
  duration: "",
  ratingMin: "",
  flags: [],
  instant: false,
  themes: [],
  sort: "DEFAULT",
};

const PAGE_SIZE = 24;

const DURATIONS = [
  { value: "", label: "Any duration" },
  { value: "0-60", label: "Up to 1 hour" },
  { value: "60-240", label: "1 – 4 hours" },
  { value: "240-480", label: "4 – 8 hours" },
  { value: "480-1440", label: "Full day" },
  { value: "1440-20160", label: "Multi-day" },
];

const FLAGS = [
  { value: "FREE_CANCELLATION", label: "Free cancellation" },
  { value: "SKIP_THE_LINE", label: "Skip the line" },
  { value: "PRIVATE_TOUR", label: "Private tour" },
  { value: "SPECIAL_OFFER", label: "Special offer" },
  { value: "LIKELY_TO_SELL_OUT", label: "Likely to sell out" },
];

const SORTS = [
  { value: "DEFAULT", label: "Recommended" },
  { value: "TRAVELER_RATING", label: "Traveller rating" },
  { value: "PRICE", label: "Price: low to high" },
  { value: "ITINERARY_DURATION", label: "Duration" },
];

export function money(price: number | null, currency: string) {
  if (price == null) return "On request";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${Math.round(price)}`;
  }
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/70 text-muted-foreground hover:border-primary/60 hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border/60 bg-card/60">
      <div className="aspect-[4/3] w-full bg-muted/40" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-2/3 rounded bg-muted/40" />
        <div className="h-3 w-1/3 rounded bg-muted/30" />
        <div className="h-3 w-1/2 rounded bg-muted/20" />
      </div>
    </div>
  );
}

export function ActivityExplorer({ initialDestination = "" }: { initialDestination?: string }) {
  const runSearch = useServerFn(searchViatorProducts);
  const runSuggest = useServerFn(viatorDestinationSuggest);
  const loadCategories = useServerFn(getViatorCategories);

  const [filters, setFilters] = useState<Filters>({
    ...EMPTY,
    destination: initialDestination,
  });
  const [term, setTerm] = useState(initialDestination);
  const [suggestions, setSuggestions] = useState<{ id: number; name: string; type: string }[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  const [items, setItems] = useState<Product[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const [recent, setRecent] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saved, setSaved] = useState<SavedActivity[]>([]);
  const [compare, setCompare] = useState<SavedActivity[]>([]);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    setRecent(activityHistory.recent());
    setSavedSearches(activityHistory.savedSearches());
    setSaved(activityHistory.saved());
    setCompare(activityHistory.compare());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = (await loadCategories({})) as { categories: { id: number; name: string }[] };
        setCategories(res.categories ?? []);
      } catch {
        setCategories([]);
      }
    })();
  }, [loadCategories]);

  const buildPayload = useCallback((f: Filters, nextPage: number) => {
    const [dMin, dMax] = f.duration ? f.duration.split("-").map(Number) : [undefined, undefined];
    const keyword = [f.q, ...f.themes].filter(Boolean).join(" ").trim();
    return {
      destination: f.destination || undefined,
      destinationId: f.destinationId,
      q: keyword || f.destination || undefined,
      startDate: f.startDate || undefined,
      priceMin: f.priceMin ? Number(f.priceMin) : undefined,
      priceMax: f.priceMax ? Number(f.priceMax) : undefined,
      tags: f.categories.length ? f.categories : undefined,
      flags: f.flags.length ? f.flags : undefined,
      durationMin: dMin,
      durationMax: dMax,
      ratingMin: f.ratingMin ? Number(f.ratingMin) : undefined,
      confirmationType: f.instant ? ("INSTANT" as const) : undefined,
      sort: f.sort as never,
      order: f.sort === "PRICE" ? ("ASCENDING" as const) : ("DESCENDING" as const),
      page: nextPage,
      pageSize: PAGE_SIZE,
      currency: "USD",
    };
  }, []);

  const load = useCallback(
    async (f: Filters, nextPage: number, append: boolean) => {
      if (append) setAppending(true);
      else setLoading(true);
      setError(null);
      const started = Date.now();
      try {
        const res = (await runSearch({ data: buildPayload(f, nextPage) })) as SearchResult;
        setElapsed(Date.now() - started);
        setResult(res);
        setPage(nextPage);
        setItems((prev) => (append ? [...prev, ...(res.products ?? [])] : (res.products ?? [])));
        if (!res.ok) setError(res.error ?? "The experiences supplier could not be reached.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error");
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setAppending(false);
      }
    },
    [buildPayload, runSearch],
  );

  // Initial load
  useEffect(() => {
    void load({ ...EMPTY, destination: initialDestination }, 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDestination]);

  // Instant search — debounce the free-text term into the applied filters.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const current = filtersRef.current;
      if (term.trim() === (current.destination || current.q)) return;
      const next: Filters = {
        ...current,
        destination: term.trim(),
        destinationId: undefined,
        q: "",
      };
      setFilters(next);
      if (term.trim()) {
        setRecent(activityHistory.pushRecent(term.trim()));
        trackCatalogueEvent("search", { kind: "activity", query: term.trim() });
      }
      void load(next, 1, false);
    }, 550);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  // Autocomplete
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = (await runSuggest({ data: { q, limit: 8 } })) as {
            results: { id: number; name: string; type: string }[];
          };
          if (!cancelled) setSuggestions(res.results ?? []);
        } catch {
          if (!cancelled) setSuggestions([]);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [term, runSuggest]);

  const apply = (patch: Partial<Filters>) => {
    const next = { ...filtersRef.current, ...patch };
    setFilters(next);
    trackCatalogueEvent("filter_used", { kind: "activity", filters: patch as never });
    void load(next, 1, false);
  };

  const pickDestination = (name: string, id?: number) => {
    setTerm(name);
    setSuggestOpen(false);
    setSuggestions([]);
    const next: Filters = { ...filtersRef.current, destination: name, destinationId: id, q: "" };
    setFilters(next);
    setRecent(activityHistory.pushRecent(name));
    void load(next, 1, false);
  };

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const hasMore = result
    ? result.mode === "catalogue"
      ? Boolean(result.hasMore)
      : items.length < result.totalCount
    : false;

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading || appending) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(filtersRef.current, page + 1, true);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, appending, page, load]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.startDate) n += 1;
    if (filters.priceMin || filters.priceMax) n += 1;
    if (filters.duration) n += 1;
    if (filters.ratingMin) n += 1;
    if (filters.instant) n += 1;
    n += filters.flags.length + filters.categories.length + filters.themes.length;
    return n;
  }, [filters]);

  const savedCodes = new Set(saved.map((s) => s.code));
  const compareCodes = new Set(compare.map((s) => s.code));

  return (
    <>
      {/* ---------- search bar ---------- */}
      <section className="mx-auto -mt-16 max-w-7xl px-6">
        <div className="rounded-2xl border border-border/60 bg-card/85 p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.3em] text-primary">
              Enterprise experience search
            </div>
            {result ? (
              <span className="rounded-full border border-border/60 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {result.configured ? `Live supplier · ${result.environment}` : "Awaiting API key"}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestOpen(false), 180)}
                placeholder="Destination, city, country, keyword or product code…"
                aria-label="Search experiences"
                className="w-full rounded-lg border border-border bg-background/60 py-3 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
              {term ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setTerm("");
                    apply({ destination: "", destinationId: undefined, q: "" });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              {suggestOpen && suggestions.length > 0 ? (
                <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
                  {suggestions.map((s) => (
                    <li key={`${s.id}-${s.name}`}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickDestination(s.name, s.id)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
                        <span className="flex-1">{s.name}</span>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {s.type.toLowerCase()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => apply({ startDate: e.target.value })}
              aria-label="Travel date"
              className="rounded-lg border border-border bg-background/60 px-3 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
            />

            <select
              value={filters.sort}
              onChange={(e) => apply({ sort: e.target.value })}
              aria-label="Sort results"
              className="rounded-lg border border-border bg-background/60 px-3 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              aria-expanded={panelOpen}
              className="flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground hover:border-primary hover:text-primary"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          </div>

          {/* theme chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {ACTIVITY_THEMES.map((t) => (
              <Chip
                key={t}
                active={filters.themes.includes(t)}
                onClick={() => apply({ themes: toggleIn(filters.themes, t) })}
              >
                {t}
              </Chip>
            ))}
          </div>

          {/* discovery rails */}
          <div className="mt-5 grid gap-4 border-t border-border/60 pt-5 md:grid-cols-3">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden /> Trending
                destinations
              </p>
              <div className="flex flex-wrap gap-2">
                {TRENDING_DESTINATIONS.slice(0, 6).map((d) => (
                  <Chip key={d} onClick={() => pickDestination(d)}>
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden /> Popular searches
              </p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_ACTIVITY_SEARCHES.slice(0, 6).map((p) => (
                  <Chip
                    key={p}
                    onClick={() => {
                      setTerm(p);
                    }}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                <History className="h-3.5 w-3.5 text-primary" aria-hidden /> Recent & saved
              </p>
              <div className="flex flex-wrap gap-2">
                {recent.slice(0, 4).map((r) => (
                  <Chip key={r} onClick={() => setTerm(r)}>
                    {r}
                  </Chip>
                ))}
                {savedSearches.slice(0, 3).map((s) => (
                  <Chip
                    key={s.id}
                    onClick={() => {
                      setTerm(s.destination || s.q);
                      apply({ ...(s.filters as Partial<Filters>) });
                    }}
                  >
                    ★ {s.label}
                  </Chip>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setSavedSearches(
                      activityHistory.saveSearch({
                        label: filters.destination || filters.q || "All experiences",
                        q: filters.q,
                        destination: filters.destination,
                        filters: filters as unknown as Record<string, unknown>,
                      }),
                    )
                  }
                  className="rounded-full border border-primary/60 px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
                >
                  Save this search
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- results + filter panel ---------- */}
      <section className="mx-auto mt-10 max-w-7xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside
            className={`${panelOpen ? "block" : "hidden"} lg:block`}
            aria-label="Filter experiences"
          >
            <div className="sticky top-24 space-y-6 rounded-2xl border border-border/60 bg-card/60 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-[0.25em] text-primary">Filters</h2>
                <button
                  type="button"
                  onClick={() => {
                    setTerm("");
                    setFilters(EMPTY);
                    void load(EMPTY, 1, false);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              </div>

              <FilterGroup title="Price (USD)">
                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    placeholder="Min"
                    aria-label="Minimum price"
                    value={filters.priceMin}
                    onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
                    onBlur={() => apply({ priceMin: filters.priceMin })}
                    className="w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm"
                  />
                  <input
                    inputMode="numeric"
                    placeholder="Max"
                    aria-label="Maximum price"
                    value={filters.priceMax}
                    onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
                    onBlur={() => apply({ priceMax: filters.priceMax })}
                    className="w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm"
                  />
                </div>
              </FilterGroup>

              <FilterGroup title="Duration">
                <select
                  value={filters.duration}
                  onChange={(e) => apply({ duration: e.target.value })}
                  aria-label="Duration"
                  className="w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm"
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </FilterGroup>

              <FilterGroup title="Guest rating">
                <select
                  value={filters.ratingMin}
                  onChange={(e) => apply({ ratingMin: e.target.value })}
                  aria-label="Minimum rating"
                  className="w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm"
                >
                  <option value="">Any rating</option>
                  <option value="3">3.0+</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+</option>
                </select>
              </FilterGroup>

              <FilterGroup title="Booking options">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={filters.instant}
                    onChange={(e) => apply({ instant: e.target.checked })}
                  />
                  Instant confirmation
                </label>
                {FLAGS.map((f) => (
                  <label
                    key={f.value}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={filters.flags.includes(f.value)}
                      onChange={() => apply({ flags: toggleIn(filters.flags, f.value) })}
                    />
                    {f.label}
                  </label>
                ))}
              </FilterGroup>

              {categories.length ? (
                <FilterGroup title="Category">
                  <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
                    {categories.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={filters.categories.includes(c.id)}
                          onChange={() =>
                            apply({
                              categories: filters.categories.includes(c.id)
                                ? filters.categories.filter((x) => x !== c.id)
                                : [...filters.categories, c.id],
                            })
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </FilterGroup>
              ) : null}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Category, price, duration, rating and booking filters are applied by the supplier
                when a destination is selected.
              </p>
            </div>
          </aside>

          <div>
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-2xl text-foreground">
                {result?.destination?.name
                  ? `Experiences in ${result.destination.name}`
                  : filters.destination
                    ? `Experiences matching “${filters.destination}”`
                    : "The worldwide experience catalogue"}
              </h2>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {result?.mode === "catalogue" || !result?.totalCount
                  ? `${items.length.toLocaleString()} loaded · all destinations`
                  : `${result.totalCount.toLocaleString()} experiences`}
                {elapsed != null ? ` · ${elapsed} ms` : ""}
              </p>
            </div>

            {result && result.configured === false ? (
              <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/5 p-6 text-sm text-muted-foreground">
                Experiences connector awaiting credentials.
              </div>
            ) : null}
            {error ? (
              <div
                role="alert"
                className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive-foreground"
              >
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : items.length === 0 && !error ? (
              <div className="rounded-2xl border border-border/60 bg-card/60 p-10 text-center">
                <p className="font-serif text-2xl text-foreground">No experiences matched</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Widen the filters, try another destination, or ask the concierge to source it.
                </p>
                <Link
                  to="/concierge"
                  className="mt-5 inline-block rounded-full border border-primary/60 px-5 py-2 text-xs uppercase tracking-[0.25em] text-primary hover:bg-primary/10"
                >
                  Ask the AI Concierge
                </Link>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((p, i) => (
                  <ActivityCard
                    key={`${p.productCode}-${i}`}
                    product={p}
                    saved={savedCodes.has(p.productCode)}
                    comparing={compareCodes.has(p.productCode)}
                    onSave={(item) => setSaved(activityHistory.toggleSaved(item))}
                    onCompare={(item) => setCompare(activityHistory.toggleCompare(item))}
                  />
                ))}
              </div>
            )}

            <div ref={sentinel} aria-hidden className="h-8" />
            {appending ? (
              <p className="flex items-center justify-center gap-2 py-6 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading more experiences
              </p>
            ) : null}
            {!loading && hasMore ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => void load(filters, page + 1, true)}
                  className="rounded-full border border-border px-6 py-2.5 text-xs uppercase tracking-[0.25em] text-muted-foreground hover:border-primary hover:text-primary"
                >
                  Load more
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {compare.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3">
            <span className="text-[10px] uppercase tracking-[0.25em] text-primary">
              Compare ({compare.length}/4)
            </span>
            {compare.map((c) => (
              <span
                key={c.code}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
              >
                {c.title.slice(0, 28)}
                <button
                  type="button"
                  aria-label={`Remove ${c.title} from compare`}
                  onClick={() => setCompare(activityHistory.toggleCompare(c))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <Link
              to="/concierge"
              search={{
                prompt: `Compare these experiences for me: ${compare.map((c) => c.title).join(" | ")}`,
              }}
              className="ml-auto rounded-full bg-primary px-5 py-2 text-[10px] uppercase tracking-[0.25em] text-primary-foreground"
            >
              Compare with AI Concierge
            </Link>
            <button
              type="button"
              onClick={() => setCompare(activityHistory.clearCompare())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function ActivityCard({
  product: p,
  saved,
  comparing,
  onSave,
  onCompare,
}: {
  product: Product;
  saved: boolean;
  comparing: boolean;
  onSave: (item: SavedActivity) => void;
  onCompare: (item: SavedActivity) => void;
}) {
  const item: SavedActivity = {
    code: p.productCode,
    title: p.title,
    image: p.image,
    price: p.price,
    currency: p.currency,
  };
  const place = (p.destinationNames ?? []).join(" · ");
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 transition-colors hover:border-primary/50">
      <Link
        to="/activities/$code"
        params={{ code: p.productCode }}
        className="block aspect-[4/3] overflow-hidden bg-muted/30"
      >
        {p.image ? (
          <img
            src={p.image}
            alt={p.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        {place ? (
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-primary">
            <MapPin className="h-3 w-3" aria-hidden /> {place}
          </p>
        ) : null}
        <h3 className="font-serif text-lg leading-snug text-foreground">
          <Link to="/activities/$code" params={{ code: p.productCode }}>
            {p.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {p.rating ? (
            <span className="flex items-center gap-1 text-primary">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden /> {p.rating.toFixed(1)}
              <span className="text-muted-foreground">({p.reviewCount.toLocaleString()})</span>
            </span>
          ) : null}
          {p.durationLabel ? (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden /> {p.durationLabel}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {p.flags.includes("FREE_CANCELLATION") ? <Badge>Free cancellation</Badge> : null}
          {p.flags.includes("SKIP_THE_LINE") ? <Badge>Skip the line</Badge> : null}
          {p.flags.includes("PRIVATE_TOUR") ? <Badge>Private</Badge> : null}
          {p.flags.includes("LIKELY_TO_SELL_OUT") ? <Badge>Selling fast</Badge> : null}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-3">
          <span className="text-sm text-foreground">From {money(p.price, p.currency)}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={saved ? "Remove from saved" : "Save experience"}
              onClick={() => onSave(item)}
              className="rounded-full border border-border/70 p-1.5 text-muted-foreground hover:border-primary hover:text-primary"
            >
              {saved ? (
                <BookmarkCheck className="h-4 w-4 text-primary" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              aria-label={comparing ? "Remove from compare" : "Add to compare"}
              onClick={() => onCompare(item)}
              className="rounded-full border border-border/70 p-1.5 text-muted-foreground hover:border-primary hover:text-primary"
            >
              {comparing ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <span className="block h-4 w-4 text-center text-[11px] leading-4">⇄</span>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/activities/$code"
            params={{ code: p.productCode }}
            className="rounded-full border border-primary/50 px-3 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-primary hover:bg-primary hover:text-primary-foreground"
          >
            View details
          </Link>
          <Link
            to="/activities/$code"
            params={{ code: p.productCode }}
            hash="book"
            className="rounded-full bg-primary px-3 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-primary-foreground hover:opacity-90"
          >
            Book now
          </Link>
          <Link
            to="/concierge"
            search={{
              prompt: `Tell me more about the experience “${p.title}” and suggest alternatives.`,
            }}
            className="rounded-full border border-border px-3 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:border-primary hover:text-primary"
          >
            AI Concierge
          </Link>
          <Link
            to="/activities/$code"
            params={{ code: p.productCode }}
            hash="quote"
            className="rounded-full border border-border px-3 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:border-primary hover:text-primary"
          >
            Request quote
          </Link>
        </div>
      </div>
    </article>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
      {children}
    </span>
  );
}
