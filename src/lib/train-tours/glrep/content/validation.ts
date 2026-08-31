/**
 * GLREP Journey Content Domain — validation.
 *
 * Pure, deterministic validators returning structured issues. No throwing.
 */

import { type ContentError, contentError } from "./model";
import type { ContentRegistries } from "./registries";

export interface ValidationReport {
  readonly ok: boolean;
  readonly issues: readonly ContentError[];
}

const merge = (...groups: readonly ContentError[][]): ValidationReport => {
  const issues = groups.flat();
  return { ok: issues.length === 0, issues };
};

/** Duplicate slugs across all slugged registries. */
export const validateDuplicateSlugs = (r: ContentRegistries): ContentError[] => {
  const issues: ContentError[] = [];
  const groups: [string, readonly { readonly slug: string }[]][] = [
    ["journey", r.journeys.all],
    ["operator", r.operators.all],
    ["train", r.trains.all],
    ["cabin", r.cabins.all],
    ["destination", r.destinations.all],
    ["unesco", r.unescoSites.all],
    ["excursion", r.excursions.all],
    ["dining", r.dining.all],
    ["brochure", r.brochures.all],
    ["video", r.videos.all],
  ];
  for (const [label, records] of groups) {
    const seen = new Set<string>();
    for (const rec of records) {
      if (seen.has(rec.slug)) {
        issues.push(contentError("DUPLICATE_SLUG", `Duplicate ${label} slug: ${rec.slug}`));
      }
      seen.add(rec.slug);
    }
  }
  return issues;
};

/** Broken references, orphaned operators/trains/cabins, invalid destinations. */
export const validateReferences = (r: ContentRegistries): ContentError[] => {
  const issues: ContentError[] = [];
  for (const j of r.journeys.all) {
    if (!r.operators.has(j.operatorId)) {
      issues.push(contentError("ORPHANED_OPERATOR", `${j.slug}: operator ${j.operatorId}`));
    }
    if (!r.trains.has(j.trainId)) {
      issues.push(contentError("ORPHANED_TRAIN", `${j.slug}: train ${j.trainId}`));
    }
    for (const cabinId of j.cabinIds) {
      if (!r.cabins.has(cabinId)) {
        issues.push(contentError("ORPHANED_CABIN", `${j.slug}: cabin ${cabinId}`));
      }
    }
    for (const d of j.destinationIds) {
      if (!r.destinations.has(d)) {
        issues.push(contentError("INVALID_DESTINATION", `${j.slug}: destination ${d}`));
      }
    }
    for (const u of j.unescoSiteIds) {
      if (!r.unescoSites.has(u)) {
        issues.push(contentError("BROKEN_REFERENCE", `${j.slug}: unesco ${u}`));
      }
    }
    for (const e of j.excursionIds) {
      if (!r.excursions.has(e)) {
        issues.push(contentError("BROKEN_REFERENCE", `${j.slug}: excursion ${e}`));
      }
    }
    for (const d of j.diningIds) {
      if (!r.dining.has(d)) {
        issues.push(contentError("BROKEN_REFERENCE", `${j.slug}: dining ${d}`));
      }
    }
    for (const id of j.reviewIds) {
      if (!r.reviews.has(id))
        issues.push(contentError("BROKEN_REFERENCE", `${j.slug}: review ${id}`));
    }
    for (const id of j.awardIds) {
      if (!r.awards.has(id))
        issues.push(contentError("BROKEN_REFERENCE", `${j.slug}: award ${id}`));
    }
    for (const id of j.brochureIds) {
      if (!r.brochures.has(id))
        issues.push(contentError("BROKEN_REFERENCE", `${j.slug}: brochure ${id}`));
    }
    for (const id of j.videoIds) {
      if (!r.videos.has(id))
        issues.push(contentError("BROKEN_REFERENCE", `${j.slug}: video ${id}`));
    }
    // Cabin -> train orphan check.
  }
  for (const cabin of r.cabins.all) {
    if (!r.trains.has(cabin.trainId)) {
      issues.push(contentError("ORPHANED_CABIN", `cabin ${cabin.slug}: train ${cabin.trainId}`));
    }
  }
  for (const train of r.trains.all) {
    if (!r.operators.has(train.operatorId)) {
      issues.push(
        contentError("ORPHANED_TRAIN", `train ${train.slug}: operator ${train.operatorId}`),
      );
    }
  }
  return issues;
};

/** Missing media assets referenced by gallery/video/brochure ids. */
export const validateMedia = (r: ContentRegistries): ContentError[] => {
  const issues: ContentError[] = [];
  for (const j of r.journeys.all) {
    if (!r.media.has(j.hero.media.assetId)) {
      issues.push(contentError("MISSING_MEDIA", `${j.slug}: hero media ${j.hero.media.assetId}`));
    }
    for (const g of j.galleryIds) {
      if (!r.media.has(g)) issues.push(contentError("MISSING_MEDIA", `${j.slug}: gallery ${g}`));
    }
  }
  for (const b of r.brochures.all) {
    if (!r.media.has(b.assetId))
      issues.push(contentError("MISSING_MEDIA", `brochure ${b.slug}: ${b.assetId}`));
  }
  for (const v of r.videos.all) {
    if (!r.media.has(v.assetId))
      issues.push(contentError("MISSING_MEDIA", `video ${v.slug}: ${v.assetId}`));
  }
  return issues;
};

/** SEO completeness. */
export const validateSeo = (r: ContentRegistries): ContentError[] => {
  const issues: ContentError[] = [];
  for (const j of r.journeys.all) {
    const { seo } = j;
    if (!seo.title || !seo.description || seo.keywords.length === 0 || !seo.canonicalPath) {
      issues.push(contentError("MISSING_SEO", `${j.slug}: incomplete SEO`));
    }
  }
  return issues;
};

/** Itinerary day numbering must be contiguous from 1 and match durationDays. */
export const validateItinerary = (r: ContentRegistries): ContentError[] => {
  const issues: ContentError[] = [];
  for (const j of r.journeys.all) {
    const days = [...j.itinerary].map((d) => d.day).sort((a, b) => a - b);
    if (days.length === 0) {
      issues.push(contentError("ITINERARY_INCONSISTENT", `${j.slug}: no itinerary days`));
      continue;
    }
    for (let i = 0; i < days.length; i++) {
      if (days[i] !== i + 1) {
        issues.push(contentError("ITINERARY_INCONSISTENT", `${j.slug}: day gap at ${i + 1}`));
        break;
      }
    }
    if (days.length !== j.overview.durationDays) {
      issues.push(
        contentError(
          "ITINERARY_INCONSISTENT",
          `${j.slug}: ${days.length} days vs duration ${j.overview.durationDays}`,
        ),
      );
    }
  }
  return issues;
};

/** Run every validator and aggregate. */
export const validateAll = (r: ContentRegistries): ValidationReport =>
  merge(
    validateDuplicateSlugs(r),
    validateReferences(r),
    validateMedia(r),
    validateSeo(r),
    validateItinerary(r),
  );
