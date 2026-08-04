// Resolves a catalogue product / journey to its place in the world hierarchy:
// Continent (region) → Country → State / Province → City / Destination.
// Purely client-safe lookups over the curated WORLD tree in destinations.ts.
import { WORLD, type CountryNode, type DestinationNode, type RegionNode } from "./destinations";

export interface GeoPath {
  region: RegionNode | null;
  country: CountryNode | null;
  state: string | null;
  destination: DestinationNode | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** Best-effort match of free-text location + country onto the world tree. */
export function locatePlace(location?: string, country?: string, region?: string): GeoPath {
  const hay = norm(`${location ?? ""} ${country ?? ""} ${region ?? ""}`);
  const parts = norm(location ?? "")
    .split(" ")
    .filter(Boolean);
  let best: GeoPath = { region: null, country: null, state: null, destination: null };

  for (const r of WORLD) {
    for (const c of r.countries) {
      const countryHit = hay.includes(norm(c.name));
      for (const dst of c.destinations) {
        if (hay.includes(norm(dst.name))) {
          return { region: r, country: c, state: dst.state ?? c.states[0] ?? null, destination: dst };
        }
      }
      if (countryHit && !best.country) {
        best = { region: r, country: c, state: null, destination: null };
      }
    }
  }
  if (best.country) return best;

  // Fall back to a loose token match against destination keywords.
  for (const r of WORLD)
    for (const c of r.countries)
      for (const dst of c.destinations)
        if (dst.keywords.some((k) => parts.includes(norm(k))))
          return { region: r, country: c, state: dst.state ?? null, destination: dst };

  const regionHit = WORLD.find((r) => hay.includes(norm(r.name.split(" ")[0])));
  return { region: regionHit ?? null, country: null, state: null, destination: null };
}

/** Sibling cities inside the same state (or country when no state is known). */
export function siblingCities(path: GeoPath, limit = 8): DestinationNode[] {
  if (!path.country) return [];
  return path.country.destinations
    .filter((d) => d.slug !== path.destination?.slug)
    .filter((d) => (path.state ? (d.state ?? null) === path.state || !d.state : true))
    .slice(0, limit);
}

/** Other countries in the same continent. */
export function siblingCountries(path: GeoPath, limit = 8): CountryNode[] {
  if (!path.region) return [];
  return path.region.countries.filter((c) => c.slug !== path.country?.slug).slice(0, limit);
}