// Destination intelligence: derives a live knowledge graph for a country from
// licensed supplier inventory only. No curated/scraped journey data is used.
import { BROWSE_HUBS } from "./browse-hubs";
import type { TourSummary } from "./tours.server";

export type Bucket = { label: string; count: number };

export type DestinationIntel = {
  country: string;
  ok: boolean;
  configured: boolean;
  error?: string;
  currency: string;
  /** Licensed journeys visiting this country with live future departures. */
  totalCount: number;
  sampleSize: number;
  featured: TourSummary[];
  styles: Bucket[];
  durations: Bucket[];
  serviceLevels: Bucket[];
  grades: Bucket[];
  regions: string[];
  priceFrom: number | null;
  priceTo: number | null;
  collections: { slug: string; title: string; eyebrow: string; count: number }[];
  relatedCountries: Bucket[];
};

const SERVICE_LEVEL_TERMS = [
  "Basic",
  "Standard",
  "Upgraded",
  "Comfort",
  "The Geluxe Collection",
  "Camping",
  "Independent Travel",
  "Small Group",
  "Private Travel",
];

function durationBand(days: number | null | undefined): string | null {
  if (!days || days < 1) return null;
  if (days <= 5) return "1–5 days";
  if (days <= 8) return "6–8 days";
  if (days <= 12) return "9–12 days";
  if (days <= 18) return "13–18 days";
  return "19+ days";
}

function rank(map: Map<string, number>, limit: number): Bucket[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const intelCache = new Map<string, { at: number; value: DestinationIntel }>();
const TTL = 15 * 60 * 1000;

export async function getDestinationIntel(
  country: string,
  currency = "USD",
): Promise<DestinationIntel> {
  const key = `${country.toLowerCase()}|${currency}`;
  const hit = intelCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const { searchTours } = await import("./tours.server");
  const res = await searchTours({ country, currency, pageSize: 40, page: 1 });

  const tours = res.tours ?? [];
  const styles = new Map<string, number>();
  const service = new Map<string, number>();
  const durations = new Map<string, number>();
  const grades = new Map<string, number>();
  const related = new Map<string, number>();
  const regions = new Set<string>();
  let priceFrom: number | null = null;
  let priceTo: number | null = null;

  for (const t of tours) {
    if (t.region) regions.add(t.region);
    for (const c of t.categories) {
      if (SERVICE_LEVEL_TERMS.includes(c)) service.set(c, (service.get(c) ?? 0) + 1);
      else if (/^\d+\s*-\s*/.test(c)) grades.set(c, (grades.get(c) ?? 0) + 1);
      else styles.set(c, (styles.get(c) ?? 0) + 1);
    }
    const band = durationBand(t.durationDays);
    if (band) durations.set(band, (durations.get(band) ?? 0) + 1);
    for (const c of t.countries) {
      if (c.toLowerCase() !== country.toLowerCase()) related.set(c, (related.get(c) ?? 0) + 1);
    }
    if (t.fromPrice != null) {
      priceFrom = priceFrom == null ? t.fromPrice : Math.min(priceFrom, t.fromPrice);
      priceTo = priceTo == null ? t.fromPrice : Math.max(priceTo, t.fromPrice);
    }
  }

  const catalogueCategories = new Set([...styles.keys(), ...service.keys()]);
  const haystack = tours.map((t) => `${t.name} ${t.description}`.toLowerCase());
  const collections = BROWSE_HUBS.filter((h) => h.mode !== "request")
    .map((h) => {
      let count = 0;
      if (h.lock.category && catalogueCategories.has(h.lock.category)) {
        count = tours.filter((t) => t.categories.includes(h.lock.category!)).length;
      } else if (h.lock.q) {
        const q = h.lock.q.toLowerCase();
        count = haystack.filter((s) => s.includes(q)).length;
      }
      return { slug: h.slug, title: h.title, eyebrow: h.eyebrow, count };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const value: DestinationIntel = {
    country,
    ok: res.ok,
    configured: res.configured,
    error: res.error,
    currency: res.currency,
    totalCount: res.totalCount,
    sampleSize: tours.length,
    featured: tours.slice(0, 6),
    styles: rank(styles, 8),
    serviceLevels: rank(service, 5),
    grades: rank(grades, 5).sort((a, b) => a.label.localeCompare(b.label)),
    durations: rank(durations, 5),
    regions: [...regions],
    priceFrom,
    priceTo,
    collections,
    relatedCountries: rank(related, 8),
  };
  if (res.ok) intelCache.set(key, { at: Date.now(), value });
  return value;
}
