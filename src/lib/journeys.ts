// Journey registry — the client-safe read layer over the enterprise journey
// model. Today it is fed by the demonstration dataset; once a connector has
// credentials the same records arrive from `syncPartnerCatalogue` in exactly
// this shape, so no consumer needs to change.
import { ALL_DEMO_JOURNEYS } from "./partners/demo-journeys-verticals";
import type { Journey } from "./partners/types";
import type { CatalogueProduct } from "./catalogue-types";

export type { Journey };

export function allJourneys(): Journey[] {
  return ALL_DEMO_JOURNEYS;
}

export function getJourney(code: string): Journey | null {
  return allJourneys().find((j) => j.code.toLowerCase() === code.toLowerCase()) ?? null;
}

export interface JourneyFilters {
  region?: string;
  country?: string;
  destination?: string;
  collectionKind?: string;
  partnerId?: string;
  interest?: string;
  q?: string;
}

export function filterJourneys(f: JourneyFilters, limit?: number): Journey[] {
  const q = f.q?.trim().toLowerCase();
  const out = allJourneys().filter((j) => {
    if (f.region && j.regionSlug !== f.region) return false;
    if (f.country && j.countrySlug !== f.country) return false;
    if (f.destination && !j.destinationSlugs.includes(f.destination)) return false;
    if (f.collectionKind && j.collectionKind !== f.collectionKind) return false;
    if (f.partnerId && j.partnerId !== f.partnerId) return false;
    if (f.interest && !j.interests.includes(f.interest)) return false;
    if (q) {
      const hay = [
        j.title,
        j.subtitle,
        j.country,
        j.region,
        j.partnerName,
        j.collection,
        ...j.cities,
        ...j.highlights,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return limit ? out.slice(0, limit) : out;
}

export function journeyPartners(): { id: string; name: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const j of allJourneys()) {
    const hit = map.get(j.partnerId) ?? { id: j.partnerId, name: j.partnerName, count: 0 };
    hit.count += 1;
    map.set(j.partnerId, hit);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function nextDeparture(j: Journey) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    j.departures.find((d) => d.date >= today && d.availability !== "sold-out") ??
    j.departures[0] ??
    null
  );
}

export function formatJourneyPrice(j: Journey): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: j.currency,
    maximumFractionDigits: 0,
  }).format(j.priceFrom);
}

export function relatedJourneys(j: Journey, limit = 3): Journey[] {
  return allJourneys()
    .filter((x) => x.code !== j.code)
    .map((x) => {
      let s = 0;
      if (x.countrySlug === j.countrySlug) s += 4;
      if (x.regionSlug === j.regionSlug) s += 3;
      if (x.collectionKind === j.collectionKind) s += 2;
      s += x.interests.filter((i) => j.interests.includes(i)).length;
      return { x, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}

/** Adapts a journey to the shared catalogue product shape used by the
 *  quote/booking dialog and cross-collection components. */
export function journeyToProduct(j: Journey): CatalogueProduct {
  return {
    slug: j.code.toLowerCase(),
    subtitle: j.subtitle,
    highlights: j.highlights,
    title: j.title,
    location: `${j.cities[0] ?? j.country}, ${j.country}`,
    description: j.subtitle,
    image: j.media.hero,
    priceFrom: j.priceFrom,
    currency: j.currency,
    duration: `${j.durationDays} days`,
    tags: j.interests,
    region: j.region,
    kind: j.collectionKind as CatalogueProduct["kind"],
    collectionTitle: j.collection,
    detailBase: "/journeys",
    supplier: j.partnerName,
    supplierStatus: "on-request",
    rating: j.rating,
    reviewCount: j.reviewCount,
    luxuryLevel: j.luxuryLevel,
    travelStyles: [j.groupStyle],
    interests: j.interests,
    durationNights: j.durationNights,
    familyFriendly: j.interests.includes("family"),
    accessible: false,
    groupSize: j.groupStyle === "private" || j.groupStyle === "charter" ? "private" : "small-group",
    departureMonths: j.departures.map((d) => d.date.slice(0, 7)),
    country: j.country,
  } as CatalogueProduct;
}
