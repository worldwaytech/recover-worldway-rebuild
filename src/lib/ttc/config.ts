// TTC (The Travel Corporation) integration — client-safe configuration.
//
// Contains NO credentials and NO network code: brand definitions, approved
// content sources, official API endpoint map, feature-flag and secret *names*.
// Safe to import from routes and components. Secret values are read only inside
// server handlers via process.env.

export const TTC_SUPPLIER_ID = "ttc-group";
export const TTC_SUPPLIER_NAME = "The Travel Corporation (TTC)";

/** Brand codes exactly as published by the official TTC API V4. */
export type TtcBrand =
  | "trafalgar"
  | "insightvacations"
  | "luxurygold"
  | "costsaver"
  | "contiki"
  | "aatkings"
  | "brendanvacations";

export interface TtcBrandConfig {
  brand: TtcBrand;
  label: string;
  blurb: string;
  /** Approved public content source for catalogue build-out. */
  site: string;
  /** Locale path segments in preference order; the first available is canonical. */
  locales: string[];
  /** Path segment that precedes the tour slug on the brand website. */
  tourPathSegment: string;
}

export const TTC_BRANDS: Record<TtcBrand, TtcBrandConfig> = {
  trafalgar: {
    brand: "trafalgar",
    label: "Trafalgar",
    blurb: "Guided journeys with Travel Directors, insider Be My Guest dining and iconic sightseeing.",
    site: "https://www.trafalgar.com",
    locales: ["en-us", "en-gb", "en-eu", "en-ca", "en-au", "en-nz", "en-sg", "en-za"],
    tourPathSegment: "tours",
  },
  insightvacations: {
    brand: "insightvacations",
    label: "Insight Vacations",
    blurb: "Premium escorted journeys with extra legroom coaches and hand-picked hotels.",
    site: "https://www.insightvacations.com",
    locales: ["en-us", "en-gb", "en-eu", "en-ca", "en-au", "en-nz", "en-sg", "en-za"],
    tourPathSegment: "tours",
  },
  luxurygold: {
    brand: "luxurygold",
    label: "Luxury Gold",
    blurb: "Small-group luxury journeys with a dedicated Travelling Concierge.",
    site: "https://www.luxurygold.com",
    locales: ["en-us", "en-gb", "en-eu", "en-ca", "en-au", "en-nz", "en-sg", "en-za"],
    tourPathSegment: "tours",
  },
  costsaver: {
    brand: "costsaver",
    label: "Costsaver",
    blurb: "Value guided holidays covering the essentials with free time to explore.",
    site: "https://www.costsaver.com",
    locales: ["en-us", "en-gb", "en-au", "en-nz", "en-ca"],
    tourPathSegment: "tours",
  },
  contiki: {
    brand: "contiki",
    label: "Contiki",
    blurb: "Social travel for 18–35s across Europe, Asia, the Americas and beyond.",
    site: "https://www.contiki.com",
    locales: ["en-us", "en-gb", "en-eu", "en-ca", "en-au", "en-nz", "en-sg", "en-za"],
    tourPathSegment: "tours",
  },
  aatkings: {
    brand: "aatkings",
    label: "AAT Kings",
    blurb: "Australia and New Zealand guided holidays, short breaks and day tours.",
    site: "https://www.aatkings.com",
    locales: ["en-au", "en-us", "en-gb", "en-nz", "en-ca", "en-eu"],
    tourPathSegment: "tours",
  },
  brendanvacations: {
    brand: "brendanvacations",
    label: "Brendan Vacations",
    blurb: "Ireland and Scotland specialists — guided, private and self-drive journeys.",
    site: "https://www.brendanvacations.com",
    locales: ["en-us", "en-ca", "en-au", "en-nz"],
    tourPathSegment: "tours",
  },
};

export const TTC_BRAND_ORDER: TtcBrand[] = [
  "trafalgar",
  "insightvacations",
  "luxurygold",
  "costsaver",
  "contiki",
  "aatkings",
  "brendanvacations",
];

export function isTtcBrand(value: string): value is TtcBrand {
  return Object.prototype.hasOwnProperty.call(TTC_BRANDS, value);
}

// ------------------------------------------------------------- official API

/** Selling regions published by the official TTC API V4. */
export type TtcRegion = "us" | "uk" | "eu" | "ca" | "au" | "nz" | "sg" | "za" | "zz";

export const TTC_REGIONS: TtcRegion[] = ["us", "uk", "eu", "ca", "au", "nz", "sg", "za", "zz"];

/**
 * Documented TTC API V4 paths (https://api.ttc.com/api-spec). Only paths that
 * exist in the published specification appear here; none are invented.
 */
export const TTC_API = {
  baseUrl: "https://api.ttc.com",
  /** Explicit version negotiation header value required by the documentation. */
  acceptHeader: "application/vnd.ttc.v4+json",
  /** HTTP Basic username documented for API-token authentication. */
  basicUsername: "token",
  timeoutMs: 30000,
  maxRetries: 3,
  rateLimitPerSecond: 4,
  endpoints: {
    /** Index of tours for a brand. */
    brandIndex: "/brands/{brand}",
    /** Full content, departures, prices and accommodation rules for a brand. */
    brandTours: "/brands/{brand}/tours",
    tour: "/brands/{brand}/tours/{tourId}",
    tourOption: "/brands/{brand}/tours/{tourId}/options/{optionId}",
    marketVariation:
      "/brands/{brand}/tours/{tourId}/options/{optionId}/marketvariations/{variationCode}",
    tourDiscounts: "/brands/{brand}/tours/{tourId}/discounts",
    optionAvailability: "/brands/{brand}/tours/{tourId}/options/{optionId}/availability",
    departureAvailability:
      "/brands/{brand}/tours/{tourId}/options/{optionId}/departures/{departureId}/availability",
    departureHotels:
      "/brands/{brand}/tours/{tourId}/options/{optionId}/departures/{departureId}/availability/hotels",
    departureQuote:
      "/brands/{brand}/tours/{tourId}/options/{optionId}/departures/{departureId}/quote",
    departureBook:
      "/brands/{brand}/tours/{tourId}/options/{optionId}/departures/{departureId}/book",
    booking: "/booking",
    bookingById: "/booking/{bkgId}",
    bookingHold: "/bookings/{bookingReference}/hold",
    bookingCancel: "/bookings/{bookingReference}/cancel",
    bookingRetrieve: "/bookings/{bookingReference}",
    countries: "/countries",
  },
} as const;

/** Secret names the integration can consume. Values never leave the server. */
export const TTC_SECRET_NAMES = ["TTC_API_TOKEN", "TTC_CLIENT_ID", "TTC_AGENT_ID"] as const;

/** Master flag. Live pricing/availability/booking stay closed until certified. */
export const TTC_FEATURE_FLAGS = {
  api: "TTC_API_ENABLED",
  booking: "TTC_BOOKING_ENABLED",
} as const;

/** Content-import tuning for the approved website source. */
export const TTC_CONTENT = {
  /** URLs requested per batch-extraction job. */
  batchSize: 8,
  /** Extraction batches processed concurrently. */
  concurrency: 1,
  /** Firecrawl polling interval, milliseconds. */
  pollIntervalMs: 6000,
  /** Maximum wait per batch job, milliseconds. */
  batchTimeoutMs: 20 * 60 * 1000,
  maxRetries: 3,
  mapLimit: 5000,
} as const;

// ------------------------------------------------------------------ display

export const TTC_SORT_OPTIONS = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "duration-asc", label: "Duration: shortest" },
  { id: "duration-desc", label: "Duration: longest" },
  { id: "name-asc", label: "Name: A–Z" },
  { id: "rating-desc", label: "Traveller rating" },
] as const;

export type TtcSort = (typeof TTC_SORT_OPTIONS)[number]["id"];

export function ttcTourPath(brand: string, slug: string): string {
  return `/ttc/${brand}/${slug}`;
}
