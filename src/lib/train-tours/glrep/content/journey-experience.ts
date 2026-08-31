/**
 * GLREP Journey Content Domain — Phase 2 Journey Experience builders.
 *
 * Purely additive, registry-driven, SSR-safe view-model builders for the rich
 * journey detail experience. These compose the existing {@link ContentRegistries}
 * into presentation-ready shapes — no business logic is duplicated, no content
 * is hardcoded, and no existing module is modified. All builders are pure
 * functions safe to run during SSR.
 *
 * @module glrep/content/journey-experience
 */

import type { ContentRegistries, JourneyRecord } from "./registries";
import type {
  CabinRecord,
  DestinationRecord,
  DiningRecord,
  ExcursionRecord,
  FacilityItem,
  FaqItem,
  GeoPoint,
  HighlightItem,
  ItineraryDay,
  MediaAsset,
  MediaRef,
  OperatorRecord,
  TrainRecord,
  VideoRecord,
} from "./model";
import { resolveMedia } from "./entity-views";

/* --------------------------------------------------------------- utilities */

const getJourney = (r: ContentRegistries, slug: string): JourneyRecord | null => {
  const found = r.journeys.getBySlug(slug);
  return found.ok ? found.value : null;
};

const slugifyAnchor = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const resolveAssets = (r: ContentRegistries, ids: readonly string[]): readonly MediaAsset[] =>
  ids
    .map((id) => r.media.get(id))
    .filter((m): m is { ok: true; value: MediaAsset } => m.ok)
    .map((m) => m.value);

/* ----------------------------------------------- 1. Journey Experience Engine */

export interface ItineraryDayView {
  readonly day: number;
  readonly anchor: string;
  readonly title: string;
  readonly description: string;
  readonly destinations: readonly DestinationRecord[];
  readonly excursions: readonly ExcursionRecord[];
  readonly meals: readonly string[];
}

export interface JourneyExperienceView {
  readonly slug: string;
  readonly name: string;
  readonly overview: JourneyRecord["overview"];
  readonly timeline: readonly ItineraryDayView[];
  readonly highlights: readonly HighlightItem[];
  readonly scenicHighlights: readonly HighlightItem[];
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly accommodation: string;
  readonly dining: readonly DiningRecord[];
  readonly excursions: readonly ExcursionRecord[];
  readonly transportSegments: readonly FacilityItem[];
}

const buildItineraryView = (
  r: ContentRegistries,
  days: readonly ItineraryDay[],
): readonly ItineraryDayView[] =>
  [...days]
    .sort((a, b) => a.day - b.day)
    .map((d) => ({
      day: d.day,
      anchor: `day-${d.day}`,
      title: d.title,
      description: d.description,
      destinations: d.destinationIds
        .map((id) => r.destinations.get(id))
        .filter((x): x is { ok: true; value: DestinationRecord } => x.ok)
        .map((x) => x.value),
      excursions: d.excursionIds
        .map((id) => r.excursions.get(id))
        .filter((x): x is { ok: true; value: ExcursionRecord } => x.ok)
        .map((x) => x.value),
      meals: d.meals,
    }));

/** Build the full registry-driven journey experience view model. */
export const buildJourneyExperience = (
  r: ContentRegistries,
  slug: string,
): JourneyExperienceView | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const dining = j.diningIds
    .map((id) => r.dining.get(id))
    .filter((x): x is { ok: true; value: DiningRecord } => x.ok)
    .map((x) => x.value);
  const excursions = j.excursionIds
    .map((id) => r.excursions.get(id))
    .filter((x): x is { ok: true; value: ExcursionRecord } => x.ok)
    .map((x) => x.value);
  return {
    slug: j.slug,
    name: j.name,
    overview: j.overview,
    timeline: buildItineraryView(r, j.itinerary),
    highlights: j.highlights,
    scenicHighlights: j.scenicHighlights,
    inclusions: j.includedServices,
    exclusions: j.optionalExperiences,
    accommodation: j.accommodation,
    dining,
    excursions,
    transportSegments: [...j.observationCars, ...j.loungeCars, ...j.diningCars],
  };
};

/* --------------------------------------------- 2. Interactive Journey Timeline */

export interface TimelineNavItem {
  readonly day: number;
  readonly anchor: string;
  readonly label: string;
}

export interface JourneyTimelineView {
  readonly days: readonly ItineraryDayView[];
  readonly nav: readonly TimelineNavItem[];
  readonly totalDays: number;
}

/** Build an expandable, anchor-linked timeline with progress navigation. */
export const buildJourneyTimeline = (
  r: ContentRegistries,
  slug: string,
): JourneyTimelineView | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const days = buildItineraryView(r, j.itinerary);
  return {
    days,
    nav: days.map((d) => ({
      day: d.day,
      anchor: d.anchor,
      label: `Day ${d.day}: ${d.title}`,
    })),
    totalDays: days.length,
  };
};

/* ----------------------------------------------- 3. Carriage & Cabin Explorer */

export interface CabinView {
  readonly cabin: CabinRecord;
  readonly floorPlan: MediaAsset | null;
  readonly gallery: readonly MediaAsset[];
}

export interface CarriageCabinView {
  readonly train: TrainRecord | null;
  readonly cabins: readonly CabinView[];
  readonly facilities: readonly FacilityItem[];
  readonly wellnessFacilities: readonly FacilityItem[];
  readonly upgradePaths: readonly {
    readonly fromCabinSlug: string;
    readonly toCabinSlug: string;
    readonly fromName: string;
    readonly toName: string;
  }[];
}

const CABIN_RANK: Record<CabinRecord["cabinClass"], number> = {
  heritage: 0,
  deluxe: 1,
  suite: 2,
  "grand-suite": 3,
  "royal-suite": 4,
};

const resolveGallery = (r: ContentRegistries, refs: readonly MediaRef[]): readonly MediaAsset[] =>
  refs.map((ref) => resolveMedia(r, ref)).filter((m): m is MediaAsset => m !== null);

/** Build a carriage & cabin explorer ordered by exclusivity with upgrade paths. */
export const buildCarriageCabinExplorer = (
  r: ContentRegistries,
  slug: string,
): CarriageCabinView | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const train = r.trains.get(j.trainId);
  const cabins: readonly CabinView[] = j.cabinIds
    .map((id) => r.cabins.get(id))
    .filter((x): x is { ok: true; value: CabinRecord } => x.ok)
    .map((x) => x.value)
    .sort((a, b) => CABIN_RANK[a.cabinClass] - CABIN_RANK[b.cabinClass])
    .map((cabin) => {
      const fp = cabin.floorPlan ? r.media.get(cabin.floorPlan.assetId) : undefined;
      return {
        cabin,
        floorPlan: fp && fp.ok ? fp.value : null,
        gallery: resolveGallery(r, cabin.gallery),
      };
    });
  const upgradePaths = cabins.slice(0, -1).map((c, i) => ({
    fromCabinSlug: c.cabin.slug,
    toCabinSlug: cabins[i + 1].cabin.slug,
    fromName: c.cabin.name,
    toName: cabins[i + 1].cabin.name,
  }));
  return {
    train: train.ok ? train.value : null,
    cabins,
    facilities: [...j.observationCars, ...j.loungeCars, ...j.diningCars],
    wellnessFacilities: j.wellnessFacilities,
    upgradePaths,
  };
};

/* --------------------------------------------------------- 4. Interactive Maps */

export interface MapMarker {
  readonly id: string;
  readonly name: string;
  readonly position: GeoPoint;
  readonly description: string;
}

export interface JourneyMapView {
  readonly path: readonly GeoPoint[];
  readonly distanceKm?: number;
  readonly markers: readonly MapMarker[];
  /** True when there is enough coordinate data to render a map. */
  readonly hasGeometry: boolean;
}

/** Build registry-driven map data with graceful fallback when unavailable. */
export const buildJourneyMap = (r: ContentRegistries, slug: string): JourneyMapView | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const markers: readonly MapMarker[] = j.destinationIds
    .map((id) => r.destinations.get(id))
    .filter((x): x is { ok: true; value: DestinationRecord } => x.ok)
    .map((x) => x.value)
    .filter((d): d is DestinationRecord & { location: GeoPoint } => !!d.location)
    .map((d) => ({
      id: d.id,
      name: d.name,
      position: d.location,
      description: d.description,
    }));
  const path = j.routeGeometry.path;
  return {
    path,
    distanceKm: j.routeGeometry.distanceKm,
    markers,
    hasGeometry: path.length > 0 || markers.length > 0,
  };
};

/* ----------------------------------------------------------------- 5. Downloads */

export type DownloadKind =
  | "brochure"
  | "itinerary"
  | "pricing-sheet"
  | "packing-guide"
  | "travel-notes"
  | "visa-information";

export interface DownloadItem {
  readonly kind: DownloadKind;
  readonly label: string;
  readonly url?: string;
  /** Inline content for generated documents (packing guide, visa info, etc.). */
  readonly content?: readonly string[];
  readonly available: boolean;
}

/** Build the CMS-ready downloads set, degrading gracefully when assets absent. */
export const buildJourneyDownloads = (
  r: ContentRegistries,
  slug: string,
): readonly DownloadItem[] | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const items: DownloadItem[] = [];

  for (const id of j.brochureIds) {
    const b = r.brochures.get(id);
    if (!b.ok) continue;
    const asset = r.media.get(b.value.assetId);
    items.push({
      kind: "brochure",
      label: b.value.title,
      url: asset.ok ? asset.value.url : undefined,
      available: asset.ok,
    });
  }

  items.push({
    kind: "itinerary",
    label: `${j.name} — Itinerary`,
    content: j.itinerary.map((d) => `Day ${d.day}: ${d.title}`),
    available: j.itinerary.length > 0,
  });

  items.push({
    kind: "pricing-sheet",
    label: `${j.name} — Pricing Sheet`,
    available: j.cabinIds.length > 0,
  });

  items.push({
    kind: "packing-guide",
    label: "Packing Guide",
    content: j.practical.packingGuide,
    available: j.practical.packingGuide.length > 0,
  });

  items.push({
    kind: "travel-notes",
    label: "Travel Notes",
    content: j.practical.travelTips,
    available: j.practical.travelTips.length > 0,
  });

  items.push({
    kind: "visa-information",
    label: "Visa Information",
    content: j.practical.visaRequirements ? [j.practical.visaRequirements] : [],
    available: !!j.practical.visaRequirements,
  });

  return items;
};

/* ----------------------------------------------------------- 6. Related Journeys */

export interface RelatedJourneyWeights {
  readonly sharedDestinations: number;
  readonly sharedOperator: number;
  readonly sharedTrain: number;
  readonly sharedSeasons: number;
  readonly sharedExperiences: number;
}

export const DEFAULT_RELATED_WEIGHTS: RelatedJourneyWeights = {
  sharedDestinations: 3,
  sharedOperator: 2,
  sharedTrain: 2,
  sharedSeasons: 1,
  sharedExperiences: 1,
};

export interface RelatedJourney {
  readonly slug: string;
  readonly name: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

const countShared = <T>(a: readonly T[], b: readonly T[]): number => {
  const set = new Set(b);
  return a.filter((x) => set.has(x)).length;
};

/** Configurable similarity engine for related journeys. */
export const buildRelatedJourneys = (
  r: ContentRegistries,
  slug: string,
  options: { readonly limit?: number; readonly weights?: RelatedJourneyWeights } = {},
): readonly RelatedJourney[] | null => {
  const source = getJourney(r, slug);
  if (!source) return null;
  const weights = options.weights ?? DEFAULT_RELATED_WEIGHTS;
  const limit = options.limit ?? 4;

  const scored: RelatedJourney[] = r.journeys.all
    .filter((j) => j.slug !== source.slug)
    .map((j) => {
      const reasons: string[] = [];
      let score = 0;

      const dest = countShared(source.destinationIds, j.destinationIds);
      if (dest > 0) {
        score += dest * weights.sharedDestinations;
        reasons.push(`${dest} shared destination(s)`);
      }
      if (j.operatorId === source.operatorId) {
        score += weights.sharedOperator;
        reasons.push("Same operator");
      }
      if (j.trainId === source.trainId) {
        score += weights.sharedTrain;
        reasons.push("Same train");
      }
      const seasons = countShared(source.practical.travelSeasons, j.practical.travelSeasons);
      if (seasons > 0) {
        score += seasons * weights.sharedSeasons;
        reasons.push(`${seasons} shared season(s)`);
      }
      const experiences = countShared(source.similarExperienceRefs, j.similarExperienceRefs);
      if (experiences > 0) {
        score += experiences * weights.sharedExperiences;
        reasons.push(`${experiences} shared experience(s)`);
      }

      return { slug: j.slug, name: j.name, score, reasons };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scored.slice(0, limit);
};

/* ------------------------------------------------------------- 7. Journey Gallery */

export interface GalleryImage {
  readonly id: string;
  readonly url: string;
  readonly alt: string;
  readonly caption?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface GalleryVideo {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly durationSeconds?: number;
}

export interface JourneyGalleryView {
  readonly images: readonly GalleryImage[];
  readonly videos: readonly GalleryVideo[];
  readonly hasMedia: boolean;
}

/** Build a CMS-ready, lazy-load-friendly gallery view model. */
export const buildJourneyGallery = (
  r: ContentRegistries,
  slug: string,
): JourneyGalleryView | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const images: readonly GalleryImage[] = resolveAssets(r, j.galleryIds).map((a) => ({
    id: a.id,
    url: a.url,
    alt: a.alt,
    width: a.width,
    height: a.height,
  }));
  const videos: readonly GalleryVideo[] = j.videoIds
    .map((id) => r.videos.get(id))
    .filter((x): x is { ok: true; value: VideoRecord } => x.ok)
    .map((x) => x.value)
    .map((v) => {
      const asset = r.media.get(v.assetId);
      return {
        id: v.id,
        title: v.title,
        url: asset.ok ? asset.value.url : "",
        durationSeconds: v.durationSeconds,
      };
    });
  return {
    images,
    videos,
    hasMedia: images.length > 0 || videos.length > 0,
  };
};

/* ----------------------------------------------------------------- 8. Journey FAQ */

export interface FaqView {
  readonly anchor: string;
  readonly question: string;
  readonly answer: string;
}

export interface JourneyFaqView {
  readonly items: readonly FaqView[];
  /** Schema.org FAQPage JSON-LD payload, ready to inline. */
  readonly jsonLd: Readonly<Record<string, unknown>>;
}

/** Build a registry-driven, schema-ready FAQ view model. */
export const buildJourneyFaq = (r: ContentRegistries, slug: string): JourneyFaqView | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const items: readonly FaqView[] = j.faqs.map((f: FaqItem) => ({
    anchor: `faq-${slugifyAnchor(f.question)}`,
    question: f.question,
    answer: f.answer,
  }));
  return {
    items,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
  };
};

/* ---------------------------------------------- referenced records (unused guards) */
export type { OperatorRecord };
