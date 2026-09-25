// Public TTC catalogue reads — SERVER ONLY.
// Uses the publishable key with narrow column projections; no credentials leak.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  TtcCatalogueFilters,
  TtcCatalogueResult,
  TtcFacets,
  TtcTourCard,
  TtcTourDetail,
} from "./types";

const CARD_COLUMNS =
  "id, brand, brand_label, tour_slug, name, subtitle, summary, hero_image, duration_days, duration_nights, countries, destinations, start_city, end_city, price_from, price_currency, tour_style, trip_type, review_rating, review_count, supplier_tour_id, source_url";

const DETAIL_COLUMNS = `${CARD_COLUMNS}, description, price_note, group_size, group_size_max, images, highlights, inclusions, exclusions, meals, transport, accommodation, itinerary, departures, tour_options, seasons, supplier_option_id, source, source_scraped_at, api_synced_at, synced_at`;

function publicDb(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Catalogue backend configuration is unavailable.");
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function toArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function toCard(row: Record<string, unknown>): TtcTourCard {
  return {
    id: row["id"] as string,
    brand: row["brand"] as string,
    brandLabel: (row["brand_label"] as string) ?? null,
    slug: row["tour_slug"] as string,
    name: row["name"] as string,
    subtitle: (row["subtitle"] as string) ?? null,
    summary: (row["summary"] as string) ?? null,
    heroImage: (row["hero_image"] as string) ?? null,
    durationDays: (row["duration_days"] as number) ?? null,
    durationNights: (row["duration_nights"] as number) ?? null,
    countries: toArray(row["countries"]),
    destinations: toArray(row["destinations"]),
    startCity: (row["start_city"] as string) ?? null,
    endCity: (row["end_city"] as string) ?? null,
    priceFrom: row["price_from"] === null ? null : Number(row["price_from"]),
    priceCurrency: (row["price_currency"] as string) ?? null,
    tourStyle: (row["tour_style"] as string) ?? null,
    tripType: (row["trip_type"] as string) ?? null,
    reviewRating: row["review_rating"] === null ? null : Number(row["review_rating"]),
    reviewCount: (row["review_count"] as number) ?? null,
    supplierTourId: (row["supplier_tour_id"] as string) ?? null,
    sourceUrl: row["source_url"] as string,
  };
}

export async function searchTtcCatalogue(
  filters: TtcCatalogueFilters = {},
): Promise<TtcCatalogueResult> {
  const db = publicDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(6, filters.pageSize ?? 24));

  let query = db.from("ttc_tours").select(CARD_COLUMNS, { count: "exact" }).eq("is_active", true);

  if (filters.q) {
    const term = filters.q.replace(/[%,()]/g, " ").trim();
    if (term) query = query.or(`name.ilike.%${term}%,summary.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (filters.brands?.length) query = query.in("brand", filters.brands);
  if (filters.country) query = query.contains("countries", [filters.country]);
  if (filters.destination) query = query.contains("destinations", [filters.destination]);
  if (filters.tourStyle) query = query.eq("tour_style", filters.tourStyle);
  if (filters.minDays !== undefined) query = query.gte("duration_days", filters.minDays);
  if (filters.maxDays !== undefined) query = query.lte("duration_days", filters.maxDays);
  if (filters.minPrice !== undefined) query = query.gte("price_from", filters.minPrice);
  if (filters.maxPrice !== undefined) query = query.lte("price_from", filters.maxPrice);

  switch (filters.sort) {
    case "price-asc":
      query = query.order("price_from", { ascending: true, nullsFirst: false });
      break;
    case "price-desc":
      query = query.order("price_from", { ascending: false, nullsFirst: false });
      break;
    case "duration-asc":
      query = query.order("duration_days", { ascending: true, nullsFirst: false });
      break;
    case "duration-desc":
      query = query.order("duration_days", { ascending: false, nullsFirst: false });
      break;
    case "name-asc":
      query = query.order("name", { ascending: true });
      break;
    case "rating-desc":
      query = query.order("review_rating", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query
        .order("review_count", { ascending: false, nullsFirst: false })
        .order("name", { ascending: true });
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(`The TTC catalogue could not be searched: ${error.message}`);

  const total = count ?? 0;
  return {
    items: (data ?? []).map((row) => toCard(row as Record<string, unknown>)),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTtcTour(brand: string, slug: string): Promise<TtcTourDetail | null> {
  const db = publicDb();
  const { data, error } = await db
    .from("ttc_tours")
    .select(DETAIL_COLUMNS)
    .eq("is_active", true)
    .eq("brand", brand)
    .eq("tour_slug", slug)
    .maybeSingle();
  if (error) throw new Error(`The TTC tour could not be loaded: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;

  const jsonArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

  return {
    ...toCard(row),
    description: (row["description"] as string) ?? null,
    priceNote: (row["price_note"] as string) ?? null,
    groupSize: (row["group_size"] as string) ?? null,
    groupSizeMax: (row["group_size_max"] as number) ?? null,
    images: toArray(row["images"]),
    highlights: toArray(row["highlights"]),
    inclusions: toArray(row["inclusions"]),
    exclusions: toArray(row["exclusions"]),
    meals: toArray(row["meals"]),
    transport: toArray(row["transport"]),
    accommodation: jsonArray(row["accommodation"]),
    itinerary: jsonArray(row["itinerary"]),
    departures: jsonArray(row["departures"]),
    tourOptions: jsonArray(row["tour_options"]),
    seasons: jsonArray(row["seasons"]),
    supplierOptionId: (row["supplier_option_id"] as string) ?? null,
    source: (row["source"] as string) ?? "website",
    sourceScrapedAt: (row["source_scraped_at"] as string) ?? null,
    apiSyncedAt: (row["api_synced_at"] as string) ?? null,
    syncedAt: row["synced_at"] as string,
  };
}

export async function getTtcFacets(): Promise<TtcFacets> {
  const db = publicDb();
  const { data, error } = await db
    .from("ttc_tours")
    .select("brand, brand_label, countries, tour_style, duration_days, price_from")
    .eq("is_active", true)
    .limit(5000);
  if (error) throw new Error(`The TTC filters could not be loaded: ${error.message}`);

  const brands = new Map<string, { brand: string; label: string; count: number }>();
  const countries = new Map<string, number>();
  const styles = new Set<string>();
  let minDays: number | null = null;
  let maxDays: number | null = null;
  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const brand = row["brand"] as string;
    const entry = brands.get(brand) ?? {
      brand,
      label: (row["brand_label"] as string) ?? brand,
      count: 0,
    };
    entry.count += 1;
    brands.set(brand, entry);

    for (const country of toArray(row["countries"])) {
      countries.set(country, (countries.get(country) ?? 0) + 1);
    }
    const style = row["tour_style"] as string | null;
    if (style) styles.add(style);

    const days = row["duration_days"] as number | null;
    if (days !== null) {
      minDays = minDays === null ? days : Math.min(minDays, days);
      maxDays = maxDays === null ? days : Math.max(maxDays, days);
    }
    const price = row["price_from"] === null ? null : Number(row["price_from"]);
    if (price !== null) {
      minPrice = minPrice === null ? price : Math.min(minPrice, price);
      maxPrice = maxPrice === null ? price : Math.max(maxPrice, price);
    }
  }

  return {
    brands: [...brands.values()].sort((a, b) => b.count - a.count),
    countries: [...countries.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
      .slice(0, 60),
    tourStyles: [...styles].sort(),
    total: (data ?? []).length,
    durationRange: { min: minDays, max: maxDays },
    priceRange: { min: minPrice, max: maxPrice },
  };
}

/** Slugs for sitemap/prerender use. */
export async function listTtcTourKeys(limit = 2000) {
  const db = publicDb();
  const { data, error } = await db
    .from("ttc_tours")
    .select("brand, tour_slug, updated_at")
    .eq("is_active", true)
    .order("brand")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as { brand: string; tour_slug: string; updated_at: string }[];
}
