/**
 * GLREP Journey Content Domain — adapters.
 *
 * Composition-only bridges between the content domain and the existing GLREP
 * engines. No existing engine is imported or modified; adapters only read
 * content and shape it for consumers. Engines may opt in by calling these.
 */

import type { JsonLd } from "./model";
import type { ContentRegistries } from "./registries";

/** Resolve a journey's content by GLREP destination slug + scenicRoute id. */
export const findJourneyByRef = (
  r: ContentRegistries,
  destinationSlug: string,
  journeyRef: string,
) =>
  r.journeys.all.find((j) => j.destinationSlug === destinationSlug && j.journeyRef === journeyRef);

/** SEO adapter: head-tag friendly metadata for a journey. */
export interface JourneySeoView {
  readonly title: string;
  readonly description: string;
  readonly keywords: string;
  readonly canonicalPath: string;
  readonly ogImage?: string;
  readonly jsonLd: JsonLd;
}

export const toSeoView = (
  r: ContentRegistries,
  journeySlug: string,
): JourneySeoView | undefined => {
  const found = r.journeys.getBySlug(journeySlug);
  if (!found.ok) return undefined;
  const j = found.value;
  const og = j.seo.ogImageAssetId ? r.media.get(j.seo.ogImageAssetId) : undefined;
  return {
    title: j.seo.title,
    description: j.seo.description,
    keywords: j.seo.keywords.join(", "),
    canonicalPath: j.seo.canonicalPath,
    ogImage: og && og.ok ? og.value.url : undefined,
    jsonLd: j.jsonLd,
  };
};

/** Search adapter: flattened, index-ready document for the existing search engine. */
export interface JourneySearchDoc {
  readonly slug: string;
  readonly destinationSlug: string;
  readonly name: string;
  readonly summary: string;
  readonly durationDays: number;
  readonly keywords: readonly string[];
  readonly destinations: readonly string[];
}

export const toSearchDocs = (r: ContentRegistries): readonly JourneySearchDoc[] =>
  r.journeys.all.map((j) => ({
    slug: j.slug,
    destinationSlug: j.destinationSlug,
    name: j.name,
    summary: j.overview.summary,
    durationDays: j.overview.durationDays,
    keywords: j.seo.keywords,
    destinations: j.destinationIds,
  }));

/** Landing-page adapter: ordered, presentation-ready content blocks for a journey. */
export const toLandingView = (r: ContentRegistries, journeySlug: string) => {
  const found = r.journeys.getBySlug(journeySlug);
  if (!found.ok) return undefined;
  const j = found.value;
  return {
    hero: j.hero,
    overview: j.overview,
    highlights: j.highlights,
    itinerary: j.itinerary,
    faqs: j.faqs,
    practical: j.practical,
    galleryIds: j.galleryIds,
  };
};
