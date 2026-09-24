// Bókun + OCTO integration — client-safe configuration.
//
// NO credentials and NO network code here: only hosts, endpoint paths, cache
// policy and the secret *names* (never values). Secret values are read
// exclusively inside server handlers via process.env.

export const BOKUN_SUPPLIER_ID = "bokun";
export const BOKUN_SUPPLIER_LABEL = "Tours Marketplace"; // customer-facing wording

export type BokunEnvironment = "test" | "live";

export const BOKUN_HOSTS: Record<BokunEnvironment, string> = {
  test: "https://api.bokun.dev",
  live: "https://api.bokun.is",
};

/** Secret names — values never appear in code. */
export const BOKUN_SECRETS = {
  accessKey: "BOKUN_ACCESS_KEY",
  secretKey: "BOKUN_SECRET_KEY",
  octoToken: "BOKUN_OCTO_TOKEN",
} as const;

/**
 * Bookings are refused unless this env flag is explicitly "true". It is only
 * set after the credential environment (TEST vs LIVE) has been verified and
 * the operator has confirmed bookings may be created. Set BOKUN_BOOKING_ENABLED=true
 * in the secret store to unlock.
 */
export const BOKUN_BOOKING_FLAG = "BOKUN_BOOKING_ENABLED";

/** Env var recording the verified environment after the non-destructive probe. */
export const BOKUN_ENV_FLAG = "BOKUN_ENVIRONMENT";

export const BOKUN_REST_ENDPOINTS = {
  search: "/activity.json/search",
  product: "/activity.json/{id}",
  availabilities: "/activity.json/{id}/availabilities",
} as const;

export const BOKUN_OCTO_ENDPOINTS = {
  products: "/octo/v1/products",
  availability: "/octo/v1/availability",
  bookings: "/octo/v1/bookings",
  booking: "/octo/v1/bookings/{uuid}",
} as const;

export const BOKUN_LIMITS = {
  timeoutMs: 30_000,
  bookingTimeoutMs: 120_000,
  maxRetries: 2,
  searchPageSize: 24,
  catalogueSyncPageSize: 100,
  catalogueMaxPages: 50,
  cacheTtlSeconds: 900,
} as const;
