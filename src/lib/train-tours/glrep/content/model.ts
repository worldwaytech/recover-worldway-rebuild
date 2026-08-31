/**
 * GLREP Journey Content Domain — schema.
 *
 * Additive, CMS-ready, strongly typed content model for luxury rail journeys.
 * Contains NO React, NO side effects, and does NOT modify or import the GLREP
 * registry / booking / pricing / search / SEO modules. It composes with them
 * exclusively through adapters (see `adapters.ts`).
 *
 * Every block is a reusable, configuration-driven content unit. Future journeys
 * require only data additions — no code changes.
 */

/** Functional result mirroring the GLREP convention, kept local to stay decoupled. */
export type ContentResult<T, E = ContentError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const cok = <T>(value: T): ContentResult<T, never> => ({ ok: true, value });
export const cerr = <E>(error: E): ContentResult<never, E> => ({ ok: false, error });

export type ContentErrorCode =
  | "BROKEN_REFERENCE"
  | "DUPLICATE_SLUG"
  | "MISSING_MEDIA"
  | "MISSING_SEO"
  | "ITINERARY_INCONSISTENT"
  | "INVALID_DESTINATION"
  | "ORPHANED_OPERATOR"
  | "ORPHANED_TRAIN"
  | "ORPHANED_CABIN"
  | "NOT_FOUND";

export interface ContentError {
  readonly code: ContentErrorCode;
  readonly message: string;
}

export const contentError = (code: ContentErrorCode, message: string): ContentError => ({
  code,
  message,
});

/* --------------------------------------------------------------------------
 * Shared value objects
 * ------------------------------------------------------------------------ */

/** Geographic coordinate (WGS84). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/**
 * Media reference. Never embeds binary or third-party copyrighted assets — only
 * an abstract asset id resolved through the {@link MediaRegistry}.
 */
export interface MediaRef {
  readonly assetId: string;
  readonly alt: string;
  readonly caption?: string;
}

export type MediaKind = "image" | "video" | "panorama" | "floorplan" | "brochure";

export interface MediaAsset {
  readonly id: string;
  readonly kind: MediaKind;
  /** Placeholder-friendly URL; production swaps to licensed supplier assets. */
  readonly url: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly credit?: string;
}

/* --------------------------------------------------------------------------
 * Reusable entity registries' record types
 * ------------------------------------------------------------------------ */

export interface OperatorRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly foundedYear?: number;
  readonly headquarters?: string;
  readonly website?: string;
  readonly logo?: MediaRef;
}

export interface TechnicalSpec {
  readonly label: string;
  readonly value: string;
}

export interface TrainRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly operatorId: string;
  readonly description: string;
  readonly history?: string;
  readonly carCount?: number;
  readonly maxGuests?: number;
  readonly technicalSpecs: readonly TechnicalSpec[];
  readonly gallery: readonly MediaRef[];
}

export type CabinClass = "heritage" | "deluxe" | "suite" | "grand-suite" | "royal-suite";

export interface CabinFloorPlan {
  readonly assetId: string;
  readonly areaSqm?: number;
}

export interface CabinRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly trainId: string;
  readonly cabinClass: CabinClass;
  readonly description: string;
  readonly maxOccupancy: number;
  readonly amenities: readonly string[];
  readonly floorPlan?: CabinFloorPlan;
  readonly gallery: readonly MediaRef[];
}

export interface DestinationRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string;
  readonly description: string;
  readonly location?: GeoPoint;
  readonly guide?: string;
}

export interface UnescoSiteRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly destinationId: string;
  readonly inscribedYear?: number;
  readonly description: string;
}

export interface ExcursionRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly destinationId: string;
  readonly description: string;
  readonly durationHours?: number;
  readonly optional: boolean;
}

export interface DiningRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly cuisine?: string;
}

export interface BrochureRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly assetId: string;
  readonly pages?: number;
}

export interface VideoRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly assetId: string;
  readonly durationSeconds?: number;
}

export interface ReviewRecord {
  readonly id: string;
  readonly author: string;
  readonly rating: number;
  readonly title?: string;
  readonly body: string;
  readonly date: string;
  readonly verified: boolean;
}

export interface AwardRecord {
  readonly id: string;
  readonly title: string;
  readonly organisation: string;
  readonly year: number;
}

/* --------------------------------------------------------------------------
 * Journey content blocks
 * ------------------------------------------------------------------------ */

export interface HeroBlock {
  readonly headline: string;
  readonly subheadline: string;
  readonly media: MediaRef;
  readonly ctaLabel?: string;
}

export interface OverviewBlock {
  readonly summary: string;
  readonly body: string;
  readonly durationDays: number;
  readonly fromCity: string;
  readonly toCity: string;
}

export interface HighlightItem {
  readonly title: string;
  readonly description: string;
}

export interface ItineraryDay {
  readonly day: number;
  readonly title: string;
  readonly description: string;
  readonly destinationIds: readonly string[];
  readonly excursionIds: readonly string[];
  readonly meals: readonly ("breakfast" | "lunch" | "dinner")[];
}

export interface RouteGeometry {
  readonly path: readonly GeoPoint[];
  readonly distanceKm?: number;
  readonly mapAssetId?: string;
}

export interface FacilityItem {
  readonly name: string;
  readonly description: string;
}

export interface PracticalInfo {
  readonly travelSeasons: readonly string[];
  readonly climate: string;
  readonly visaRequirements: string;
  readonly packingGuide: readonly string[];
  readonly travelTips: readonly string[];
  readonly accessibility: string;
  readonly sustainability: string;
}

export interface DepartureCalendarMeta {
  readonly firstDeparture: string;
  readonly lastDeparture: string;
  readonly frequency: string;
  readonly departureCount: number;
}

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface SeoMeta {
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly canonicalPath: string;
  readonly ogImageAssetId?: string;
}

/** JSON-LD payload, kept as an opaque serializable record. */
export type JsonLd = Readonly<Record<string, unknown>>;

/**
 * The canonical journey content document. Every block is composed of reusable
 * registry references plus journey-specific narrative. Optional blocks degrade
 * gracefully in the presentation layer.
 */
export interface JourneyContent {
  /** Matches the GLREP destination slug this journey belongs to. */
  readonly destinationSlug: string;
  /** Matches the scenicRoute id in the GLREP registry (composition key). */
  readonly journeyRef: string;
  /** Stable, URL-safe slug unique across all journeys. */
  readonly slug: string;
  readonly name: string;

  readonly hero: HeroBlock;
  readonly overview: OverviewBlock;
  readonly highlights: readonly HighlightItem[];
  readonly itinerary: readonly ItineraryDay[];
  readonly routeGeometry: RouteGeometry;

  readonly destinationIds: readonly string[];
  readonly unescoSiteIds: readonly string[];
  readonly scenicHighlights: readonly HighlightItem[];
  readonly excursionIds: readonly string[];
  readonly diningIds: readonly string[];

  readonly accommodation: string;
  readonly operatorId: string;
  readonly trainId: string;
  readonly cabinIds: readonly string[];

  readonly observationCars: readonly FacilityItem[];
  readonly loungeCars: readonly FacilityItem[];
  readonly diningCars: readonly FacilityItem[];
  readonly wellnessFacilities: readonly FacilityItem[];

  readonly includedServices: readonly string[];
  readonly optionalExperiences: readonly string[];

  readonly departureCalendar: DepartureCalendarMeta;
  readonly practical: PracticalInfo;

  readonly faqs: readonly FaqItem[];
  readonly reviewIds: readonly string[];
  readonly awardIds: readonly string[];

  readonly brochureIds: readonly string[];
  readonly galleryIds: readonly string[];
  readonly videoIds: readonly string[];

  readonly trainHistory?: string;
  readonly routeHistory?: string;
  readonly destinationGuides: readonly string[];
  readonly relatedJourneyRefs: readonly string[];
  readonly similarExperienceRefs: readonly string[];

  readonly seo: SeoMeta;
  readonly jsonLd: JsonLd;
}
