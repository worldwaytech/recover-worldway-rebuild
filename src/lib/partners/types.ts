// Enterprise partner integration framework — shared, client-safe types.

export type PartnerCapability =
  | "catalog"
  | "incremental-sync"
  | "availability"
  | "pricing"
  | "booking"
  | "cancellation"
  | "amendment"
  | "media"
  | "documents";

export type PartnerAuthKind =
  | "api-key-header"
  | "bearer-token"
  | "oauth2-client-credentials"
  | "basic"
  | "signed-session";

export type PartnerCategory =
  | "luxury-tour-operator"
  | "cruise-line"
  | "adventure-operator"
  | "experiences"
  | "marketplace"
  | "bedbank"
  | "gds";

/** Runtime state of a connector, resolved server-side from credentials + health. */
export type PartnerMode = "live" | "demonstration" | "awaiting-credentials" | "disabled";

export interface PartnerAuthConfig {
  kind: PartnerAuthKind;
  /** Names of the server secrets this connector requires. Never their values. */
  secrets: string[];
  /** Header used for api-key-header connectors. */
  header?: string;
  /** Token endpoint for oauth2-client-credentials connectors. */
  tokenPath?: string;
  scope?: string;
}

export interface PartnerEndpointMap {
  health?: string;
  catalog?: string;
  catalogDelta?: string;
  availability?: string;
  pricing?: string;
  booking?: string;
  cancellation?: string;
  amendment?: string;
  media?: string;
  documents?: string;
}

/** Authorised bulk-feed ingestion (XML/JSON/CSV) offered by many luxury
 *  operators alongside — or instead of — a REST API. */
export interface PartnerFeedConfig {
  format: "json" | "xml" | "csv";
  /** Absolute feed URL, or a path appended to `baseUrl`. */
  url: string;
  /** Element/array name holding one product per entry (XML/JSON). */
  recordPath: string;
  /** Feed field name → journey model field name. */
  fieldMap: Record<string, string>;
  /** Optional shared secret name used to verify pushed feed webhooks. */
  webhookSecret?: string;
  refreshCron?: string;
}

export interface PartnerConnectorConfig {
  id: string;
  name: string;
  category: PartnerCategory;
  /** Marketing blurb shown in the operator console. */
  summary: string;
  baseUrl: string;
  auth: PartnerAuthConfig;
  endpoints: PartnerEndpointMap;
  capabilities: PartnerCapability[];
  /** Which catalogue kinds this supplier can populate. */
  collections: string[];
  /** Requests per second ceiling enforced by the connector runtime. */
  rateLimitPerSecond: number;
  /** Catalogue cache lifetime in seconds. */
  cacheTtlSeconds: number;
  /** Retry attempts for idempotent reads. */
  maxRetries: number;
  timeoutMs: number;
  /** Cursor strategy used for incremental catalogue updates. */
  syncStrategy: "full" | "cursor" | "updated-since";
  contractStatus: "signed" | "in-negotiation" | "prospective";
  docsUrl?: string;
  /** Authorised feed fallback when the partner ships files rather than REST. */
  feed?: PartnerFeedConfig;
  /** Vertical templates this supplier is expected to populate. */
  templates?: string[];
}

export interface PartnerHealth {
  id: string;
  name: string;
  mode: PartnerMode;
  credentialsPresent: boolean;
  missingSecrets: string[];
  reachable: boolean | null;
  status: number | null;
  latencyMs: number | null;
  attempts: number;
  message: string;
  checkedAt: string;
}

export interface JourneyDay {
  day: number;
  title: string;
  location: string;
  description: string;
  meals: string[];
  accommodation?: string;
}

export interface JourneyDeparture {
  date: string;
  endDate: string;
  price: number;
  currency: string;
  availability: "available" | "limited" | "waitlist" | "sold-out";
  seatsRemaining: number | null;
}

export interface JourneyReview {
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string;
}

export interface JourneyMedia {
  hero: string;
  gallery: string[];
  videoUrl?: string;
  brochureUrl?: string;
}

/** Geo waypoints powering the itinerary map on every detail template. */
export interface JourneyWaypoint {
  name: string;
  lat: number;
  lng: number;
  day?: number;
  kind?: "start" | "stop" | "port" | "camp" | "end";
}

/** Partner-supplied documents: brochures, deck plans, visa notes, T&Cs. */
export interface JourneyDocument {
  title: string;
  url: string;
  kind: "brochure" | "deck-plan" | "itinerary-pdf" | "terms" | "insurance" | "other";
  sizeKb?: number;
}

export interface JourneyFaq {
  question: string;
  answer: string;
}

/** Vessel / train / residence specification, used by cruise, rail, yacht,
 *  villa and safari templates. */
export interface JourneyVessel {
  name: string;
  type: string;
  guests?: number;
  cabins?: number;
  crew?: number;
  yearBuilt?: number;
  iceClass?: string;
  bedrooms?: number;
  amenities?: string[];
  cabinGrades?: { name: string; description: string; priceFrom: number; available: boolean }[];
}

/** The enterprise journey model every partner feed normalises into. */
export interface Journey {
  code: string;
  title: string;
  subtitle: string;
  partnerId: string;
  partnerName: string;
  collection: string;
  collectionKind: string;
  region: string;
  regionSlug: string;
  country: string;
  countrySlug: string;
  cities: string[];
  destinationSlugs: string[];
  durationDays: number;
  durationNights: number;
  priceFrom: number;
  currency: string;
  groupSizeMax: number;
  groupStyle: "private" | "small-group" | "expedition" | "charter";
  luxuryLevel: "premium" | "luxury" | "ultra-luxury";
  hotels: string[];
  ships: string[];
  rail: string[];
  mealPlan: string;
  highlights: string[];
  itinerary: JourneyDay[];
  inclusions: string[];
  exclusions: string[];
  extensions: { title: string; nights: number; priceFrom: number }[];
  departures: JourneyDeparture[];
  media: JourneyMedia;
  terms: string[];
  reviews: JourneyReview[];
  rating: number;
  reviewCount: number;
  interests: string[];
  /** Presentation template id (see `templates.ts`). Derived when absent. */
  templateId?: string;
  waypoints?: JourneyWaypoint[];
  documents?: JourneyDocument[];
  faqs?: JourneyFaq[];
  vessel?: JourneyVessel;
  /** ISO dates that are open for enquiry when a supplier publishes a calendar
   *  rather than fixed departures (villas, yachts, private journeys). */
  availableDates?: string[];
  /** Provenance — demonstration records are clearly badged in the UI. */
  dataSource: "partner-api" | "demonstration";
  updatedAt: string;
}

export interface PartnerSyncResult {
  partnerId: string;
  partnerName: string;
  mode: PartnerMode;
  journeys: Journey[];
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  cursor: string | null;
  fromCache: boolean;
  durationMs: number;
  warnings: string[];
  syncedAt: string;
}

export interface PartnerLogEntry {
  at: string;
  partnerId: string;
  operation: string;
  status: "ok" | "retry" | "error" | "cache-hit" | "rate-limited" | "demo";
  durationMs: number;
  detail?: string;
}
/** Non-sensitive readiness summary surfaced on the executive console. */
export interface PartnerReadinessRow {
  id: string;
  name: string;
  category: PartnerCategory;
  summary: string;
  contractStatus: "signed" | "in-negotiation" | "prospective";
  authKind: PartnerAuthKind;
  capabilities: PartnerCapability[];
  collections: string[];
  mode: PartnerMode;
  credentialsRequired: number;
  credentialsConfigured: number;
  awaiting: boolean;
  /** Vertical templates this supplier will populate once live. */
  templates: string[];
  /** Authorised bulk-feed ingestion configured for this supplier. */
  feed: { format: string; recordPath: string; mappedFields: number; push: boolean } | null;
}

export interface PartnerReadiness {
  generatedAt: string;
  partners: PartnerReadinessRow[];
  /** Per-vertical template coverage across the demonstration catalogue. */
  templateCoverage: {
    id: string;
    label: string;
    routeBase: string;
    sections: number;
    sampleJourneys: number;
    suppliers: string[];
  }[];
}
