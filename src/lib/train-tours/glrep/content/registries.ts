/**
 * GLREP Journey Content Domain — registries.
 *
 * Configuration-driven, immutable registries. Each wraps a frozen array of
 * records and exposes deterministic lookups. Adding journeys/entities requires
 * only appending data — no code changes.
 */

import {
  type AwardRecord,
  type BrochureRecord,
  type CabinRecord,
  type ContentError,
  type ContentResult,
  type DestinationRecord,
  type DiningRecord,
  type ExcursionRecord,
  type JourneyContent,
  type MediaAsset,
  type OperatorRecord,
  type ReviewRecord,
  type TrainRecord,
  type UnescoSiteRecord,
  type VideoRecord,
  cerr,
  cok,
  contentError,
} from "./model";

/** Generic immutable, id-keyed registry. */
export class Registry<T extends { readonly id: string }> {
  private readonly byId: ReadonlyMap<string, T>;
  readonly all: readonly T[];

  constructor(records: readonly T[]) {
    const map = new Map<string, T>();
    for (const r of records) map.set(r.id, r);
    this.byId = map;
    this.all = Object.freeze([...records]);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): ContentResult<T, ContentError> {
    const found = this.byId.get(id);
    if (!found) return cerr(contentError("NOT_FOUND", `No record: ${id}`));
    return cok(found);
  }

  get size(): number {
    return this.all.length;
  }
}

/** Registry variant that also indexes by slug for URL resolution. */
export class SluggedRegistry<
  T extends { readonly id: string; readonly slug: string },
> extends Registry<T> {
  private readonly bySlug: ReadonlyMap<string, T>;

  constructor(records: readonly T[]) {
    super(records);
    const map = new Map<string, T>();
    for (const r of records) map.set(r.slug, r);
    this.bySlug = map;
  }

  getBySlug(slug: string): ContentResult<T, ContentError> {
    const found = this.bySlug.get(slug);
    if (!found) return cerr(contentError("NOT_FOUND", `No record for slug: ${slug}`));
    return cok(found);
  }
}

/** Aggregate of every content registry, injected into validators/adapters. */
export interface ContentRegistries {
  readonly journeys: SluggedRegistry<JourneyContent & { readonly id: string }>;
  readonly operators: SluggedRegistry<OperatorRecord>;
  readonly trains: SluggedRegistry<TrainRecord>;
  readonly cabins: SluggedRegistry<CabinRecord>;
  readonly destinations: SluggedRegistry<DestinationRecord>;
  readonly unescoSites: SluggedRegistry<UnescoSiteRecord>;
  readonly excursions: SluggedRegistry<ExcursionRecord>;
  readonly dining: SluggedRegistry<DiningRecord>;
  readonly media: Registry<MediaAsset>;
  readonly brochures: SluggedRegistry<BrochureRecord>;
  readonly videos: SluggedRegistry<VideoRecord>;
  readonly reviews: Registry<ReviewRecord>;
  readonly awards: Registry<AwardRecord>;
}

/** Journey records carry their slug as id for the slugged registry. */
export type JourneyRecord = JourneyContent & { readonly id: string };

export const toJourneyRecord = (j: JourneyContent): JourneyRecord => ({ ...j, id: j.slug });

export interface ContentRegistriesInput {
  readonly journeys: readonly JourneyContent[];
  readonly operators: readonly OperatorRecord[];
  readonly trains: readonly TrainRecord[];
  readonly cabins: readonly CabinRecord[];
  readonly destinations: readonly DestinationRecord[];
  readonly unescoSites: readonly UnescoSiteRecord[];
  readonly excursions: readonly ExcursionRecord[];
  readonly dining: readonly DiningRecord[];
  readonly media: readonly MediaAsset[];
  readonly brochures: readonly BrochureRecord[];
  readonly videos: readonly VideoRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly awards: readonly AwardRecord[];
}

export const buildRegistries = (input: ContentRegistriesInput): ContentRegistries => ({
  journeys: new SluggedRegistry(input.journeys.map(toJourneyRecord)),
  operators: new SluggedRegistry(input.operators),
  trains: new SluggedRegistry(input.trains),
  cabins: new SluggedRegistry(input.cabins),
  destinations: new SluggedRegistry(input.destinations),
  unescoSites: new SluggedRegistry(input.unescoSites),
  excursions: new SluggedRegistry(input.excursions),
  dining: new SluggedRegistry(input.dining),
  media: new Registry(input.media),
  brochures: new SluggedRegistry(input.brochures),
  videos: new SluggedRegistry(input.videos),
  reviews: new Registry(input.reviews),
  awards: new Registry(input.awards),
});
