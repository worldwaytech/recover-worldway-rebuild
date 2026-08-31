/**
 * GLREP Journey Content Domain — entity view builders.
 *
 * Purely additive, registry-driven, SSR-safe view models for Operator, Train,
 * and Destination detail/index pages. No business logic is duplicated: these
 * compose the existing {@link ContentRegistries} into presentation shapes.
 *
 * @module glrep/content/entity-views
 */

import type { ContentRegistries, JourneyRecord } from "./registries";
import type { DestinationRecord, MediaAsset, MediaRef, OperatorRecord, TrainRecord } from "./model";

/** A compact reference to a journey for cross-linking from entity pages. */
export interface JourneyLink {
  readonly slug: string;
  readonly name: string;
  readonly destinationSlug: string;
  readonly summary: string;
}

const toJourneyLink = (j: JourneyRecord): JourneyLink => ({
  slug: j.slug,
  name: j.name,
  destinationSlug: j.destinationSlug,
  summary: j.overview.summary,
});

const sortByName = <T extends { readonly name: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

/** Resolve a {@link MediaRef} to its full asset, if present. */
export const resolveMedia = (
  r: ContentRegistries,
  ref: MediaRef | undefined,
): MediaAsset | null => {
  if (!ref) return null;
  const found = r.media.get(ref.assetId);
  return found.ok ? found.value : null;
};

/* ---------------------------------------------------------------- Operators */

export interface OperatorView {
  readonly operator: OperatorRecord;
  readonly logo: MediaAsset | null;
  readonly trains: readonly TrainRecord[];
  readonly journeys: readonly JourneyLink[];
}

export const listOperators = (r: ContentRegistries): readonly OperatorRecord[] =>
  sortByName(r.operators.all);

export const buildOperatorView = (r: ContentRegistries, slug: string): OperatorView | null => {
  const found = r.operators.getBySlug(slug);
  if (!found.ok) return null;
  const operator = found.value;
  const trains = sortByName(r.trains.all.filter((t) => t.operatorId === operator.id));
  const journeys = r.journeys.all.filter((j) => j.operatorId === operator.id).map(toJourneyLink);
  return {
    operator,
    logo: resolveMedia(r, operator.logo),
    trains,
    journeys,
  };
};

/* ------------------------------------------------------------------- Trains */

export interface TrainView {
  readonly train: TrainRecord;
  readonly operator: OperatorRecord | null;
  readonly gallery: readonly MediaAsset[];
  readonly journeys: readonly JourneyLink[];
}

export const listTrains = (r: ContentRegistries): readonly TrainRecord[] =>
  sortByName(r.trains.all);

export const buildTrainView = (r: ContentRegistries, slug: string): TrainView | null => {
  const found = r.trains.getBySlug(slug);
  if (!found.ok) return null;
  const train = found.value;
  const op = r.operators.get(train.operatorId);
  const gallery = train.gallery
    .map((ref) => resolveMedia(r, ref))
    .filter((m): m is MediaAsset => m !== null);
  const journeys = r.journeys.all.filter((j) => j.trainId === train.id).map(toJourneyLink);
  return {
    train,
    operator: op.ok ? op.value : null,
    gallery,
    journeys,
  };
};

/* ------------------------------------------------------------- Destinations */

export interface DestinationView {
  readonly destination: DestinationRecord;
  readonly journeys: readonly JourneyLink[];
}

export const listDestinations = (r: ContentRegistries): readonly DestinationRecord[] =>
  sortByName(r.destinations.all);

export const buildDestinationView = (
  r: ContentRegistries,
  slug: string,
): DestinationView | null => {
  const found = r.destinations.getBySlug(slug);
  if (!found.ok) return null;
  const destination = found.value;
  const journeys = r.journeys.all
    .filter((j) => j.destinationIds.includes(destination.id))
    .map(toJourneyLink);
  return { destination, journeys };
};
