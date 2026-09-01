// TripJack TripSafe API v5.1 — client-safe contract types.
// Field names are verbatim from the supplier documentation.
import {
  TRIPSAFE_BLOCKED_COUNTRIES,
  TRIPSAFE_MAX_AGE,
  TRIPSAFE_MAX_COVERAGE_DAYS,
  TRIPSAFE_MAX_TRAVELLERS,
  type TripsafeChannelType,
} from "./config";

export type TripsafeRegion = {
  rkey: string;
  rt: "COUNTRY" | "POPULARREGION";
};

export type TripsafeSearchTraveller = {
  age: number;
};

/** TripSafe v5.1 §3 Search API request. */
export type TripsafeSearchRequest = {
  isq: {
    /** Coverage start date, yyyy-MM-dd. */
    sd: string;
    /** Coverage end date, yyyy-MM-dd. Omitted for STUDENT (uses cd). */
    ed?: string;
    /** Coverage duration in days — STUDENT plans only (180/365/730/1095). */
    cd?: string;
    isc: { iri: TripsafeRegion[] };
    iti: TripsafeSearchTraveller[];
    isp?: { pht?: string };
    /** Embedded flow flag. */
    isef?: boolean;
    /** Insurance channel type: REGULAR (default) / STUDENT / AMT. */
    ict?: TripsafeChannelType;
    /** AMT per-trip duration in days (30/45/60/90). */
    adr?: string;
  };
  /** Air booking id — embedded flow only. */
  bid?: string;
};

export type TripsafePlan = {
  pid?: string;
  iid?: string;
  pn?: string;
  inn?: string;
  tpn?: string;
  desc?: string;
  tf?: number;
  bf?: number;
  cur?: string;
  sumInsured?: number | string;
  benefits?: Array<{ bn?: string; bv?: string }>;
  wordingsUrl?: string;
  brochureUrl?: string;
  [key: string]: unknown;
};

export type TripsafeSearchResponse = {
  isq?: TripsafeSearchRequest["isq"] & { searchId?: string; pci?: Record<string, number> };
  isr?: {
    iinfo?: {
      pli?: Array<{ plid?: string; pi?: TripsafePlan[] }>;
    };
  };
  searchId?: string;
};

export type TripsafeTraveller = {
  id?: number;
  ti: string;
  fn: string;
  ln: string;
  age: number;
  dob: string;
  eid?: string;
  cnum?: string;
  pnum?: string;
  pnan?: string;
  isio?: boolean;
  /** Nominee details, documented on the Review/Book payload. */
  nomineeName?: string;
  nomineeRelation?: string;
};

/** TripSafe v5.1 §3 Review API request. */
export type TripsafeReviewRequest = {
  iid: string;
  pid: string;
  sd: string;
  ed?: string;
  cd?: string;
  iti: TripsafeTraveller[];
  /** Air booking id — embedded flow only. */
  refid?: string;
};

export type TripsafeReviewResponse = {
  bookingId?: string;
  totalPriceInfo?: { totalFareDetail?: { fC?: Record<string, number> } };
  insurancePriceInfo?: Record<string, unknown>;
  ipi?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

/** TripSafe v5.1 §3 Booking API request. */
export type TripsafeBookRequest = {
  bookingId: string;
  paymentInfos: Array<{ amount: number }>;
};

export type TripsafeBookResponse = {
  bookingId?: string;
  status?: string;
  order?: Record<string, unknown>;
  [key: string]: unknown;
};

/** TripSafe v5.1 §3 Booking-Details API request. */
export type TripsafeBookingDetailsRequest = { bookingId: string };

/** TripSafe v5.1 §3 Raise-Amendments API request. */
export type TripsafeAmendmentRequest = {
  bookingId: string;
  type: string;
  remarks?: string;
  travellers?: Array<{ id: number }>;
};

/** TripSafe v5.1 §3 Cancellation API request. */
export type TripsafeCancellationRequest = {
  bookingId: string;
  amendmentId: string;
};

export function mapInsuranceStatus(supplierStatus: string | undefined): string {
  switch ((supplierStatus ?? "").toUpperCase()) {
    case "SUCCESS":
    case "CONFIRMED":
    case "BOOKED":
      return "confirmed";
    case "PENDING":
    case "ON_HOLD":
    case "HOLD":
      return "pending";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * TripSafe v5.1 §4 "API Request Validation Rules". These are supplier-mandated
 * pre-flight validations; failing them must not reach UAT.
 */
export function validateTripsafeSearch(req: TripsafeSearchRequest): string | null {
  const { isq } = req;
  if (!isq?.sd) return "Coverage start date is required.";
  if (!isq.isc?.iri?.length) return "At least one destination region is required.";
  if (!isq.iti?.length) return "At least one traveller is required.";
  if (isq.iti.length > TRIPSAFE_MAX_TRAVELLERS) {
    return `A maximum of ${TRIPSAFE_MAX_TRAVELLERS} travellers is allowed per search.`;
  }
  if (isq.iti.some((t) => !Number.isFinite(t.age) || t.age < 0)) {
    return "Every traveller needs a valid age.";
  }
  if (isq.iti.some((t) => t.age > TRIPSAFE_MAX_AGE)) {
    return `Travellers above ${TRIPSAFE_MAX_AGE} years of age cannot be covered.`;
  }
  const blocked = isq.isc.iri.find(
    (r) =>
      r.rt === "COUNTRY" &&
      (TRIPSAFE_BLOCKED_COUNTRIES as readonly string[]).includes(r.rkey.toUpperCase()),
  );
  if (blocked) return `Cover is not available for destination ${blocked.rkey}.`;

  const channel = isq.ict ?? "REGULAR";
  if (channel === "STUDENT") {
    if (!isq.cd) return "Student cover requires a coverage duration.";
    if (isq.iti.some((t) => t.age < 18 || t.age > 45)) {
      return "Student cover is limited to travellers aged 18 to 45.";
    }
    return null;
  }
  if (channel === "AMT") {
    if (!isq.adr) return "Annual Multi-Trip cover requires a per-trip duration.";
    return null;
  }
  if (!isq.ed) return "Coverage end date is required.";
  const days = Math.round(
    (Date.parse(`${isq.ed}T00:00:00Z`) - Date.parse(`${isq.sd}T00:00:00Z`)) / 86_400_000,
  );
  if (!Number.isFinite(days) || days < 0) return "Coverage end date must follow the start date.";
  if (days > TRIPSAFE_MAX_COVERAGE_DAYS) {
    return `Coverage duration must not exceed ${TRIPSAFE_MAX_COVERAGE_DAYS} days.`;
  }
  return null;
}
