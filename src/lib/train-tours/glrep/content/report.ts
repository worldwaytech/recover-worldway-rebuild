/**
 * GLREP Journey Content Domain — registry assembly + completeness report.
 */

import { buildAll } from "./data";
import type { BuiltJourney } from "./factory";
import { type ContentRegistries, type ContentRegistriesInput, buildRegistries } from "./registries";
import { type ValidationReport, validateAll } from "./validation";

const dedupeById = <T extends { readonly id: string }>(records: readonly T[]): T[] => {
  const map = new Map<string, T>();
  for (const r of records) if (!map.has(r.id)) map.set(r.id, r);
  return [...map.values()];
};

/** Assemble the full content registry set from the built journey seeds. */
export const assembleRegistries = (
  built: readonly BuiltJourney[] = buildAll(),
): ContentRegistries => {
  const input: ContentRegistriesInput = {
    journeys: built.map((b) => b.journey),
    operators: dedupeById(built.flatMap((b) => b.operator)),
    trains: dedupeById(built.flatMap((b) => b.train)),
    cabins: dedupeById(built.flatMap((b) => b.cabins)),
    destinations: dedupeById(built.flatMap((b) => b.destinations)),
    unescoSites: dedupeById(built.flatMap((b) => b.unescoSites)),
    excursions: dedupeById(built.flatMap((b) => b.excursions)),
    dining: dedupeById(built.flatMap((b) => b.dining)),
    media: dedupeById(built.flatMap((b) => b.media)),
    brochures: dedupeById(built.flatMap((b) => b.brochures)),
    videos: dedupeById(built.flatMap((b) => b.videos)),
    reviews: dedupeById(built.flatMap((b) => b.reviews)),
    awards: dedupeById(built.flatMap((b) => b.awards)),
  };
  return buildRegistries(input);
};

export interface ContentCompletenessReport {
  readonly journeysWithFullContent: number;
  readonly totalJourneys: number;
  readonly operators: number;
  readonly trains: number;
  readonly cabins: number;
  readonly itineraryDays: number;
  readonly destinations: number;
  readonly unescoSites: number;
  readonly faqs: number;
  readonly galleries: number;
  readonly videos: number;
  readonly brochures: number;
  readonly reviews: number;
  readonly validation: ValidationReport;
  readonly coveragePercentage: number;
}

const isFull = (j: ContentRegistries["journeys"]["all"][number]): boolean =>
  j.itinerary.length > 0 &&
  j.faqs.length > 0 &&
  j.galleryIds.length > 0 &&
  j.cabinIds.length > 0 &&
  !!j.seo.title &&
  !!j.hero.media.assetId;

/** Generate a content completeness report. */
export const generateReport = (r: ContentRegistries): ContentCompletenessReport => {
  const full = r.journeys.all.filter(isFull).length;
  const total = r.journeys.size;
  return {
    journeysWithFullContent: full,
    totalJourneys: total,
    operators: r.operators.size,
    trains: r.trains.size,
    cabins: r.cabins.size,
    itineraryDays: r.journeys.all.reduce((n, j) => n + j.itinerary.length, 0),
    destinations: r.destinations.size,
    unescoSites: r.unescoSites.size,
    faqs: r.journeys.all.reduce((n, j) => n + j.faqs.length, 0),
    galleries: r.journeys.all.reduce((n, j) => n + j.galleryIds.length, 0),
    videos: r.videos.size,
    brochures: r.brochures.size,
    reviews: r.reviews.size,
    validation: validateAll(r),
    coveragePercentage: total === 0 ? 0 : Math.round((full / total) * 100),
  };
};
