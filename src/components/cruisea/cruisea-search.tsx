import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, SearchCard } from "@/components/search-shell";
import {
  CRUISEA_DURATIONS,
  formatCruiseaDate,
  formatCruiseaMoney,
  type CruiseaFacets,
  type CruiseaFilters,
  type CruiseaSailingSummary,
} from "@/lib/cruisea/types";
import { saveCruiseaSearchFn, searchCruisea } from "@/lib/cruisea/cruisea.functions";
import { useCruiseaSession } from "./use-cruisea-session";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground";

type SearchResponse = {
  results: CruiseaSailingSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export function CruiseaSearch({
  facets,
  initial,
}: {
  facets: CruiseaFacets;
  initial: SearchResponse;
}) {
  const [filters, setFilters] = useState<CruiseaFilters>({ page: 1, sort: "departure" });
  const search = useServerFn(searchCruisea);
  const saveSearch = useServerFn(saveCruiseaSearchFn);
  const session = useCruiseaSession();

  const query = useQuery({
    queryKey: ["cruisea-search", filters],
    queryFn: () => search({ data: filters }) as Promise<SearchResponse>,
    initialData: initial,
  });

  const shipsForCompany = useMemo(() => {
    if (!filters.company) return facets.companies.flatMap((c) => c.ships).sort();
    return facets.companies.find((c) => c.company === filters.company)?.ships ?? [];
  }, [facets.companies, filters.company]);

  function patch(next: Partial<CruiseaFilters>) {
    setFilters((prev) => ({ ...prev, ...next, page: next.page ?? 1 }));
  }

  function togglePackage(option: string) {
    const current = filters.packageOptions ?? [];
    patch({
      packageOptions: current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option],
    });
  }

  async function onSaveSearch() {
    if (!session.signedIn) {
      toast.info("Sign in to save this search to your Worldway account.");
      return;
    }
    try {
      await saveSearch({ data: { name: filters.query?.trim() || "Cruisea search", filters } });
      toast.success("Search saved to your account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that search.");
    }
  }

  const data = query.data ?? initial;

  return (
    <>
      <SearchCard title="Cruisea · Voyage search">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Field label="Search">
              <Input
                placeholder="Destination, ship, port or voyage name"
                value={filters.query ?? ""}
                onChange={(e) => patch({ query: e.target.value || undefined })}
              />
            </Field>
          </div>
          <Field label="Company">
            <select
              className={SELECT_CLASS}
              value={filters.company ?? ""}
              onChange={(e) =>
                patch({ company: e.target.value || undefined, ship: undefined })
              }
            >
              <option value="">All companies</option>
              {facets.companies.map((c) => (
                <option key={c.company} value={c.company}>
                  {c.company} ({c.sailings})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ship">
            <select
              className={SELECT_CLASS}
              value={filters.ship ?? ""}
              onChange={(e) => patch({ ship: e.target.value || undefined })}
            >
              <option value="">
                {filters.company ? "All ships in this fleet" : "All ships"}
              </option>
              {shipsForCompany.map((ship) => (
                <option key={ship} value={ship}>
                  {ship}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Field label="Voyage type">
            <select
              className={SELECT_CLASS}
              value={filters.cruiseType ?? ""}
              onChange={(e) => patch({ cruiseType: e.target.value || undefined })}
            >
              <option value="">All types</option>
              {facets.cruiseTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value} ({t.count})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Region">
            <select
              className={SELECT_CLASS}
              value={filters.region ?? ""}
              onChange={(e) => patch({ region: e.target.value || undefined })}
            >
              <option value="">All regions</option>
              {facets.regions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.value} ({r.count})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Embarkation port">
            <select
              className={SELECT_CLASS}
              value={filters.embarkationPort ?? ""}
              onChange={(e) => patch({ embarkationPort: e.target.value || undefined })}
            >
              <option value="">Any port</option>
              {facets.ports.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duration">
            <select
              className={SELECT_CLASS}
              value={filters.duration ?? ""}
              onChange={(e) => patch({ duration: e.target.value || undefined })}
            >
              <option value="">Any length</option>
              {CRUISEA_DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Field label="Cabin type">
            <select
              className={SELECT_CLASS}
              value={filters.cabinCategory ?? ""}
              onChange={(e) => patch({ cabinCategory: e.target.value || undefined })}
            >
              <option value="">Any cabin</option>
              {facets.cabinCategories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cruise area">
            <select
              className={SELECT_CLASS}
              value={filters.areaTag ?? ""}
              onChange={(e) => patch({ areaTag: e.target.value || undefined })}
            >
              <option value="">All areas</option>
              {facets.areaTags.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.value} ({a.count})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Guests">
            <select
              className={SELECT_CLASS}
              value={String(filters.guests ?? 2)}
              onChange={(e) => patch({ guests: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort by">
            <select
              className={SELECT_CLASS}
              value={filters.sort ?? "departure"}
              onChange={(e) => patch({ sort: e.target.value as CruiseaFilters["sort"] })}
            >
              <option value="departure">Departure date</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="duration">Duration</option>
            </select>
          </Field>
        </div>

        {facets.packageOptions.length ? (
          <div className="mt-5">
            <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Package options
            </div>
            <div className="flex flex-wrap gap-2">
              {facets.packageOptions.map((option) => {
                const active = (filters.packageOptions ?? []).includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => togglePackage(option.value)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {option.value}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setFilters({ page: 1, sort: "departure" })}>
            Clear filters
          </Button>
          <Button variant="secondary" onClick={onSaveSearch}>
            Save this search
          </Button>
          <span className="text-xs text-muted-foreground">
            {query.isFetching ? "Updating results…" : `${data.total} voyages match`}
          </span>
        </div>
      </SearchCard>

      <CruiseaCalendar
        months={facets.departureMonths}
        dates={facets.departureDates}
        selectedMonth={filters.departureMonth}
        selectedDate={filters.departureDate}
        onMonth={(month) => patch({ departureMonth: month, departureDate: undefined })}
        onDate={(date) => patch({ departureDate: date })}
      />

      <section className="mx-auto mt-12 max-w-6xl px-6 pb-20">
        {query.isError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            We could not load Cruisea voyages just now.{" "}
            <button className="underline" onClick={() => query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}

        {data.results.length === 0 && !query.isFetching ? (
          <div className="rounded-xl border border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            No voyages match these filters yet. Try widening the region, dates or duration.
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          {data.results.map((sailing) => (
            <CruiseaSailingCard key={sailing.id} sailing={sailing} guests={filters.guests ?? 2} />
          ))}
        </div>

        {data.pageCount > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => patch({ page: data.page - 1 })}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {data.page} of {data.pageCount}
            </span>
            <Button
              variant="outline"
              disabled={data.page >= data.pageCount}
              onClick={() => patch({ page: data.page + 1 })}
            >
              Next
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}

function CruiseaCalendar({
  months,
  dates,
  selectedMonth,
  selectedDate,
  onMonth,
  onDate,
}: {
  months: CruiseaFacets["departureMonths"];
  dates: CruiseaFacets["departureDates"];
  selectedMonth?: string;
  selectedDate?: string;
  onMonth: (month?: string) => void;
  onDate: (date?: string) => void;
}) {
  const visibleDates = selectedMonth
    ? dates.filter((d) => d.date.startsWith(selectedMonth))
    : dates;

  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <div className="rounded-2xl border border-border/60 bg-card/50 p-6">
        <div className="text-xs uppercase tracking-[0.3em] text-primary">Departure calendar</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMonth(undefined)}
            className={`rounded-full border px-3 py-1 text-xs ${
              !selectedMonth
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground"
            }`}
          >
            All months
          </button>
          {months.map((m) => (
            <button
              key={m.month}
              type="button"
              onClick={() => onMonth(m.month)}
              className={`rounded-full border px-3 py-1 text-xs ${
                selectedMonth === m.month
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:border-primary/50"
              }`}
            >
              {m.label} · {m.count}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleDates.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => onDate(selectedDate === d.date ? undefined : d.date)}
              className={`rounded-lg border px-3 py-2 text-xs ${
                selectedDate === d.date
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:border-primary/50"
              }`}
            >
              {formatCruiseaDate(d.date)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CruiseaSailingCard({
  sailing,
  guests,
}: {
  sailing: CruiseaSailingSummary;
  guests: number;
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border/60 bg-card/60 p-6">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary">{sailing.cruiseType}</Badge>
        <span className="text-xs text-muted-foreground">
          {sailing.durationNights} nights · {formatCruiseaDate(sailing.departureDate)}
        </span>
      </div>
      <h3 className="mt-3 font-serif text-2xl text-foreground">{sailing.title}</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-primary">
        {sailing.cruiseLine} · {sailing.shipName}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{sailing.description}</p>
      <div className="mt-3 text-xs text-muted-foreground">
        {sailing.embarkationPort} → {sailing.disembarkationPort} · {sailing.region},{" "}
        {sailing.country}
      </div>
      {sailing.highlights.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {sailing.highlights.map((h) => (
            <li
              key={h}
              className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              {h}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex items-end justify-between gap-4 pt-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">From</div>
          <div className="font-serif text-2xl text-foreground">
            {sailing.fromPrice ? formatCruiseaMoney(sailing.fromPrice) : "On request"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            per guest · {sailing.cabinCount} cabin grades
          </div>
        </div>
        <Button asChild>
          <Link
            to="/voyages/cruisea/sailing/$id"
            params={{ id: sailing.id }}
            search={{ guests }}
          >
            View & book
          </Link>
        </Button>
      </div>
    </article>
  );
}
