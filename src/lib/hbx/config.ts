// HBX Group (Hotelbeds) integration — client-safe configuration.
//
// This module contains NO credentials and NO network code: only suite
// definitions, endpoint paths, cache policy and feature-flag names. It is safe
// to import from routes and components. Secret *names* appear here; secret
// *values* are read exclusively inside server handlers via process.env.

export const HBX_SUPPLIER_ID = "hbx-group";
export const HBX_SUPPLIER_NAME = "HBX Group (Hotelbeds)";

export type HbxSuite = "hotels" | "activities" | "transfers";
export type HbxEnvironment = "test" | "live";

export const HBX_SUITES: HbxSuite[] = ["hotels", "activities", "transfers"];

export interface HbxSuiteConfig {
  suite: HbxSuite;
  label: string;
  summary: string;
  /** Secret names required for this suite — never their values. */
  apiKeySecret: string;
  apiSecretSecret: string;
  /** Feature flag env var; when set to "false" the suite is disabled. */
  featureFlag: string;
  /** Content (static) API base path, per environment host. */
  contentBasePath: string;
  /** Cache / booking (dynamic) API base path. */
  bookingBasePath: string;
  contentEndpoints: Record<string, string>;
  bookingEndpoints: Record<string, string>;
  /** Requests per second ceiling enforced client-side by the runtime. */
  rateLimitPerSecond: number;
  /** Static-content cache lifetime, seconds. */
  cacheTtlSeconds: number;
  timeoutMs: number;
  maxRetries: number;
  /** Page size used by the paginated content crawler. */
  pageSize: number;
}

export const HBX_HOSTS: Record<HbxEnvironment, string> = {
  test: "https://api.test.hotelbeds.com",
  live: "https://api.hotelbeds.com",
};

export const HBX_SUITE_CONFIG: Record<HbxSuite, HbxSuiteConfig> = {
  hotels: {
    suite: "hotels",
    label: "Hotels",
    summary:
      "Hotel Content API for the full HBX hotel portfolio: descriptions, facilities, images, boards, destinations and zones. Hotel Booking API is wired for availability once certified.",
    apiKeySecret: "HBX_HOTEL_API_KEY",
    apiSecretSecret: "HBX_HOTEL_SECRET",
    featureFlag: "HBX_HOTELS_ENABLED",
    contentBasePath: "/hotel-content-api/1.0",
    bookingBasePath: "/hotel-api/1.0",
    contentEndpoints: {
      hotels: "/hotels",
      hotelDetail: "/hotels/{code}/details",
      destinations: "/locations/destinations",
      countries: "/locations/countries",
      facilities: "/types/facilities",
      categories: "/types/categories",
      boards: "/types/boards",
      segments: "/types/segments",
    },
    bookingEndpoints: {
      status: "/status",
      availability: "/hotels",
      checkRate: "/checkrates",
      booking: "/bookings",
    },
    rateLimitPerSecond: 4,
    cacheTtlSeconds: 21600,
    timeoutMs: 30000,
    maxRetries: 3,
    pageSize: 1000,
  },
  activities: {
    suite: "activities",
    label: "Experiences & Activities",
    summary:
      "Activities Content API for the experiences portfolio plus the Activities cache/booking architecture for live availability and reservations once certified.",
    apiKeySecret: "HBX_ACTIVITY_API_KEY",
    apiSecretSecret: "HBX_ACTIVITY_SECRET",
    featureFlag: "HBX_ACTIVITIES_ENABLED",
    contentBasePath: "/activity-content-api/3.0",
    bookingBasePath: "/activity-api/3.0",
    contentEndpoints: {
      activities: "/activities",
      countries: "/countries/en",
      currencies: "/currencies/en",
      languages: "/languages",
      segments: "/segments/en",
    },

    bookingEndpoints: {
      availability: "/activities",
      detail: "/activities/details",
      booking: "/bookings",
    },
    rateLimitPerSecond: 4,
    cacheTtlSeconds: 10800,
    timeoutMs: 30000,
    maxRetries: 3,
    pageSize: 500,
  },
  transfers: {
    suite: "transfers",
    label: "Transfers",
    summary:
      "Transfers Cache API for static locations, terminals, routes, vehicles and content. Transfers Booking API is wired for live availability and booking once certified.",
    apiKeySecret: "HBX_TRANSFER_API_KEY",
    apiSecretSecret: "HBX_TRANSFER_SECRET",
    featureFlag: "HBX_TRANSFERS_ENABLED",
    contentBasePath: "/transfer-cache-api/1.0",
    bookingBasePath: "/transfer-api/1.0",
    contentEndpoints: {
      routes: "/routes",
      hotels: "/hotels",
      terminals: "/terminals",
      countries: "/masters/countries",
      destinations: "/masters/destinations",
      vehicles: "/masters/vehicles",
      categories: "/masters/categories",
    },
    bookingEndpoints: {
      availability: "/availability",
      booking: "/bookings",
    },
    rateLimitPerSecond: 4,
    cacheTtlSeconds: 21600,
    timeoutMs: 30000,
    maxRetries: 2,
    pageSize: 500,
  },
};

/** Every secret name the integration can consume. Values never leave the server. */
export const HBX_SECRET_NAMES: string[] = [
  ...HBX_SUITES.flatMap((s) => [
    HBX_SUITE_CONFIG[s].apiKeySecret,
    HBX_SUITE_CONFIG[s].apiSecretSecret,
  ]),
  "HBX_ENVIRONMENT",
];

export const HBX_MASTER_FEATURE_FLAG = "HBX_ENABLED";

/** Public catalogue sections rendered under HOTELS → HBX. */
export const HBX_SECTIONS: { id: HbxSuite; label: string; blurb: string }[] = [
  {
    id: "hotels",
    label: "Hotels",
    blurb: "HBX hotel portfolio with full content, facilities and imagery.",
  },
  {
    id: "activities",
    label: "Experiences",
    blurb: "Curated experiences and activities from the HBX Activities catalogue.",
  },
  {
    id: "transfers",
    label: "Transfers",
    blurb: "Private and shared transfer routes between airports, ports and hotels.",
  },
];
