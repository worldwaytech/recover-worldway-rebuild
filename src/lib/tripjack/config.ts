// TripJack integration — client-safe configuration only.
//
// No credential material appears in this file. The single UAT credential is
// read from process.env["TRIPJACK_UAT_API_KEY"] inside server-only code
// (client.server.ts) and is shared by both the Cabs and TripSafe suites.
//
// UAT ONLY: there is deliberately no production host or production flag here.

export const TRIPJACK_UAT_BASE_URL = "https://apitest.tripjack.com";

/** Name of the shared server-side secret. Never the value. */
export const TRIPJACK_API_KEY_SECRET = "TRIPJACK_UAT_API_KEY";

export const TRIPJACK_TIMEOUT_MS = 60_000;

export type TripjackSuite = "cabs" | "tripsafe";

/**
 * Capabilities requested for each suite. `path` is the documented TripJack
 * endpoint. It stays `null` until the corresponding operation is confirmed
 * from the official Cabs API v2 / TripSafe API v5.1 specification — the
 * client refuses to call an unmapped capability rather than guessing a URL.
 */
export type TripjackCapability = {
  key: string;
  label: string;
  method: "GET" | "POST";
  path: string | null;
  /** True when the operation mutates supplier state (book / pay / cancel). */
  mutating: boolean;
};

export const TRIPJACK_CABS_CAPABILITIES: TripjackCapability[] = [
  { key: "location-search", label: "Location Search", method: "POST", path: null, mutating: false },
  { key: "location-latlong", label: "Lat/Long Lookup", method: "POST", path: null, mutating: false },
  { key: "airport-transfer", label: "Airport Transfer Search", method: "POST", path: null, mutating: false },
  { key: "round-trip", label: "Round Trip Search", method: "POST", path: null, mutating: false },
  { key: "outstation", label: "Outstation Search", method: "POST", path: null, mutating: false },
  { key: "local", label: "Local Search", method: "POST", path: null, mutating: false },
  { key: "quote", label: "Quotes / Revalidation", method: "POST", path: null, mutating: false },
  { key: "book", label: "Booking", method: "POST", path: null, mutating: true },
  { key: "payment", label: "Payment", method: "POST", path: null, mutating: true },
  { key: "booking-details", label: "Booking Details", method: "POST", path: null, mutating: false },
  { key: "tracking", label: "Tracking", method: "POST", path: null, mutating: false },
  { key: "amend", label: "Amendment", method: "POST", path: null, mutating: true },
  { key: "cancel", label: "Cancellation", method: "POST", path: null, mutating: true },
  { key: "embed", label: "Embedded Booking", method: "POST", path: null, mutating: false },
];

export const TRIPJACK_TRIPSAFE_CAPABILITIES: TripjackCapability[] = [
  { key: "search", label: "Search", method: "POST", path: null, mutating: false },
  { key: "review", label: "Review", method: "POST", path: null, mutating: false },
  { key: "book", label: "Booking", method: "POST", path: null, mutating: true },
  { key: "booking-details", label: "Booking Details", method: "POST", path: null, mutating: false },
  { key: "amend", label: "Amendment", method: "POST", path: null, mutating: true },
  { key: "cancel", label: "Cancellation", method: "POST", path: null, mutating: true },
  { key: "embed", label: "Embedded Flow", method: "POST", path: null, mutating: false },
  { key: "student", label: "Student Cover", method: "POST", path: null, mutating: false },
  { key: "amt", label: "AMT Cover", method: "POST", path: null, mutating: false },
];

export const TRIPJACK_CAPABILITIES: Record<TripjackSuite, TripjackCapability[]> = {
  cabs: TRIPJACK_CABS_CAPABILITIES,
  tripsafe: TRIPJACK_TRIPSAFE_CAPABILITIES,
};

export const TRIPJACK_SUITE_LABEL: Record<TripjackSuite, string> = {
  cabs: "Cab Services",
  tripsafe: "TripSafe Services",
};

export function tripjackCapability(
  suite: TripjackSuite,
  key: string,
): TripjackCapability | null {
  return TRIPJACK_CAPABILITIES[suite].find((c) => c.key === key) ?? null;
}
