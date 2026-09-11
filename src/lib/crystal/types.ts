// Provider-agnostic cruise domain model for the Crystal Cruises module.
// Nothing here is supplier-specific: any Crystal-certified feed, XML/JSON
// distribution file or partner API can be normalised into these shapes.

export type SuiteCategory =
  | "ocean-view"
  | "balcony"
  | "penthouse"
  | "residence"
  | "expedition-suite";

export type CruiseStyle =
  | "ocean"
  | "expedition"
  | "world-cruise"
  | "grand-voyage"
  | "wellness"
  | "culinary"
  | "cultural"
  | "holiday"
  | "family"
  | "adults-only"
  | "solo";

export interface CrystalPort {
  slug: string;
  name: string;
  country: string;
  destinationSlug: string;
  summary: string;
}

export interface CrystalDestination {
  slug: string;
  name: string;
  region: string;
  countries: string[];
  overview: string;
  bestTime: string;
  season: string[];
  hero: string;
  map: { lat: number; lng: number; zoomHint: string };
  ports: string[];
  related: string[];
  faqs: { q: string; a: string }[];
}

export interface CrystalSuiteGrade {
  id: string;
  name: string;
  category: SuiteCategory;
  sizeSqFt?: number;
  occupancy?: number;
  description: string;
  licensedOnly?: boolean;
}

export interface CrystalShip {
  slug: string;
  name: string;
  classification: string;
  overview: string;
  hero: string;
  gallery: string[];
  specs: { label: string; value: string }[];
  decks: { name: string; summary: string }[];
  suites: CrystalSuiteGrade[];
  dining: string[];
  lounges: string[];
  wellness: string[];
  enrichment: string[];
  accessibility: string[];
  sustainability: string[];
  faqs: { q: string; a: string }[];
  /** Deck plans and virtual tours only render once licensed assets arrive. */
  deckPlanUrl?: string;
  virtualTourUrl?: string;
}

export interface CrystalVoyageDay {
  day: number;
  date?: string;
  port: string;
  country?: string;
  arrive?: string;
  depart?: string;
  summary?: string;
}

export interface CrystalFare {
  suiteCategory: SuiteCategory;
  gradeId?: string;
  gradeName?: string;
  /** Per-guest fare on double occupancy. */
  price: number;
  /** Per-guest fare for single occupancy, when published. */
  priceSingle?: number;
  /** Undiscounted per-guest fare when a promotion applies. */
  priceBeforeDiscount?: number;
  /** Third/fourth guest sharing the suite. */
  priceExtraGuest?: number;
  priceChild?: number;
  /** Past-guest (Crystal Society) fare when published. */
  pastGuestPrice?: number;
  /** Government fees and port charges, quoted separately by the supplier. */
  portCharge?: number;
  tax?: number;
  maxCapacity?: number;
  fareType?: string;
  fareCode?: string;
  promoId?: number;
  currency: string;
  available?: boolean;
  /** Live suite count from the availability operation. */
  availabilityCount?: number;
  guaranteeCount?: number;
  sellableOnline?: boolean;
  availabilityLabel?: string;
  promotion?: string;
}

export interface CrystalPenaltyBand {
  daysFrom: number;
  daysTo: number;
  amountPercent?: number;
  fixedAmount?: number;
}

export interface CrystalVoyage {
  code: string;
  /** Supplier voyage identifier, when the feed exposes one. */
  voyageId?: number;
  title: string;
  description?: string;
  subtitle: string;
  shipSlug: string;
  shipName: string;
  shipCode?: string;
  destinationSlug: string;
  destinationName: string;
  supplierDestinationId?: number;
  region: string;
  countries: string[];
  embarkPort: string;
  embarkPortCode?: string;
  disembarkPort: string;
  disembarkPortCode?: string;
  nights: number;
  departureDate: string;
  returnDate: string;
  styles: CruiseStyle[];
  voyageType?: string;
  voyageClass?: string;
  itinerary: CrystalVoyageDay[];
  fares: CrystalFare[];
  priceFrom?: number;
  currency: string;
  promotions: string[];
  inclusions: string[];
  media: {
    hero?: string;
    gallery: string[];
    mapSvg?: string;
    mapPng?: string;
    mapPdf?: string;
    itineraryPdf?: string;
  };
  availability: "open" | "waitlist" | "closed" | "unknown";
  /**
   * "licensed" — live AKTG supplier inventory, bookable end to end.
   * "brochure" — Crystal's own published catalogue (World Cruises, which the
   * AKTG entitlement does not distribute); real data, enquiry only.
   */
  dataSource: "licensed" | "brochure";
  /** "supplier" (hold + confirm) or "enquiry" (specialist quote). */
  bookingMode?: "supplier" | "enquiry";
  /** Official Crystal page a brochure record was imported from. */
  sourceUrl?: string;

  supplierId: string;
  updatedAt: string;
  fareType?: string;
  depositPercent?: number;
  depositDueDate?: string;
  finalPaymentDate?: string;
  cancellationPolicy?: CrystalPenaltyBand[];
}

export interface CrystalFacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface CrystalSearchFilters {
  q?: string;
  destination?: string;
  region?: string;
  country?: string;
  port?: string;
  embarkPort?: string;
  disembarkPort?: string;
  ship?: string;
  minNights?: number;
  maxNights?: number;
  month?: string;
  date?: string;
  minPrice?: number;
  maxPrice?: number;
  suite?: SuiteCategory;
  style?: CruiseStyle;
  availability?: string;
  promotionsOnly?: boolean;
  sort?: "recommended" | "price-asc" | "price-desc" | "date-asc" | "nights-asc" | "nights-desc";
}

export interface CrystalSearchResult {
  voyages: CrystalVoyage[];
  total: number;
  facets: {
    destination: CrystalFacetBucket[];
    region: CrystalFacetBucket[];
    country: CrystalFacetBucket[];
    port: CrystalFacetBucket[];
    ship: CrystalFacetBucket[];
    month: CrystalFacetBucket[];
    suite: CrystalFacetBucket[];
    style: CrystalFacetBucket[];
    availability: CrystalFacetBucket[];
  };
  /** False until an authorised Crystal feed is connected. */
  licensed: boolean;
  notice: string;
}
