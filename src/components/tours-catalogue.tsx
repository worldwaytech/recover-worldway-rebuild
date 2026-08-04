import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { searchTourCatalogue } from "@/lib/tours.functions";
import { Field, inputClass } from "./search-form";
import { BrowseSection, DealsSection, useTourTaxonomy } from "./tours-browse";
import { TourCard, TourStubRow, money } from "./tours/tour-card";
import { useRecentlyViewed, useSavedTours } from "@/lib/tour-shortlist";

export { money };

type Tour = {
  id: string;
  name: string;
  slug: string;
  productLine: string;
  description: string;
  image: string | null;
  region: string | null;
  countries: string[];
  categories: string[];
  fromPrice: number | null;
  currency: string;
  departuresStart: string | null;
  departuresEnd: string | null;
  durationDays?: number | null;
};

type Result = {
  ok: boolean;
  status: number;
  error?: string;
  configured: boolean;
  environment: "sandbox" | "production";
  totalCount: number;
  page: number;
  pageSize: number;
  currency: string;
  tours: Tour[];
  hasMore: boolean;
};

const PAGE_SIZE = 24;

const DURATIONS = [
  { label: "Any length", value: "" },
  { label: "1–7 days", value: "1-7" },
  { label: "8–14 days", value: "8-14" },
  { label: "15–21 days", value: "15-21" },
  { label: "22+ days", value: "22-120" },
];

const BUDGETS = [
  { label: "Any budget", value: "" },
  { label: "Under $1,500", value: "0-1500" },
  { label: "$1,500 – $3,000", value: "1500-3000" },
  { label: "$3,000 – $6,000", value: "3000-6000" },
  { label: "$6,000+", value: "6000-200000" },
];

function monthOptions() {
  const out: { label: string; value: string }[] = [{ label: "Any month", value: "" }];
  const now = new Date();
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push({
      label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    });
  }
  return out;
}

function monthWindow(month: string) {
  if (!month) return {};
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return {};
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const today = new Date().toISOString().slice(0, 10);
  const fromIso = from.toISOString().slice(0, 10);
  return { departFrom: fromIso < today ? today : fromIso, departTo: to.toISOString().slice(0, 10) };
}

function range(value: string) {
  if (!value) return {};
  const [min, max] = value.split("-").map(Number);
  return { min, max };
}

export type ToursSearchState = {
  q?: string;
  country?: string;
  region?: string;
  category?: string;
  duration?: string;
  budget?: string;
  month?: string;
  sort?: "NAME" | "PRICE" | "DEPARTURE";
};

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border/60 bg-card/60">
      <div className="aspect-[4/3] w-full bg-muted/40" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-2/3 rounded bg-muted/40" />
        <div className="h-3 w-1/3 rounded bg-muted/30" />
      </div>
    </div>
  );
}

export type ToursCatalogueProps = {
  initial?: ToursSearchState;
  /** Supplier filters locked for this surface (browse hubs). */
  lock?: { category?: string; q?: string; region?: string; durationMin?: number };
  /** Route the URL-synced filters are written to. */
  basePath?: string;
  /** Hides the taxonomy facet rails and deals rail on scoped hubs. */
  showFacets?: boolean;
  label?: string;
};

export function ToursCatalogue({
  initial = {},
  lock,
  basePath = "/tours",
  showFacets = true,
  label = "Tour search",
}: ToursCatalogueProps) {
  const run = useServerFn(searchTourCatalogue);
  const navigate = useNavigate();
  const [q, setQ] = useState(initial.q ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [region, setRegion] = useState(initial.region ?? "");
  const [style, setStyle] = useState(initial.category ?? "");
  const [interest, setInterest] = useState("");
  const [duration, setDuration] = useState(initial.duration ?? "");
  const [budget, setBudget] = useState(initial.budget ?? "");
  const [month, setMonth] = useState(initial.month ?? "");
  const [sort, setSort] = useState<"NAME" | "PRICE" | "DEPARTURE">(initial.sort ?? "DEPARTURE");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [error, setError] = useState<string | null>(null);
  const taxonomy = useTourTaxonomy();
  const months = useMemo(monthOptions, []);
  const { saved } = useSavedTours();
  const viewed = useRecentlyViewed();
  const first = useRef(true);

  const load = useCallback(
    async (nextPage: number, s: Required<ToursSearchState>, append: boolean) => {
      setLoading(true);
      setError(null);
      const d = range(s.duration);
      const b = range(s.budget);
      try {
        const res = (await run({
          data: {
            q: s.q || lock?.q || undefined,
            country: s.country || undefined,
            region: s.region || lock?.region || undefined,
            category: lock?.category || s.category || undefined,
            durationMin: d.min ?? lock?.durationMin,
            durationMax: d.max,
            priceMin: b.min,
            priceMax: b.max,
            ...monthWindow(s.month),
            page: nextPage,
            pageSize: PAGE_SIZE,
            currency: "USD",
            sort: s.sort as never,
          },
        })) as Result;
        setResult(res);
        setTours((prev) => (append ? [...prev, ...(res.tours ?? [])] : (res.tours ?? [])));
        if (!res.ok) setError(res.error ?? "Tour search failed.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error");
      } finally {
        setLoading(false);
      }
    },
    [run, lock],
  );

  const state = useMemo<Required<ToursSearchState>>(
    () => ({
      q,
      country,
      region,
      category: style || interest,
      duration,
      budget,
      month,
      sort,
    }),
    [q, country, region, style, interest, duration, budget, month, sort],
  );

  /** Keeps the URL shareable/deep-linkable for every applied facet. */
  const syncUrl = useCallback(
    (s: Required<ToursSearchState>) => {
      const search: Record<string, string> = {};
      for (const [k, v] of Object.entries(s)) if (v && v !== "DEPARTURE") search[k] = v;
      void navigate({ to: basePath, search, replace: true } as never);
    },
    [navigate, basePath],
  );

  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void load(1, state, false);
  }, [load, state]);

  function apply(next: Partial<ToursSearchState>) {
    const merged = { ...state, ...next } as Required<ToursSearchState>;
    setPage(1);
    syncUrl(merged);
    void load(1, merged, false);
    if (typeof window !== "undefined") window.scrollTo({ top: 320, behavior: "smooth" });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    syncUrl(state);
    void load(1, state, false);
  }

  function applyFacet(next: {
    region?: string;
    style?: string;
    interest?: string;
    country?: string;
  }) {
    const nextRegion = next.region ?? region;
    const nextStyle = next.style ?? style;
    const nextInterest = next.interest ?? interest;
    const nextCountry = next.country ?? country;
    setRegion(nextRegion);
    setStyle(nextStyle);
    setInterest(nextInterest);
    setCountry(nextCountry);
    apply({
      region: nextRegion,
      country: nextCountry,
      category: nextStyle || nextInterest,
    });
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    void load(next, state, true);
  }

  function resetAll() {
    setQ("");
    setCountry("");
    setRegion("");
    setStyle("");
    setInterest("");
    setDuration("");
    setBudget("");
    setMonth("");
    setSort("DEPARTURE");
    apply({
      q: "",
      country: "",
      region: "",
      category: "",
      duration: "",
      budget: "",
      month: "",
      sort: "DEPARTURE",
    });
  }

  const activeFilters = [region, country, style, interest, duration, budget, month].filter(Boolean);
  const notConfigured = result && result.configured === false;

  return (
    <>
      <section className="mx-auto -mt-16 max-w-6xl px-6">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.3em] text-primary">{label}</div>
            {result?.ok ? (
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {result.totalCount.toLocaleString()} live journeys · {tours.length} shown
              </div>
            ) : null}
          </div>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[2fr_1.4fr_1fr_auto]">
            <Field label="Tour or destination">
              <input
                className={inputClass}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Peru, Kilimanjaro, Vietnam…"
              />
            </Field>
            <Field label="Country">
              <input
                className={inputClass}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Japan"
              />
            </Field>
            <Field label="Sort">
              <select
                className={inputClass}
                value={sort}
                onChange={(e) => {
                  const v = e.target.value as typeof sort;
                  setSort(v);
                  apply({ sort: v });
                }}
              >
                <option value="DEPARTURE">Next departures</option>
                <option value="NAME">Name A–Z</option>
                <option value="PRICE">Lowest price</option>
              </select>
            </Field>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full border border-primary/50 bg-primary/10 px-6 py-2.5 text-[10px] uppercase tracking-[0.28em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
              >
                {loading ? "Searching" : "Search"}
              </button>
            </div>
          </form>

          <div className="mt-5 grid gap-4 border-t border-border/50 pt-5 md:grid-cols-[1fr_1fr_1fr_auto]">
            <Field label="Trip length">
              <select
                className={inputClass}
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  apply({ duration: e.target.value });
                }}
              >
                {DURATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Budget per person">
              <select
                className={inputClass}
                value={budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  apply({ budget: e.target.value });
                }}
              >
                {BUDGETS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Departure month">
              <select
                className={inputClass}
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  apply({ month: e.target.value });
                }}
              >
                {months.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                onClick={resetAll}
                disabled={!activeFilters.length && !q}
                className="w-full rounded-full border border-border/60 px-6 py-2.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-40"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {showFacets && taxonomy ? (
        <>
          <BrowseSection
            eyebrow="Destinations"
            title="Browse by region"
            entries={taxonomy.regions}
            active={region}
            onSelect={(v) => applyFacet({ region: v })}
            limit={12}
          />
          <BrowseSection
            eyebrow="Destinations"
            title="Browse by country"
            intro="Every country with live, bookable departures in the operator catalogue."
            entries={taxonomy.countries}
            active={country}
            onSelect={(v) => applyFacet({ country: v })}
            limit={28}
          />
          <BrowseSection
            eyebrow="Travel style"
            title="Choose how you travel"
            entries={taxonomy.travelStyles}
            active={style}
            onSelect={(v) => applyFacet({ style: v, interest: "" })}
            limit={20}
          />
          <BrowseSection
            eyebrow="Interests"
            title="Explore by interest"
            entries={taxonomy.interests}
            active={interest}
            onSelect={(v) => applyFacet({ interest: v, style: "" })}
            limit={20}
          />
          <BrowseSection
            eyebrow="Comfort"
            title="Service level"
            entries={taxonomy.serviceLevels}
            active={style}
            onSelect={(v) => applyFacet({ style: v, interest: "" })}
            limit={10}
          />
          <BrowseSection
            eyebrow="Activity level"
            title="Physical grading"
            entries={taxonomy.physicalGrading}
            active={style}
            onSelect={(v) => applyFacet({ style: v, interest: "" })}
            limit={10}
          />
        </>
      ) : null}

      {showFacets ? <DealsSection /> : null}

      <TourStubRow title="Your shortlist" items={saved} />
      <TourStubRow title="Recently viewed" items={viewed} />

      <section id="tour-results" className="mx-auto max-w-6xl px-6 py-14">
        {notConfigured ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-sm text-muted-foreground">
            <div className="mb-2 text-xs uppercase tracking-[0.3em] text-primary">
              Awaiting production credentials
            </div>
            The tour catalogue connector is installed. Add the agency code and production keys to
            stream every multi-day journey with live pricing, availability and booking.
          </div>
        ) : null}

        {error && !notConfigured ? (
          <div className="mb-8 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((t) => (
            <TourCard key={t.id} tour={t} />
          ))}
          {loading ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />) : null}
        </div>

        {result?.ok && tours.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">
            No journeys matched those filters. Widen the trip length, budget or departure month.
          </p>
        ) : null}

        {result?.ok && result.hasMore ? (
          <div className="mt-12 flex flex-col items-center gap-3">
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-full border border-primary/50 bg-primary/10 px-8 py-3 text-[10px] uppercase tracking-[0.28em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
            >
              {loading ? "Loading" : "Load more journeys"}
            </button>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Showing {tours.length} of {result.totalCount.toLocaleString()}
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
