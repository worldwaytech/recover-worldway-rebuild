import type { CanonicalOffer } from "./normalize";
import type { Money, NormalizedComponent, SupplierCapability } from "./types";

export type ExperienceCategory =
  | "pilgrimage" | "historical" | "cultural" | "adventure" | "wellness"
  | "food_wine" | "sports" | "events_festivals" | "sightseeing" | "nature"
  | "family" | "nightlife" | "cruises" | "local_life";

export type DestinationLevel = "region" | "country" | "state_province" | "city_location";

export interface DestinationNode {
  id: string;
  name: string;
  level: DestinationLevel;
  parentId?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface DestinationLink {
  experienceId: string;
  destinationId: string;
  primary: boolean;
}

export interface ExperienceRecord {
  id: string;
  supplierKey: string;
  externalId: string;
  title: string;
  description?: string;
  categories: readonly ExperienceCategory[];
  destinationIds: readonly string[];
  durationMinutes?: number;
  quality?: number;
  price?: Money;
  canonicalOffer?: CanonicalOffer;
  includedAccommodation?: boolean;
  bookable: boolean;
  revalidatedAt?: string;
  sourceUpdatedAt?: string;
}

export interface ExperienceSupplierAdapter {
  supplierKey: string;
  capabilities: readonly SupplierCapability[];
  search(input: ExperienceSearchRequest): Promise<ExperienceRecord[]>;
  revalidate(experience: ExperienceRecord, date?: string): Promise<ExperienceRecord>;
}

export interface ExperienceSearchRequest {
  destinationIds: readonly string[];
  categories?: readonly ExperienceCategory[];
  startDate?: string;
  endDate?: string;
  adults: number;
  children?: number;
  currency?: string;
  maxPrice?: Money;
  minimumQuality?: number;
}

export interface MarketplaceSyncSnapshot {
  supplierKey: string;
  observedAt: string;
  expectedUniqueExperienceCount: number;
  observedUniqueExperienceCount: number;
  expectedDestinationLinkCount: number;
  observedDestinationLinkCount: number;
  pages?: number;
  pageSize?: number;
}

export interface MarketplaceCatalogueHealth {
  supplierKey: string;
  expectedUniqueExperiences: number;
  observedUniqueExperiences: number;
  expectedDestinationLinks: number;
  observedDestinationLinks: number;
  healthy: boolean;
  reasons: string[];
}

export interface MarketplaceSearchResult {
  experience: ExperienceRecord;
  destinations: DestinationNode[];
  component?: NormalizedComponent;
  evidence: "live_revalidated" | "catalogue_only";
  bookable: boolean;
  reasons: string[];
}

const CATEGORY_ALIASES: Record<string, ExperienceCategory> = {
  pilgrimage: "pilgrimage", religious: "pilgrimage", spiritual: "pilgrimage",
  historical: "historical", history: "historical",
  cultural: "cultural", culture: "cultural",
  adventure: "adventure", wellness: "wellness", spa: "wellness",
  "food & wine": "food_wine", food: "food_wine", wine: "food_wine",
  sports: "sports", sport: "sports", events: "events_festivals", festivals: "events_festivals",
  sightseeing: "sightseeing", nature: "nature", family: "family",
  nightlife: "nightlife", cruise: "cruises", "local life": "local_life",
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeExperienceCategories(values: readonly string[]): ExperienceCategory[] {
  const result = new Set<ExperienceCategory>();
  for (const value of values) {
    const mapped = CATEGORY_ALIASES[normalizeText(value)];
    if (mapped) result.add(mapped);
  }
  return [...result].sort();
}

export function destinationPath(node: DestinationNode, nodes: ReadonlyMap<string, DestinationNode>): DestinationNode[] {
  const path: DestinationNode[] = [];
  const seen = new Set<string>();
  let current: DestinationNode | undefined = node;
  while (current) {
    if (seen.has(current.id)) throw new Error("Destination hierarchy cycle detected");
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return path;
}

export function validateDestinationHierarchy(nodes: readonly DestinationNode[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const issues: string[] = [];
  const allowedParent: Record<DestinationLevel, DestinationLevel | null> = {
    region: null,
    country: "region",
    state_province: "country",
    city_location: "state_province",
  };
  for (const node of nodes) {
    if (node.parentId && !byId.has(node.parentId)) issues.push(`${node.id}: parent does not exist`);
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent && allowedParent[node.level] !== parent.level) issues.push(`${node.id}: invalid parent level`);
    }
    try { destinationPath(node, byId); } catch (error) { issues.push(error instanceof Error ? `${node.id}: ${error.message}` : `${node.id}: hierarchy invalid`); }
  }
  return issues;
}

export function deduplicateExperiences(records: readonly ExperienceRecord[]): ExperienceRecord[] {
  const byKey = new Map<string, ExperienceRecord>();
  for (const record of records) {
    const key = `${record.supplierKey}:${record.externalId}`;
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, record);
      continue;
    }
    byKey.set(key, {
      ...prior,
      ...record,
      categories: [...new Set([...prior.categories, ...record.categories])].sort(),
      destinationIds: [...new Set([...prior.destinationIds, ...record.destinationIds])].sort(),
      quality: Math.max(prior.quality ?? 0, record.quality ?? 0) || undefined,
      canonicalOffer: record.canonicalOffer ?? prior.canonicalOffer,
    });
  }
  return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function validateMarketplaceSnapshot(snapshot: MarketplaceSyncSnapshot): MarketplaceCatalogueHealth {
  const reasons: string[] = [];
  if (snapshot.observedUniqueExperienceCount !== snapshot.expectedUniqueExperienceCount) {
    reasons.push("unique experience count does not match expected catalogue");
  }
  if (snapshot.observedDestinationLinkCount !== snapshot.expectedDestinationLinkCount) {
    reasons.push("destination link count does not match expected catalogue");
  }
  return {
    supplierKey: snapshot.supplierKey,
    expectedUniqueExperiences: snapshot.expectedUniqueExperienceCount,
    observedUniqueExperiences: snapshot.observedUniqueExperienceCount,
    expectedDestinationLinks: snapshot.expectedDestinationLinkCount,
    observedDestinationLinks: snapshot.observedDestinationLinkCount,
    healthy: reasons.length === 0,
    reasons,
  };
}

export function travelShopBaselineHealth(observedUniqueExperienceCount: number, observedDestinationLinkCount: number): MarketplaceCatalogueHealth {
  return validateMarketplaceSnapshot({
    supplierKey: "travelshop",
    observedAt: new Date().toISOString(),
    expectedUniqueExperienceCount: 8345,
    observedUniqueExperienceCount,
    expectedDestinationLinkCount: 39863,
    observedDestinationLinkCount,
    pages: 835,
    pageSize: 10,
  });
}

export function searchExperienceCatalogue(
  records: readonly ExperienceRecord[],
  destinations: ReadonlyMap<string, DestinationNode>,
  request: ExperienceSearchRequest,
): MarketplaceSearchResult[] {
  const destinationSet = new Set(request.destinationIds);
  return records
    .filter((record) => record.bookable)
    .filter((record) => record.destinationIds.some((id) => destinationSet.has(id)))
    .filter((record) => !request.categories?.length || record.categories.some((category) => request.categories!.includes(category)))
    .filter((record) => request.minimumQuality == null || (record.quality ?? 0) >= request.minimumQuality)
    .filter((record) => !request.maxPrice || !record.price || (record.price.currency === request.maxPrice.currency && record.price.amount <= request.maxPrice.amount))
    .map((record) => {
      const destinationNodes = record.destinationIds.map((id) => destinations.get(id)).filter((x): x is DestinationNode => !!x);
      const component = record.canonicalOffer ? toExperienceComponent(record.canonicalOffer) : undefined;
      const live = !!record.revalidatedAt && !!component;
      return {
        experience: record,
        destinations: destinationNodes,
        component,
        evidence: live ? "live_revalidated" : "catalogue_only",
        bookable: live,
        reasons: live ? [] : ["Live supplier revalidation required before booking"],
      };
    })
    .sort((a, b) => (b.experience.quality ?? 0) - (a.experience.quality ?? 0) || a.experience.id.localeCompare(b.experience.id));
}

export function toExperienceComponent(offer: CanonicalOffer): NormalizedComponent {
  if (offer.kind !== "activity") throw new Error("Experience offer must normalize as activity");
  if (!offer.revalidatedAt) throw new Error("Experience offer is not supplier-revalidated");
  return {
    id: `${offer.supplierKey}:activity:${offer.externalId}`,
    kind: "activity",
    supplierKey: offer.supplierKey,
    externalId: offer.externalId,
    title: offer.title,
    start: offer.start,
    end: offer.end,
    net: offer.net,
    taxes: offer.taxes ?? { amount: 0, currency: offer.net.currency },
    cancellation: { refundable: offer.refundable, freeUntil: offer.freeCancelUntil },
    quality: offer.quality,
    revalidatedAt: offer.revalidatedAt,
  };
}

export const GLOBAL_EXPERIENCE_CATEGORIES: readonly ExperienceCategory[] = [
  "pilgrimage", "historical", "cultural", "adventure", "wellness",
  "food_wine", "sports", "events_festivals", "sightseeing", "nature",
  "family", "nightlife", "cruises", "local_life",
];

export const TRAVELSHOP_BASELINE = Object.freeze({
  supplierKey: "travelshop",
  uniqueExperiences: 8345,
  destinationLinks: 39863,
  pageSize: 10,
  finalPage: 835,
  syncDaysUtc: ["monday", "wednesday", "friday"] as const,
  syncHourUtc: 2,
});
