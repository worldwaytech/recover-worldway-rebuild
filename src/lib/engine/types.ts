// Worldway Travel Commerce Engine — supplier-agnostic core types.
// No supplier-specific logic lives in the engine; adapters normalise into these.

export type ComponentKind =
  | "flight"
  | "stay"
  | "activity"
  | "transfer"
  | "cruise"
  | "insurance"
  | "aviation"
  | "rail";

export type SupplierReadiness = "production" | "uat" | "sandbox" | "blocked" | "disabled";

/** Canonical capabilities (legacy aliases kept: revalidate≈availability/price, hold≈prebook, ticket≈voucher). */
export type SupplierCapability =
  | "search" | "availability" | "price" | "prebook" | "book" | "cancel" | "modify" | "refund" | "voucher"
  | "revalidate" | "hold" | "ticket" | "status";

export type CapabilityEnvironment = "production" | "uat" | "sandbox";

/** Evidence-backed state of one capability. SEARCH ≠ BOOKABLE; UAT/SANDBOX ≠ PRODUCTION. */
export interface CapabilityGrant {
  capability: SupplierCapability;
  environment: CapabilityEnvironment;
  /** True only when real evidence exists in that environment. */
  certified: boolean;
  evidence?: string;
}

export interface SupplierRegistration {
  supplierKey: string;
  kinds: ComponentKind[];
  capabilities: SupplierCapability[];
  readiness: SupplierReadiness;
  /** 0..1 observed reliability from health probes. */
  reliability: number;
  /** Per-capability certification. When present it is authoritative for booking readiness. */
  grants?: CapabilityGrant[];
}

export interface Money {
  amount: number;
  currency: string;
}

/** A point in time with its IANA timezone — never a bare date. */
export interface LocalMoment {
  /** ISO instant (UTC). */
  at: string;
  timezone: string;
  /** IATA/city code or lat/lng label for geography checks. */
  place: string;
  lat?: number;
  lng?: number;
}

export interface CancellationTerms {
  refundable: boolean;
  /** ISO instant until which cancellation is free, if any. */
  freeUntil?: string;
}

export interface NormalizedComponent {
  id: string;
  kind: ComponentKind;
  supplierKey: string;
  externalId: string;
  title: string;
  start: LocalMoment;
  end: LocalMoment;
  net: Money;
  taxes: Money;
  cancellation: CancellationTerms;
  /** 0..5 quality/luxury signal from the supplier content. */
  quality?: number;
  /** Supplier-verified timestamp; components are only real once revalidated. */
  revalidatedAt?: string;
}

export interface TripRequirements {
  origin: string;
  destinations: string[];
  /** Earliest local departure date (yyyy-mm-dd) in origin timezone. */
  departFrom: string;
  returnBy: string;
  adults: number;
  children: number;
  budget?: Money;
  luxuryLevel: 1 | 2 | 3 | 4 | 5;
  interests: string[];
}

export type IssueSeverity = "error" | "warning";

export interface AuditIssue {
  code:
    | "time-order"
    | "overlap"
    | "hotel-date-mismatch"
    | "impossible-connection"
    | "missing-transfer"
    | "impossible-travel"
    | "timezone-missing"
    | "not-revalidated"
    | "supplier-not-bookable"
    | "price-unavailable"
    | "substitution-requires-approval"
    | "outside-trip-window";
  severity: IssueSeverity;
  componentIds: string[];
  message: string;
}
