import { useMemo, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CRUISE_STYLES,
  LENGTH_BANDS,
  MONTHS,
  SUITE_CATEGORIES,
  parseNaturalLanguage,
  searchVoyages,
} from "@/lib/crystal/inventory";
import { CRYSTAL_DESTINATIONS, CRYSTAL_SHIPS } from "@/lib/crystal/content";
import { crystalPrefs } from "@/lib/crystal/personalisation";
import type { CrystalSearchFilters } from "@/lib/crystal/types";
import { LicenceNotice, VoyageGrid } from "./crystal-ui";

export type FinderSearch = {
  q?: string;
  destination?: string;
  ship?: string;
  month?: string;
  suite?: string;
  style?: string;
  minNights?: number;
  maxNights?: number;
  maxPrice?: number;
  sort?: string;
};

function Facet({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={value ? "outline" : "secondary"}
          onClick={() => onChange(undefined)}
        >
          Any
        </Button>
        {options.map((o) => (
          <Button
            key={o.value}
            size="sm"
            variant={value === o.value ? "secondary" : "outline"}
            onClick={() => onChange(value === o.value ? undefined : o.value)}
          >
            {o.label}
            {typeof o.count === "number" ? (
              <Badge variant="outline" className="ml-2">
                {o.count}
              </Badge>
            ) : null}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CruiseFinder({ search }: { search: FinderSearch }) {
  const navigate = useNavigate();
  const [nl, setNl] = useState("");
  const saved = useSyncExternalStore(
    (cb) => crystalPrefs.subscribe(cb),
    () => crystalPrefs.searches(),
    () => [],
  );

  const filters: CrystalSearchFilters = useMemo(
    () => ({
      q: search.q,
      destination: search.destination,
      ship: search.ship,
      month: search.month,
      suite: search.suite as CrystalSearchFilters["suite"],
      style: search.style as CrystalSearchFilters["style"],
      minNights: search.minNights,
      maxNights: search.maxNights,
      maxPrice: search.maxPrice,
      sort: (search.sort as CrystalSearchFilters["sort"]) ?? "recommended",
    }),
    [search],
  );

  const result = useMemo(() => searchVoyages(filters), [filters]);

  function patch(next: Partial<FinderSearch>) {
    const merged = { ...search, ...next };
    for (const k of Object.keys(merged) as (keyof FinderSearch)[]) {
      if (merged[k] === undefined || merged[k] === "") delete merged[k];
    }
    navigate({ to: "/crystal-cruises/search", search: merged });
  }

  function runNaturalLanguage() {
    if (!nl.trim()) return;
    const parsed = parseNaturalLanguage(nl);
    patch({
      q: parsed.q,
      destination: parsed.destination,
      ship: parsed.ship,
      month: parsed.month,
      suite: parsed.suite,
      style: parsed.style,
      minNights: parsed.minNights,
      maxNights: parsed.maxNights,
      maxPrice: parsed.maxPrice,
    });
  }

  const facetCount = (list: { value: string; count: number }[], v: string) =>
    list.find((x) => x.value === v)?.count;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <label
          htmlFor="crystal-nl"
          className="text-[11px] uppercase tracking-[0.22em] text-primary"
        >
          Natural language search
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            id="crystal-nl"
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runNaturalLanguage();
            }}
            placeholder="I want a Mediterranean cruise in September with a balcony suite"
            className="max-w-xl"
          />
          <Button onClick={runNaturalLanguage}>Interpret</Button>
          <Button
            variant="outline"
            onClick={() => {
              crystalPrefs.saveSearch(nl || "Cruise search", JSON.stringify(search));
              toast.success("Search saved to this device.");
            }}
          >
            Save search
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Typo-tolerant, semantic intent matching over destination, ship, month, length, suite grade
          and cruise style. Results are drawn only from licensed inventory.
        </p>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Keyword</p>
            <Input
              className="mt-2"
              defaultValue={search.q ?? ""}
              onBlur={(e) => patch({ q: e.target.value || undefined })}
              placeholder="Port, ship, region"
              aria-label="Keyword search"
            />
          </div>
          <Facet
            label="Destination"
            value={search.destination}
            onChange={(v) => patch({ destination: v })}
            options={CRYSTAL_DESTINATIONS.map((d) => ({
              value: d.slug,
              label: d.name,
              count: facetCount(result.facets.destination, d.slug),
            }))}
          />
          <Facet
            label="Ship"
            value={search.ship}
            onChange={(v) => patch({ ship: v })}
            options={CRYSTAL_SHIPS.map((s) => ({
              value: s.slug,
              label: s.name,
              count: facetCount(result.facets.ship, s.slug),
            }))}
          />
          <Facet
            label="Departure month"
            value={search.month}
            onChange={(v) => patch({ month: v })}
            options={MONTHS.map((m) => ({
              value: m,
              label: m.slice(0, 3),
              count: facetCount(result.facets.month, m),
            }))}
          />
          <Facet
            label="Voyage length"
            value={
              LENGTH_BANDS.find((b) => b.min === search.minNights && b.max === search.maxNights)
                ?.label
            }
            onChange={(v) => {
              const band = LENGTH_BANDS.find((b) => b.label === v);
              patch({ minNights: band?.min, maxNights: band?.max });
            }}
            options={LENGTH_BANDS.map((b) => ({ value: b.label, label: b.label }))}
          />
          <Facet
            label="Suite category"
            value={search.suite}
            onChange={(v) => patch({ suite: v })}
            options={SUITE_CATEGORIES.map((s) => ({
              value: s.value,
              label: s.label,
              count: facetCount(result.facets.suite, s.value),
            }))}
          />
          <Facet
            label="Cruise style"
            value={search.style}
            onChange={(v) => patch({ style: v })}
            options={CRUISE_STYLES.map((s) => ({
              value: s.value,
              label: s.label,
              count: facetCount(result.facets.style, s.value),
            }))}
          />
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Maximum fare (USD)
            </p>
            <Input
              className="mt-2"
              type="number"
              min={0}
              defaultValue={search.maxPrice ?? ""}
              onBlur={(e) => patch({ maxPrice: Number(e.target.value) || undefined })}
              aria-label="Maximum fare"
            />
          </div>
          {saved.length > 0 ? (
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Saved searches
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <button
                      className="truncate text-left text-muted-foreground hover:text-primary"
                      onClick={() => {
                        try {
                          patch(JSON.parse(s.query) as FinderSearch);
                        } catch {
                          toast.error("That saved search could not be restored.");
                        }
                      }}
                    >
                      {s.label}
                    </button>
                    <button
                      aria-label={`Remove ${s.label}`}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => crystalPrefs.removeSearch(s.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {result.total} voyage{result.total === 1 ? "" : "s"}
              {result.licensed ? "" : " — awaiting licensed inventory"}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["recommended", "Recommended"],
                  ["price-asc", "Fare ↑"],
                  ["date-asc", "Departure"],
                  ["nights-asc", "Shortest"],
                  ["nights-desc", "Longest"],
                ] as const
              ).map(([v, l]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={(search.sort ?? "recommended") === v ? "secondary" : "outline"}
                  onClick={() => patch({ sort: v })}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>
          {!result.licensed ? <LicenceNotice className="mt-4" /> : null}
          <div className="mt-6">
            <VoyageGrid
              voyages={result.voyages}
              empty="No licensed voyages published for this search yet"
            />
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Prefer to browse by place?{" "}
            <Link to="/crystal-cruises/destinations" className="underline underline-offset-4">
              Explore cruise destinations
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
