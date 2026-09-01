// TripJack integration — client-safe configuration only.
//
// No credential material appears in this file. The single UAT credential is
// read from process.env["TRIPJACK_UAT_API_KEY"] inside server-only code
// (client.server.ts) and is shared by both the Cabs and TripSafe suites.
//
// UAT ONLY: there is deliberately no production host or production flag here.
//
// Every path below is transcribed verbatim from the supplier documentation:
//   * TripJack Cabs API Documentation v2.0 (20-02-2026), section 2 & 3
//   * TripJack TripSafe API Documentation v5.1 (13-02-2026), section 2 & 3

export const TRIPJACK_UAT_BASE_URL = "https://apitest.tripjack.com";

/** Name of the shared server-side secret. Never the value. */
export const TRIPJACK_API_KEY_SECRET = "TRIPJACK_UAT_API_KEY";

export const TRIPJACK_TIMEOUT_MS = 60_000;

export type TripjackSuite = "cabs" | "tripsafe";

/**
 * Capabilities requested for each suite. `path` is the documented TripJack
 * endpoint; it stays `null` only where the supplier documentation defines no
 * dedicated endpoint (e.g. Cabs tracking, which is delivered as a link inside
 * the booking payload). The client refuses to call an unmapped capability
 * rather than guessing a URL.
 */
export type TripjackCapability = {
  key: string;
  label: string;
  method: "GET" | "POST";
  path: string | null;
  /** True when the operation mutates supplier state (book / pay / cancel). */
  mutating: boolean;
  /** Documentation reference for auditability. */
  doc: string;
  /** Notes shown in staff diagnostics when an operation has no endpoint. */
  note?: string;
};

export const TRIPJACK_CABS_CAPABILITIES: TripjackCapability[] = [
  {
    key: "location-search",
    label: "Location Search",
    method: "POST",
    path: "/cabs/v1/google-places",
    mutating: false,
    doc: "Cabs v2 §3 Location Search API",
  },
  {
    key: "location-latlong",
    label: "Lat/Long Lookup",
    method: "POST",
    path: "/cabs/v1/get-lat-long",
    mutating: false,
    doc: "Cabs v2 §3 Get Lat Long API",
  },
  {
    key: "quote",
    label: "Quotes (Airport Transfer / Round Trip / Outstation / Local)",
    method: "POST",
    path: "/cabs/v2/quotes",
    mutating: false,
    doc: "Cabs v2 §3.1–3.4 Quotes API",
  },
  {
    key: "book",
    label: "Booking",
    method: "POST",
    path: "/cabs/v2/booking",
    mutating: true,
    doc: "Cabs v2 §3 Booking API",
  },
  {
    key: "payment",
    label: "Payment",
    method: "POST",
    path: "/cabs/v1/payment/create",
    mutating: true,
    doc: "Cabs v2 §3 Payment API",
  },
  {
    key: "booking-details",
    label: "Booking Details",
    method: "GET",
    path: "/cabs/v1/booking/details",
    mutating: false,
    doc: "Cabs v2 §3 Get Booking Details API",
  },
  {
    key: "amend-charges",
    label: "Amendment Charges",
    method: "GET",
    path: "/cabs/v1/amendment",
    mutating: false,
    doc: "Cabs v2 §3 Get Amendment Charges API",
  },
  {
    key: "cancel",
    label: "Cancellation",
    method: "POST",
    path: "/cabs/v1/amendment",
    mutating: true,
    doc: "Cabs v2 §3 Amendment Cancellation API",
  },
  {
    key: "embed",
    label: "Embedded Booking (with flights)",
    method: "POST",
    path: "/cabs/v2/embedded/booking",
    mutating: true,
    doc: "Cabs v2 §3 Embedded API",
  },
  {
    key: "tracking",
    label: "Ride Tracking",
    method: "GET",
    path: null,
    mutating: false,
    doc: "Cabs v2 §3 Booking API response (trackingLink)",
    note:
      "TripJack exposes tracking as the trackingLink field on the booking and booking-details payloads; there is no separate tracking endpoint in the documentation.",
  },
];

export const TRIPJACK_TRIPSAFE_CAPABILITIES: TripjackCapability[] = [
  {
    key: "search",
    label: "Search",
    method: "POST",
    path: "/insurance/v1/searchquery-list",
    mutating: false,
    doc: "TripSafe v5.1 §3 Search API",
  },
  {
    key: "review",
    label: "Review",
    method: "POST",
    path: "/insurance/v1/review",
    mutating: false,
    doc: "TripSafe v5.1 §3 Review API",
  },
  {
    key: "book",
    label: "Booking",
    method: "POST",
    path: "/oms/v1/insurance/book",
    mutating: true,
    doc: "TripSafe v5.1 §3 Booking API",
  },
  {
    key: "booking-details",
    label: "Booking Details",
    method: "POST",
    path: "/oms/v1/insurance/booking-details",
    mutating: false,
    doc: "TripSafe v5.1 §3 Booking-Details API",
  },
  {
    key: "amend",
    label: "Raise Amendment",
    method: "POST",
    path: "/oms/v1/ins/amendment/raise",
    mutating: true,
    doc: "TripSafe v5.1 §3 Raise-Amendments API",
  },
  {
    key: "cancel",
    label: "Confirm Cancellation",
    method: "POST",
    path: "/oms/v1/ins/amendment/confirm-insurance-cancellation",
    mutating: true,
    doc: "TripSafe v5.1 §3 Cancellation API",
  },
  {
    key: "embed",
    label: "Embedded Flow (with flights)",
    method: "POST",
    path: "/insurance/v1/searchquery-list",
    mutating: false,
    doc: "TripSafe v5.1 §3 Embedded API Integration (isef + bid on Search, refid on Review)",
  },
  {
    key: "student",
    label: "Student Cover",
    method: "POST",
    path: "/insurance/v1/searchquery-list",
    mutating: false,
    doc: 'TripSafe v5.1 §3 Student API (ict="STUDENT" + cd)',
  },
  {
    key: "amt",
    label: "Annual Multi-Trip Cover",
    method: "POST",
    path: "/insurance/v1/searchquery-list",
    mutating: false,
    doc: 'TripSafe v5.1 §3 AMT API (ict="AMT" + adr)',
  },
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

/** Documented TripJack journey types (Cabs v2 §3.1–3.4). */
export const CAB_JOURNEY_TYPES = ["airport_transfer", "outstation", "local", "rental"] as const;
export type CabJourneyType = (typeof CAB_JOURNEY_TYPES)[number];

/** Documented TripJack trip types (Cabs v2 §3.1–3.2). */
export const CAB_TRIP_TYPES = ["oneway", "roundtrip"] as const;
export type CabTripType = (typeof CAB_TRIP_TYPES)[number];

/** TripSafe popular regions (TripSafe v5.1 §3 Search FAQs). */
export const TRIPSAFE_POPULAR_REGIONS = [
  { rkey: "SCH", label: "Schengen" },
  { rkey: "EUR", label: "Europe" },
  { rkey: "MDE", label: "Middle East" },
  { rkey: "USC", label: "US & Canada" },
  { rkey: "ASI", label: "Asia" },
] as const;

/** TripSafe insurance channel types (TripSafe v5.1 §3). */
export const TRIPSAFE_CHANNEL_TYPES = ["REGULAR", "STUDENT", "AMT"] as const;
export type TripsafeChannelType = (typeof TRIPSAFE_CHANNEL_TYPES)[number];

/** Student coverage durations in days (TripSafe v5.1 §3 Student API). */
export const TRIPSAFE_STUDENT_DURATIONS = [180, 365, 730, 1095] as const;

/** AMT per-trip durations in days (TripSafe v5.1 §3 AMT API). */
export const TRIPSAFE_AMT_DURATIONS = [30, 45, 60, 90] as const;

/** Blacklisted countries (TripSafe v5.1 §4 API Validations). */
export const TRIPSAFE_BLOCKED_COUNTRIES = ["MM", "IR", "NK"] as const;

export const TRIPSAFE_MAX_TRAVELLERS = 10;
export const TRIPSAFE_MAX_AGE = 70;
/** Regular (non-student, non-AMT) coverage cannot exceed 90 days. */
export const TRIPSAFE_MAX_COVERAGE_DAYS = 90;

/** Nominee relations (TripSafe v5.1 §3 Booking API). */
export const TRIPSAFE_NOMINEE_RELATIONS = [
  "SPOUSE",
  "CHILD",
  "PARENT",
  "SIBLING",
  "FRIEND",
  "GUARDIAN",
  "OTHER",
] as const;
