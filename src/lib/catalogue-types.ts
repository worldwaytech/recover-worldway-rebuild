// Shared, client-safe types for the catalogue query layer.
import type { CollectionKind, CollectionItem } from "./collections";

export type SupplierStatus = "live" | "on-request";

export interface CatalogueProduct extends CollectionItem {
  kind: CollectionKind;
  collectionTitle: string;
  detailBase: string;
  supplier: string;
  supplierStatus: SupplierStatus;
  rating: number;
  reviewCount: number;
  luxuryLevel: "premium" | "luxury" | "ultra-luxury";
  travelStyles: string[];
  interests: string[];
  durationNights: number | null;
  familyFriendly: boolean;
  accessible: boolean;
  groupSize: "private" | "small-group" | "flexible";
  departureMonths: string[];
  country: string;
}

export type SortKey =
  | "recommended"
  | "price-asc"
  | "price-desc"
  | "duration-asc"
  | "duration-desc"
  | "rating-desc"
  | "title-asc";

export interface CatalogueFilters {
  q?: string;
  destination?: string;
  country?: string;
  region?: string;
  travelStyle?: string;
  interest?: string;
  theme?: string;
  supplier?: string;
  luxuryLevel?: string;
  groupSize?: string;
  departureMonth?: string;
  durationMin?: number;
  durationMax?: number;
  priceMin?: number;
  priceMax?: number;
  minRating?: number;
  familyFriendly?: boolean;
  accessible?: boolean;
  availableOnly?: boolean;
}

export interface CatalogueFacets {
  destinations: string[];
  countries: string[];
  regions: string[];
  travelStyles: string[];
  interests: string[];
  suppliers: string[];
  luxuryLevels: string[];
  groupSizes: string[];
  departureMonths: string[];
  priceRange: { min: number; max: number };
  durationRange: { min: number; max: number };
}

export interface CatalogueQueryResult {
  items: CatalogueProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: CatalogueFacets;
  featured: CatalogueProduct[];
  supplierStatus: SupplierStatus;
  supplierNote: string | null;
}

export const SORT_LABELS: Record<SortKey, string> = {
  recommended: "Recommended",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "duration-asc": "Duration: shortest",
  "duration-desc": "Duration: longest",
  "rating-desc": "Guest rating",
  "title-asc": "A – Z",
};
