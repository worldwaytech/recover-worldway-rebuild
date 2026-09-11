// Crystal World Cruise catalogue (2027 / 2028 / 2029).
//
// The authorised AKTG Shopping API entitlement carries Crystal's segment
// voyages only — the full World Cruises are not distributed to this ApiKey
// (product lookup returns an empty list and the availability operation returns
// a supplier 500). These records are therefore imported from Crystal's own
// official voyage pages by `scripts/crystal-world-cruise-import.ts` and merged
// into the existing Crystal catalogue as enquiry-only voyages: real itineraries,
// real published fares, no supplier hold or instant confirmation.
import type { CrystalFare, CrystalVoyage, CruiseStyle, SuiteCategory } from "./types";
import { CRYSTAL_SUPPLIER_ID, CRYSTAL_SHIPS } from "./content";
import { CRYSTAL_WORLD_CRUISE_RECORDS } from "./world-cruises.data";

export interface CrystalWorldCruiseRecord {
  year: number;
  code: string;
  voyageId?: number;
  title: string;
  voyageName?: string;
  description?: string;
  ship: string;
  shipCode?: string;
  nights: number;
  embarkDate: string;
  debarkDate: string;
  embarkPort: string;
  debarkPort: string;
  countries?: number;
  priceFrom?: number;
  currency: string;
  media: {
    hero?: string;
    gallery: string[];
    mapSvg?: string;
    mapPng?: string;
    itineraryPdf?: string;
  };
  sourceUrl: string;
  itinerary: {
    day: number;
    date?: string;
    port: string;
    portCode?: string;
    country?: string;
    arrive?: string;
    depart?: string;
    overnight?: boolean;
    dressCode?: string;
  }[];
  suites: {
    category: string;
    categoryCode?: string;
    priceDouble: number;
    priceSingle?: number;
    priceChild?: number;
    portCharge?: number;
    maxCapacity?: number;
    availability: number;
  }[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function suiteCategoryOf(label: string): SuiteCategory {
  const v = label.toLowerCase();
  if (v.includes("residence") || v.includes("owner")) return "residence";
  if (v.includes("penthouse")) return "penthouse";
  if (v.includes("expedition") || v.includes("zodiac")) return "expedition-suite";
  if (v.includes("veranda") || v.includes("balcon") || v.includes("panorama")) return "balcony";
  return "ocean-view";
}

function fareOf(
  s: CrystalWorldCruiseRecord["suites"][number],
  currency: string,
  fareType: string,
): CrystalFare {
  return {
    suiteCategory: suiteCategoryOf(s.category),
    gradeId: s.categoryCode,
    gradeName: s.category
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim(),
    price: s.priceDouble,
    priceSingle: s.priceSingle,
    priceChild: s.priceChild,
    portCharge: s.portCharge,
    maxCapacity: s.maxCapacity,
    fareType,
    currency,
    available: s.availability > 0 ? true : undefined,
    availabilityCount: s.availability > 0 ? s.availability : undefined,
    availabilityLabel: s.availability > 0 ? `${s.availability} suites open` : "On request",
  };
}

function toVoyage(r: CrystalWorldCruiseRecord): CrystalVoyage {
  const shipSlug = slugify(r.ship);
  const ship = CRYSTAL_SHIPS.find((s) => s.slug === shipSlug);
  const fareType = `${r.year} World Cruise`;
  const fares = r.suites.map((s) => fareOf(s, r.currency, fareType));
  const countries = [
    ...new Set(r.itinerary.map((d) => d.country ?? "").filter((c): c is string => Boolean(c))),
  ];
  const prices = fares.map((f) => f.price).filter((n) => n > 0);
  const styles: CruiseStyle[] = ["ocean", "world-cruise", "grand-voyage"];
  const roundTrip = r.embarkPort === r.debarkPort;

  return {
    code: r.code,
    voyageId: r.voyageId,
    title: `${r.year} World Cruise — ${r.title}`,
    subtitle: `${r.ship} · ${r.nights} nights · departs ${r.embarkDate}`,
    description: r.description,
    shipSlug,
    shipName: r.ship,
    shipCode: r.shipCode,
    destinationSlug: "world-cruise",
    destinationName: "World Cruise",
    region: "Global",
    countries,
    embarkPort: r.embarkPort,
    disembarkPort: r.debarkPort,
    nights: r.nights,
    departureDate: r.embarkDate,
    returnDate: r.debarkDate,
    styles,
    voyageType: "World Cruise",
    itinerary: r.itinerary.map((d) => ({
      day: d.day,
      date: d.date,
      port: d.port,
      country: d.country,
      arrive: d.arrive,
      depart: d.depart,
      summary:
        [d.overnight ? "Overnight in port" : undefined, d.dressCode ? `Dress: ${d.dressCode}` : undefined]
          .filter(Boolean)
          .join(" · ") || undefined,
    })),
    fares,
    priceFrom: prices.length ? Math.min(...prices) : r.priceFrom,
    currency: r.currency,
    promotions: [],
    inclusions: [],
    media: {
      hero: r.media.hero ?? ship?.hero,
      gallery: [...new Set([...r.media.gallery, ...(ship?.gallery ?? [])])],
      mapSvg: r.media.mapSvg,
      mapPng: r.media.mapPng,
      itineraryPdf: r.media.itineraryPdf,
    },
    availability: fares.some((f) => f.available) ? "open" : "unknown",
    dataSource: "brochure",
    bookingMode: "enquiry",
    sourceUrl: r.sourceUrl,
    supplierId: CRYSTAL_SUPPLIER_ID,
    updatedAt: new Date().toISOString(),
    fareType,
    // Round-trip flag is reflected in the subtitle only; kept for clarity.
    voyageClass: roundTrip ? "Round trip" : undefined,
  };
}

/** Real, published Crystal World Cruises normalised into Worldway voyages. */
export function crystalWorldCruises(): CrystalVoyage[] {
  return CRYSTAL_WORLD_CRUISE_RECORDS.map(toVoyage).sort((a, b) =>
    a.departureDate.localeCompare(b.departureDate),
  );
}

/** World Cruises departing in the given calendar years (default 2027–2029). */
export function crystalWorldCruisesByYear(years: number[] = [2027, 2028, 2029]): CrystalVoyage[] {
  return crystalWorldCruises().filter((v) => years.includes(Number(v.departureDate.slice(0, 4))));
}
