// Client-safe helpers joining verified routes with the aircraft catalogue.
// No prices here: pricing is live-only (partner quotes) or, later, an approved rate sheet.
import { JET_AIRPORTS, JET_ROUTES, type JetAirport, type JetRoute } from "./jet-routes.data";
import { AIRCRAFT_CATALOGUE, type CatalogueAircraft } from "./aircraft-catalogue.data";

export { JET_AIRPORTS, JET_ROUTES, AIRCRAFT_CATALOGUE };
export type { JetAirport, JetRoute, CatalogueAircraft };

export function routeBySlug(slug: string): JetRoute | undefined {
  return JET_ROUTES.find((r) => r.slug === slug.toLowerCase());
}

export function airport(code: string): JetAirport {
  const a = JET_AIRPORTS[code];
  if (!a) throw new Error(`Unknown airport ${code}`);
  return a;
}

export function routeTitle(r: JetRoute): string {
  return `${airport(r.from).city} to ${airport(r.to).city}`;
}

/**
 * Aircraft whose published range covers the great-circle distance with a 10%
 * margin. Published ranges assume ideal conditions, so a nonstop is always
 * subject to operator confirmation (winds, payload, runway).
 */
export function aircraftForDistance(distanceNm: number, passengers = 1): { nonstop: CatalogueAircraft[]; withStop: CatalogueAircraft[] } {
  const fits = AIRCRAFT_CATALOGUE.filter((a) => a.maxPassengers >= passengers);
  const nonstop = fits.filter((a) => a.rangeNm !== null && a.rangeNm >= distanceNm * 1.1);
  const withStop = fits.filter((a) => a.rangeNm !== null && a.rangeNm < distanceNm * 1.1);
  const by = (x: CatalogueAircraft, y: CatalogueAircraft) => (x.rangeNm ?? 0) - (y.rangeNm ?? 0);
  return { nonstop: nonstop.sort(by), withStop: withStop.sort(by) };
}

export function routesFor(slug: string, limit = 6): JetRoute[] {
  const a = AIRCRAFT_CATALOGUE.find((x) => x.slug === slug);
  if (!a || a.rangeNm === null) return [];
  return JET_ROUTES.filter((r) => a.rangeNm! >= r.distanceNm * 1.1)
    .sort((x, y) => y.distanceNm - x.distanceNm)
    .slice(0, limit);
}

export function searchLink(r: Pick<JetRoute, "from" | "to">, aircraft?: string) {
  return { to: "/private-jets" as const, search: { from: r.from, to: r.to, ...(aircraft ? { aircraft } : {}) } };
}
