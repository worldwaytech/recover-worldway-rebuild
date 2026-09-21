// RateHawk / Emerging Travel Group (ETG) API v3 — client-safe configuration.
//
// No credentials and no network code live here: only hosts, documented endpoint
// paths, limits and secret NAMES. Safe to import from routes and components.
// Documentation: https://docs.emergingtravel.com/docs/fundamentals/authorization/

export const RATEHAWK_SUPPLIER_ID = "ratehawk";
export const RATEHAWK_SUPPLIER_NAME = "RateHawk (Emerging Travel Group)";
export const RATEHAWK_DOCS_URL = "https://docs.emergingtravel.com/docs/affiliate-api/";

export type RatehawkEnvironment = "sandbox" | "test" | "production";

/** Documented hosts. `test` and `production` share one host per ETG docs. */
export const RATEHAWK_HOSTS: Record<RatehawkEnvironment, string> = {
  sandbox: "https://api-sandbox.ratehawk.com",
  test: "https://api.ratehawk.com",
  production: "https://api.ratehawk.com",
};

/** HTTP Basic: KEY_ID is the username, API_KEY the password. Names only. */
export const RATEHAWK_SECRET_NAMES = ["RATEHAWK_KEY_ID", "RATEHAWK_API_KEY"] as const;
export const RATEHAWK_ENV_VAR = "RATEHAWK_ENVIRONMENT";
export const RATEHAWK_FEATURE_FLAG = "RATEHAWK_ENABLED";

export const RATEHAWK_BASE_PATH = "/api/b2b/v3";

/** Every path is taken verbatim from the ETG v3 documentation. */
export const RATEHAWK_ENDPOINTS = {
  /** Contract/credential probe — cheapest authenticated read. */
  contract: "/general/contract/data/info/",
  multicomplete: "/search/multicomplete/",
  searchRegion: "/search/serp/region/",
  searchHotels: "/search/serp/hotels/",
  hotelPage: "/search/hp/",
  hotelInfo: "/hotel/info/",
  prebook: "/hotel/prebook/",
  bookingForm: "/hotel/order/booking/form/",
  bookingFinish: "/hotel/order/booking/finish/",
  bookingStatus: "/hotel/order/booking/finish/status/",
  orderInfo: "/hotel/order/info/",
  cancel: "/hotel/order/cancel/",
} as const;

export type RatehawkOperation = keyof typeof RATEHAWK_ENDPOINTS;

/** Per-operation timeouts. Prebook needs ≥30s per ETG docs; 60s recommended. */
export const RATEHAWK_TIMEOUTS_MS: Record<RatehawkOperation, number> = {
  contract: 15_000,
  multicomplete: 15_000,
  searchRegion: 45_000,
  searchHotels: 45_000,
  hotelPage: 45_000,
  hotelInfo: 30_000,
  prebook: 60_000,
  bookingForm: 30_000,
  bookingFinish: 60_000,
  bookingStatus: 20_000,
  orderInfo: 30_000,
  cancel: 45_000,
};

export const RATEHAWK_LIMITS = {
  rateLimitPerSecond: 4,
  maxRetries: 2,
  /** The ETG booking form expires 60 minutes after creation. */
  bookingFormTtlMinutes: 60,
  /** Recommended rate lifetime from hotelpage. */
  rateLifetimeMinutes: 30,
  /** Sandbox caps hotels.rates at 5 items. */
  sandboxMaxRates: 5,
} as const;

/**
 * The ETG *test* key may only book hid 8473727 and creates REAL bookings with
 * financial responsibility. Sandbox keys are safe. We never book on test/
 * production keys from the certification runner.
 */
export const RATEHAWK_TEST_HOTEL_HID = 8473727;

export const RATEHAWK_CAPABILITIES = [
  "catalog",
  "availability",
  "pricing",
  "prebook",
  "booking",
  "booking-status",
  "order-info",
  "cancellation",
] as const;

export function ratehawkEndpointUrl(host: string, operation: RatehawkOperation): string {
  return `${host}${RATEHAWK_BASE_PATH}${RATEHAWK_ENDPOINTS[operation]}`;
}
