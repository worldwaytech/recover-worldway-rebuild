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

export type SupplierCapability = "search" | "revalidate" | "hold" | "book" | "ticket" | "status" | "cancel";

export interface SupplierRegistration {
  supplierKey: string;
  kinds: ComponentKind[];
  capabilities: SupplierCapability[];
  readiness: SupplierReadiness;
  /** 0..1 observed reliability from health probes. */
  reliability: number;
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
    | "supplier-not-bookable";
  severity: IssueSeverity;
  componentIds: string[];
  message: string;
}
