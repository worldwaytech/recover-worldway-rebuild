// TTC shared types — client-safe.

import type { TtcBrand } from "./config";

export interface TtcItineraryDay {
  day: number | null;
  title: string | null;
  description: string | null;
  accommodation: string | null;
  meals: string[];
  destinations: string[];
}

export interface TtcAccommodation {
  name: string | null;
  city: string | null;
  nights: number | null;
}

export interface TtcDeparture {
  startDate: string | null;
  endDate: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  optionCode: string | null;
}

export interface TtcTourOption {
  code: string | null;
  label: string | null;
  note: string | null;
}

export interface TtcSeason {
  label: string | null;
  from: string | null;
  to: string | null;
  priceFrom: number | null;
  currency: string | null;
}

/** Listing card projection — only safe, public columns. */
export interface TtcTourCard {
  id: string;
  brand: TtcBrand | string;
  brandLabel: string | null;
  slug: string;
  name: string;
  subtitle: string | null;
  summary: string | null;
  heroImage: string | null;
  durationDays: number | null;
  durationNights: number | null;
  countries: string[];
  destinations: string[];
  startCity: string | null;
  endCity: string | null;
  priceFrom: number | null;
  priceCurrency: string | null;
  tourStyle: string | null;
  tripType: string | null;
  reviewRating: number | null;
  reviewCount: number | null;
  supplierTourId: string | null;
  sourceUrl: string;
}

/** Full detail projection. */
export interface TtcTourDetail extends TtcTourCard {
  description: string | null;
  priceNote: string | null;
  groupSize: string | null;
  groupSizeMax: number | null;
  images: string[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  meals: string[];
  transport: string[];
  accommodation: TtcAccommodation[];
  itinerary: TtcItineraryDay[];
  departures: TtcDeparture[];
  tourOptions: TtcTourOption[];
  seasons: TtcSeason[];
  supplierOptionId: string | null;
  source: string;
  sourceScrapedAt: string | null;
  apiSyncedAt: string | null;
  syncedAt: string;
}

export interface TtcCatalogueFilters {
  q?: string;
  brands?: string[];
  country?: string;
  destination?: string;
  minDays?: number;
  maxDays?: number;
  maxPrice?: number;
  minPrice?: number;
  tourStyle?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface TtcCatalogueResult {
  items: TtcTourCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface TtcFacets {
  brands: { brand: string; label: string; count: number }[];
  countries: { country: string; count: number }[];
  tourStyles: string[];
  total: number;
  durationRange: { min: number | null; max: number | null };
  priceRange: { min: number | null; max: number | null };
}

export interface TtcSyncOutcome {
  runId: string | null;
  brand: string;
  source: "website" | "api";
  status: "completed" | "failed" | "partial";
  discovered: number;
  imported: number;
  updated: number;
  unchanged: number;
  failed: number;
  cursor: string | null;
  error: string | null;
  failures: { url: string; reason: string }[];
  startedAt: string;
  finishedAt: string;
}

export interface TtcSyncRunRow {
  id: string;
  brand: string;
  source: string;
  resource: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  discovered: number;
  imported: number;
  updated: number;
  unchanged: number;
  failed: number;
  cursor: string | null;
  error: string | null;
}
