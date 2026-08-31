/**
 * GLREP Journey Content Domain — Phase 4 Media Centre builders.
 *
 * Purely additive, registry-driven, SSR-safe view-model builders for media:
 * galleries, carousels, hero media, videos, downloadable assets, and CMS asset
 * references. These compose the existing {@link ContentRegistries} and reuse
 * {@link resolveMedia} exclusively — no media logic is duplicated, no assets are
 * hardcoded, and no existing module is modified. All builders are pure functions
 * safe to run during SSR. Presentation is fully separated into components.
 *
 * @module glrep/content/media-centre
 */

import type { ContentRegistries, JourneyRecord } from "./registries";
import type { MediaAsset, MediaKind, MediaRef, VideoRecord } from "./model";
import { resolveMedia } from "./entity-views";

/* --------------------------------------------------------------- categories */

/** Logical CMS asset reference categories surfaced by the Media Centre. */
export type MediaCategory =
  | "hero"
  | "gallery"
  | "operator"
  | "train"
  | "destination"
  | "carriage"
  | "cabin"
  | "brochure"
  | "pricing"
  | "itinerary"
  | "maps"
  | "videos"
  | "downloads";

/** Collection scopes supported by the Media Centre. */
export type MediaCollectionScope =
  | "featured-journeys"
  | "luxury-collections"
  | "seasonal-collections"
  | "operators"
  | "trains"
  | "destinations";

/* ----------------------------------------------------------------- models */

/** Responsive image presentation model (no image processing — metadata only). */
export interface ResponsiveImageModel {
  readonly src: string;
  readonly srcSet: string;
  readonly sizes: string;
  readonly aspectRatio: number | null;
  readonly width?: number;
  readonly height?: number;
  readonly placeholder: string;
  readonly thumbnail: string;
  readonly preload: boolean;
}

/** A single gallery/lightbox-ready media item. */
export interface MediaItem {
  readonly id: string;
  readonly kind: MediaKind;
  readonly category: MediaCategory;
  readonly url: string;
  readonly alt: string;
  readonly caption?: string;
  readonly credit?: string;
  readonly order: number;
  readonly featured: boolean;
  readonly responsive: ResponsiveImageModel;
}

/** Video presentation model with accessibility + chapter metadata. */
export interface VideoModel {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly kind: "embedded" | "hosted" | "hero";
  readonly poster: string | null;
  readonly durationSeconds?: number;
  readonly transcriptUrl: string | null;
  readonly captionsUrl: string | null;
  readonly chapters: readonly VideoChapter[];
  readonly ariaLabel: string;
}

/** A video chapter marker. */
export interface VideoChapter {
  readonly startSeconds: number;
  readonly title: string;
}

/** Downloadable asset variant (e.g. brochures, maps). */
export interface DownloadAsset {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly category: MediaCategory;
  readonly kind: MediaKind;
}

/** A grouped, presentation-ready media collection. */
export interface MediaCollection {
  readonly scope: MediaCollectionScope | "journey" | "ad-hoc";
  readonly title: string;
  readonly featured: MediaItem | null;
  readonly items: readonly MediaItem[];
  readonly videos: readonly VideoModel[];
  readonly downloads: readonly DownloadAsset[];
  readonly hasMedia: boolean;
}

/* --------------------------------------------------------------- utilities */

const getJourney = (r: ContentRegistries, slug: string): JourneyRecord | null => {
  const found = r.journeys.getBySlug(slug);
  return found.ok ? found.value : null;
};

const aspectRatio = (a: MediaAsset): number | null =>
  a.width && a.height && a.height > 0 ? a.width / a.height : null;

/** Build a responsive-image presentation model (metadata only, no processing). */
export const buildResponsiveImage = (
  a: MediaAsset,
  options?: { readonly preload?: boolean; readonly sizes?: string },
): ResponsiveImageModel => {
  const breakpoints = [480, 768, 1024, 1440, 1920];
  const srcSet = breakpoints.map((w) => `${a.url}?w=${w} ${w}w`).join(", ");
  return {
    src: a.url,
    srcSet,
    sizes: options?.sizes ?? "(max-width: 768px) 100vw, 50vw",
    aspectRatio: aspectRatio(a),
    width: a.width,
    height: a.height,
    placeholder: `${a.url}?w=24&blur=1`,
    thumbnail: `${a.url}?w=320`,
    preload: options?.preload ?? false,
  };
};

const toMediaItem = (
  a: MediaAsset,
  category: MediaCategory,
  order: number,
  featured: boolean,
  ref?: MediaRef,
): MediaItem => ({
  id: a.id,
  kind: a.kind,
  category,
  url: a.url,
  alt: ref?.alt ?? a.alt,
  caption: ref?.caption,
  credit: a.credit,
  order,
  featured,
  responsive: buildResponsiveImage(a, { preload: featured }),
});

const resolveRefItems = (
  r: ContentRegistries,
  refs: readonly MediaRef[],
  category: MediaCategory,
): MediaItem[] =>
  refs
    .map((ref, i) => {
      const asset = resolveMedia(r, ref);
      return asset ? toMediaItem(asset, category, i, i === 0, ref) : null;
    })
    .filter((m): m is MediaItem => m !== null);

const resolveIdItems = (
  r: ContentRegistries,
  ids: readonly string[],
  category: MediaCategory,
): MediaItem[] =>
  ids
    .map((id, i) => {
      const found = r.media.get(id);
      return found.ok ? toMediaItem(found.value, category, i, i === 0) : null;
    })
    .filter((m): m is MediaItem => m !== null);

const videoKind = (asset: MediaAsset): VideoModel["kind"] =>
  /youtube|vimeo|embed/i.test(asset.url) ? "embedded" : "hosted";

const toVideoModel = (
  r: ContentRegistries,
  v: VideoRecord,
  kindOverride?: VideoModel["kind"],
): VideoModel | null => {
  const asset = r.media.get(v.assetId);
  if (!asset.ok) return null;
  const a = asset.value;
  return {
    id: v.id,
    title: v.title,
    url: a.url,
    kind: kindOverride ?? videoKind(a),
    poster: a.url ? `${a.url}?poster=1` : null,
    durationSeconds: v.durationSeconds,
    transcriptUrl: `${a.url}?transcript=1`,
    captionsUrl: `${a.url}?captions=vtt`,
    chapters: [],
    ariaLabel: v.title,
  };
};

const resolveVideos = (r: ContentRegistries, ids: readonly string[]): VideoModel[] =>
  ids
    .map((id) => r.videos.get(id))
    .filter((x): x is { ok: true; value: VideoRecord } => x.ok)
    .map((x) => toVideoModel(r, x.value))
    .filter((v): v is VideoModel => v !== null);

const resolveDownloads = (
  r: ContentRegistries,
  ids: readonly string[],
  category: MediaCategory,
): DownloadAsset[] =>
  ids
    .map((id) => r.brochures.get(id))
    .filter((x): x is { ok: true; value: import("./model").BrochureRecord } => x.ok)
    .map((x) => {
      const asset = r.media.get(x.value.assetId);
      if (!asset.ok) return null;
      return {
        id: x.value.id,
        title: x.value.title,
        url: asset.value.url,
        category,
        kind: asset.value.kind,
      };
    })
    .filter((d): d is DownloadAsset => d !== null);

const emptyCollection = (scope: MediaCollection["scope"], title: string): MediaCollection => ({
  scope,
  title,
  featured: null,
  items: [],
  videos: [],
  downloads: [],
  hasMedia: false,
});

const assembleCollection = (
  scope: MediaCollection["scope"],
  title: string,
  items: readonly MediaItem[],
  videos: readonly VideoModel[],
  downloads: readonly DownloadAsset[],
): MediaCollection => {
  const ordered = [...items].sort((a, b) =>
    a.featured === b.featured ? a.order - b.order : a.featured ? -1 : 1,
  );
  return {
    scope,
    title,
    featured: ordered.find((i) => i.featured) ?? ordered[0] ?? null,
    items: ordered,
    videos,
    downloads,
    hasMedia: ordered.length > 0 || videos.length > 0 || downloads.length > 0,
  };
};

/* ------------------------------------------------------------- Media Engine */

/** Build an ad-hoc media collection from explicit asset ids. */
export const buildMediaCollection = (
  r: ContentRegistries,
  title: string,
  ids: readonly string[],
  category: MediaCategory = "gallery",
): MediaCollection => assembleCollection("ad-hoc", title, resolveIdItems(r, ids, category), [], []);

/** Build the full media collection for a journey across every category. */
export const buildJourneyMedia = (r: ContentRegistries, slug: string): MediaCollection | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const hero = resolveRefItems(r, [j.hero.media], "hero");
  const gallery = resolveIdItems(r, j.galleryIds, "gallery");
  const items = [...hero, ...gallery];
  const videos = resolveVideos(r, j.videoIds);
  const downloads = resolveDownloads(r, j.brochureIds, "brochure");
  return assembleCollection("journey", j.name, items, videos, downloads);
};

/** Build media for an operator (logo + associated train galleries). */
export const buildOperatorMedia = (r: ContentRegistries, slug: string): MediaCollection | null => {
  const found = r.operators.getBySlug(slug);
  if (!found.ok) return null;
  const op = found.value;
  const logo = op.logo ? resolveRefItems(r, [op.logo], "operator") : [];
  const trainGalleries = r.trains.all
    .filter((t) => t.operatorId === op.id)
    .flatMap((t) => resolveRefItems(r, t.gallery, "train"));
  return assembleCollection("operators", op.name, [...logo, ...trainGalleries], [], []);
};

/** Build media for a train (gallery + cabin galleries). */
export const buildTrainMedia = (r: ContentRegistries, slug: string): MediaCollection | null => {
  const found = r.trains.getBySlug(slug);
  if (!found.ok) return null;
  const train = found.value;
  const gallery = resolveRefItems(r, train.gallery, "train");
  const cabins = r.cabins.all
    .filter((c) => c.trainId === train.id)
    .flatMap((c) => resolveRefItems(r, c.gallery, "cabin"));
  return assembleCollection("trains", train.name, [...gallery, ...cabins], [], []);
};

/** Build media for a destination. */
export const buildDestinationMedia = (
  r: ContentRegistries,
  slug: string,
): MediaCollection | null => {
  const found = r.destinations.getBySlug(slug);
  if (!found.ok) return null;
  const dest = found.value;
  const items = r.journeys.all
    .filter((j) => j.destinationIds.includes(dest.id))
    .flatMap((j) => resolveRefItems(r, [j.hero.media], "destination"));
  return assembleCollection("destinations", dest.name, items, [], []);
};

/** Build a featured media collection from featured journey hero images. */
export const buildFeaturedMedia = (
  r: ContentRegistries,
  options?: { readonly limit?: number },
): MediaCollection => {
  const limit = options?.limit ?? 12;
  const items = r.journeys.all
    .slice(0, limit)
    .map((j, i) => {
      const asset = resolveMedia(r, j.hero.media);
      return asset ? toMediaItem(asset, "hero", i, i === 0, j.hero.media) : null;
    })
    .filter((m): m is MediaItem => m !== null);
  return assembleCollection("featured-journeys", "Featured Journeys", items, [], []);
};

/** Group media items by their logical CMS category. */
export const groupMediaByCategory = (
  items: readonly MediaItem[],
): ReadonlyMap<MediaCategory, readonly MediaItem[]> => {
  const map = new Map<MediaCategory, MediaItem[]>();
  for (const item of items) {
    const bucket = map.get(item.category) ?? [];
    bucket.push(item);
    map.set(item.category, bucket);
  }
  return map;
};

/** Group media items by underlying media kind (image/video/etc). */
export const groupMediaByType = (
  items: readonly MediaItem[],
): ReadonlyMap<MediaKind, readonly MediaItem[]> => {
  const map = new Map<MediaKind, MediaItem[]>();
  for (const item of items) {
    const bucket = map.get(item.kind) ?? [];
    bucket.push(item);
    map.set(item.kind, bucket);
  }
  return map;
};

/* --------------------------------------------------------- Gallery / Video */

/** Lightbox-ready gallery view derived from a media collection. */
export interface GalleryView {
  readonly items: readonly MediaItem[];
  readonly featured: MediaItem | null;
  readonly total: number;
}

/** Build a lightbox-ready gallery view from a collection. */
export const buildGalleryView = (collection: MediaCollection): GalleryView => ({
  items: collection.items,
  featured: collection.featured,
  total: collection.items.length,
});

/** Build a hero media model from a journey (image or hero video). */
export const buildHeroMedia = (
  r: ContentRegistries,
  slug: string,
): { readonly image: MediaItem | null; readonly video: VideoModel | null } | null => {
  const j = getJourney(r, slug);
  if (!j) return null;
  const asset = resolveMedia(r, j.hero.media);
  const image = asset ? toMediaItem(asset, "hero", 0, true, j.hero.media) : null;
  const heroVideoId = j.videoIds[0];
  const videoRec = heroVideoId ? r.videos.get(heroVideoId) : null;
  const video = videoRec && videoRec.ok ? toVideoModel(r, videoRec.value, "hero") : null;
  return { image, video };
};

/* --------------------------------------------------------- Accessibility */

/** Accessibility audit result for a single media item. */
export interface MediaA11yResult {
  readonly id: string;
  readonly hasAlt: boolean;
  readonly hasCaption: boolean;
  readonly valid: boolean;
}

/** Validate alt text + captions for a set of media items. */
export const validateMediaA11y = (items: readonly MediaItem[]): readonly MediaA11yResult[] =>
  items.map((i) => {
    const hasAlt = i.alt.trim().length > 0;
    const hasCaption = (i.caption ?? "").trim().length > 0;
    return { id: i.id, hasAlt, hasCaption, valid: hasAlt };
  });

/** Validate transcript availability for videos. */
export const validateVideoA11y = (
  videos: readonly VideoModel[],
): readonly {
  readonly id: string;
  readonly hasTranscript: boolean;
  readonly hasCaptions: boolean;
}[] =>
  videos.map((v) => ({
    id: v.id,
    hasTranscript: !!v.transcriptUrl,
    hasCaptions: !!v.captionsUrl,
  }));
