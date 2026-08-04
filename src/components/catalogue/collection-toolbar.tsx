import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { CatalogueFacets, CatalogueFilters, SortKey } from "@/lib/catalogue-types";
import { SORT_LABELS } from "@/lib/catalogue-types";

const ANY = "__any";

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (v?: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={`Any ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ANY}>{`Any ${label.toLowerCase()}`}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CollectionToolbar({
  filters,
  facets,
  sort,
  total,
  itemNounPlural,
  onFilters,
  onSort,
  open,
  onOpenChange,
}: {
  filters: CatalogueFilters;
  facets: CatalogueFacets;
  sort: SortKey;
  total: number;
  itemNounPlural: string;
  onFilters: (next: CatalogueFilters) => void;
  onSort: (s: SortKey) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const set = (patch: Partial<CatalogueFilters>) => onFilters({ ...filters, ...patch });
  const activeCount = Object.entries(filters).filter(
    ([k, v]) => k !== "q" && v !== undefined && v !== false,
  ).length;
  const maxPrice = Math.max(facets.priceRange.max, 1);

  return (
    <div className="rounded-sm border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q ?? ""}
            onChange={(e) => set({ q: e.target.value || undefined })}
            placeholder={`Search ${itemNounPlural}, destinations, operators…`}
            className="h-10 pl-9"
            aria-label={`Search ${itemNounPlural}`}
          />
        </div>
        <Select value={sort} onValueChange={(v) => onSort(v as SortKey)}>
          <SelectTrigger className="h-10 w-[190px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-10" onClick={() => onOpenChange(!open)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </div>

      <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
        {total} {total === 1 ? itemNounPlural.replace(/s$/, "") : itemNounPlural} available
      </p>

      {open && (
        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <FacetSelect
            label="Destination"
            value={filters.destination}
            options={facets.destinations}
            onChange={(v) => set({ destination: v })}
          />
          <FacetSelect
            label="Country"
            value={filters.country}
            options={facets.countries}
            onChange={(v) => set({ country: v })}
          />
          <FacetSelect
            label="Travel style"
            value={filters.travelStyle}
            options={facets.travelStyles}
            onChange={(v) => set({ travelStyle: v })}
          />
          <FacetSelect
            label="Interest"
            value={filters.interest}
            options={facets.interests}
            onChange={(v) => set({ interest: v })}
          />
          <FacetSelect
            label="Luxury level"
            value={filters.luxuryLevel}
            options={facets.luxuryLevels}
            onChange={(v) => set({ luxuryLevel: v })}
          />
          <FacetSelect
            label="Group size"
            value={filters.groupSize}
            options={facets.groupSizes}
            onChange={(v) => set({ groupSize: v })}
          />
          <FacetSelect
            label="Departure month"
            value={filters.departureMonth}
            options={facets.departureMonths}
            onChange={(v) => set({ departureMonth: v })}
          />
          <FacetSelect
            label="Supplier"
            value={filters.supplier}
            options={facets.suppliers}
            onChange={(v) => set({ supplier: v })}
          />

          <div className="space-y-2 sm:col-span-2">
            <Label className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              Budget up to ${Math.round(filters.priceMax ?? maxPrice).toLocaleString()}
            </Label>
            <Slider
              value={[filters.priceMax ?? maxPrice]}
              min={Math.max(0, facets.priceRange.min)}
              max={maxPrice}
              step={Math.max(100, Math.round(maxPrice / 60))}
              onValueChange={([v]) => set({ priceMax: v >= maxPrice ? undefined : v })}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              Duration up to {filters.durationMax ?? facets.durationRange.max} nights
            </Label>
            <Slider
              value={[filters.durationMax ?? Math.max(facets.durationRange.max, 1)]}
              min={Math.max(0, facets.durationRange.min)}
              max={Math.max(facets.durationRange.max, 1)}
              step={1}
              onValueChange={([v]) =>
                set({ durationMax: v >= facets.durationRange.max ? undefined : v })
              }
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="family"
              checked={!!filters.familyFriendly}
              onCheckedChange={(v) => set({ familyFriendly: v || undefined })}
            />
            <Label htmlFor="family" className="text-sm">
              Family friendly
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="access"
              checked={!!filters.accessible}
              onCheckedChange={(v) => set({ accessible: v || undefined })}
            />
            <Label htmlFor="access" className="text-sm">
              Accessibility friendly
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="avail"
              checked={!!filters.availableOnly}
              onCheckedChange={(v) => set({ availableOnly: v || undefined })}
            />
            <Label htmlFor="avail" className="text-sm">
              Live supplier availability
            </Label>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" className="h-9" onClick={() => onFilters({ q: filters.q })}>
              <X className="mr-1.5 h-4 w-4" /> Clear filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
