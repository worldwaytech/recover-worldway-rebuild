import type { Journey } from "@/lib/data";

/** Worldway-curated fields that a supplier sync never overwrites on existing journeys. */
const WORLDWAY_FIELDS = ["featured", "bestseller", "faqs", "category", "region", "image"] as const;

export function mergeJourney(base: Journey | undefined, synced: Journey, full = true): Journey {
  if (!base) return synced;
  const merged: Journey = { ...base, ...synced };
  for (const key of WORLDWAY_FIELDS) {
    const value = base[key];
    if (value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  if (!full) {
    // Cards carry no day-by-day content; keep the full static detail.
    merged.itinerary = base.itinerary;
    merged.inclusions = base.inclusions;
    merged.exclusions = base.exclusions;
    merged.accommodations = base.accommodations;
    merged.overview = base.overview || synced.overview;
  }
  return merged;
}

export function mergeCatalogue(
  base: Journey[],
  synced: { cards: Journey[]; inactive: string[] } | null | undefined,
): Journey[] {
  if (!synced || (synced.cards.length === 0 && synced.inactive.length === 0)) return base;
  const inactive = new Set(synced.inactive);
  const bySlug = new Map(synced.cards.map((c) => [c.slug, c]));
  const out: Journey[] = [];
  const seen = new Set<string>();
  for (const j of base) {
    if (inactive.has(j.slug) || seen.has(j.slug)) continue;
    const s = bySlug.get(j.slug);
    out.push(s ? mergeJourney(j, s, false) : j);
    seen.add(j.slug);
  }
  for (const c of synced.cards) {
    if (!seen.has(c.slug) && c.title) {
      out.push(c);
      seen.add(c.slug);
    }
  }
  return out;
}
