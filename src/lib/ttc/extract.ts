// Normalisation of approved TTC website content into catalogue rows.
// Pure functions only — no network, no credentials. Nothing is fabricated:
// fields absent from the source stay null/empty.

import { createHash } from "node:crypto";
import { TTC_BRANDS, type TtcBrand } from "./config";

/** JSON schema handed to the extraction step; mirrors published product fields. */
export const TTC_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    subtitle: { type: "string" },
    summary: { type: "string" },
    description: { type: "string" },
    supplierTourCode: { type: "string" },
    supplierOptionCode: { type: "string" },
    durationDays: { type: "number" },
    durationNights: { type: "number" },
    priceFrom: { type: "number" },
    priceCurrency: { type: "string" },
    priceNote: { type: "string" },
    countries: { type: "array", items: { type: "string" } },
    destinations: { type: "array", items: { type: "string" } },
    startCity: { type: "string" },
    endCity: { type: "string" },
    groupSize: { type: "string" },
    groupSizeMax: { type: "number" },
    tourStyle: { type: "string" },
    tripType: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    inclusions: { type: "array", items: { type: "string" } },
    exclusions: { type: "array", items: { type: "string" } },
    meals: { type: "array", items: { type: "string" } },
    transport: { type: "array", items: { type: "string" } },
    accommodation: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          city: { type: "string" },
          nights: { type: "number" },
        },
      },
    },
    itinerary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          accommodation: { type: "string" },
          destinations: { type: "array", items: { type: "string" } },
          meals: { type: "array", items: { type: "string" } },
        },
      },
    },
    departures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startDate: { type: "string" },
          endDate: { type: "string" },
          price: { type: "number" },
          currency: { type: "string" },
          availability: { type: "string" },
          optionCode: { type: "string" },
        },
      },
    },
    tourOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          label: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    seasons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          priceFrom: { type: "number" },
          currency: { type: "string" },
        },
      },
    },
    reviewRating: { type: "number" },
    reviewCount: { type: "number" },
    images: { type: "array", items: { type: "string" } },
  },
} as const;

export const TTC_EXTRACTION_PROMPT =
  "Extract this guided tour product exactly as published on the page. Include the itinerary day by day, inclusions, exclusions, meals, accommodation, transport, tour options, departure dates with prices, the lead-in 'from' price with its currency, group size, review rating and count, and absolute URLs for the tour photography. Omit any field the page does not state — never guess or infer values.";

export interface TtcTourRow {
  brand: string;
  brand_label: string;
  tour_slug: string;
  source_url: string;
  locale: string;
  supplier_tour_id: string | null;
  supplier_option_id: string | null;
  name: string;
  subtitle: string | null;
  summary: string | null;
  description: string | null;
  hero_image: string | null;
  images: string[];
  duration_days: number | null;
  duration_nights: number | null;
  countries: string[];
  destinations: string[];
  start_city: string | null;
  end_city: string | null;
  group_size: string | null;
  group_size_max: number | null;
  price_from: number | null;
  price_currency: string | null;
  price_note: string | null;
  tour_style: string | null;
  trip_type: string | null;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  itinerary: unknown[];
  accommodation: unknown[];
  transport: string[];
  meals: string[];
  tour_options: unknown[];
  departures: unknown[];
  seasons: unknown[];
  review_rating: number | null;
  review_count: number | null;
  source: string;
  source_payload: Record<string, unknown>;
  content_hash: string;
  source_scraped_at: string;
  synced_at: string;
}

export interface TtcSourceUrl {
  brand: TtcBrand;
  slug: string;
  locale: string;
  url: string;
}

/**
 * Parses a brand website URL into brand/locale/slug, or null when the URL is not
 * a tour product page.
 */
export function parseTtcTourUrl(raw: string, brand: TtcBrand): TtcSourceUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const config = TTC_BRANDS[brand];
  if (!url.hostname.endsWith(new URL(config.site).hostname.replace(/^www\./, ""))) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 3) return null;
  const [locale, section, ...rest] = segments;
  if (!locale || !/^[a-z]{2}-[a-z]{2}$/.test(locale)) return null;
  if (section !== config.tourPathSegment) return null;
  const slug = rest.join("/");
  if (!slug || rest.length > 1) return null;
  if (/^(search|deals|destinations|brochures|reviews)$/.test(slug)) return null;
  return {
    brand,
    slug,
    locale,
    url: `${url.origin}${url.pathname.replace(/\/$/, "")}`,
  };
}

/** Keeps one canonical URL per slug, preferring the brand's locale order. */
export function dedupeTtcUrls(brand: TtcBrand, urls: string[]): TtcSourceUrl[] {
  const order = TTC_BRANDS[brand].locales;
  const bySlug = new Map<string, TtcSourceUrl>();
  for (const raw of urls) {
    const parsed = parseTtcTourUrl(raw, brand);
    if (!parsed) continue;
    const existing = bySlug.get(parsed.slug);
    if (!existing) {
      bySlug.set(parsed.slug, parsed);
      continue;
    }
    const rank = (locale: string) => {
      const index = order.indexOf(locale);
      return index === -1 ? order.length : index;
    };
    if (rank(parsed.locale) < rank(existing.locale)) bySlug.set(parsed.slug, parsed);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const text = str(entry);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function objArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

function absoluteImages(value: unknown, origin: string): string[] {
  const out: string[] = [];
  for (const entry of strArray(value)) {
    let resolved: string | null = null;
    try {
      resolved = new URL(entry, origin).toString();
    } catch {
      resolved = null;
    }
    if (!resolved) continue;
    if (!/^https?:/.test(resolved)) continue;
    if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(resolved)) continue;
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out.slice(0, 40);
}

/**
 * Builds a catalogue row from an extracted document. Returns null when the
 * source did not yield the minimum publishable content (a tour name).
 */
export function buildTtcTourRow(input: {
  source: TtcSourceUrl;
  extracted: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
  documentLinks?: string[] | undefined;
}): TtcTourRow | null {
  const { source, extracted } = input;
  const data = extracted ?? {};
  const metadata = input.metadata ?? {};
  const origin = new URL(source.url).origin;

  const name = str(data["name"]) ?? str(metadata["title"])?.split("|")[0]?.trim() ?? null;
  if (!name) return null;

  const itinerary = objArray(data["itinerary"]).map((day) => ({
    day: num(day["day"]),
    title: str(day["title"]),
    description: str(day["description"]),
    accommodation: str(day["accommodation"]),
    meals: strArray(day["meals"]),
    destinations: strArray(day["destinations"]),
  }));

  const accommodation = objArray(data["accommodation"]).map((hotel) => ({
    name: str(hotel["name"]),
    city: str(hotel["city"]),
    nights: num(hotel["nights"]),
  }));

  const departures = objArray(data["departures"]).map((departure) => ({
    startDate: str(departure["startDate"]),
    endDate: str(departure["endDate"]),
    price: num(departure["price"]),
    currency: str(departure["currency"]),
    availability: str(departure["availability"]),
    optionCode: str(departure["optionCode"]),
  }));

  const tourOptions = objArray(data["tourOptions"]).map((option) => ({
    code: str(option["code"]),
    label: str(option["label"]),
    note: str(option["note"]),
  }));

  const seasons = objArray(data["seasons"]).map((season) => ({
    label: str(season["label"]),
    from: str(season["from"]),
    to: str(season["to"]),
    priceFrom: num(season["priceFrom"]),
    currency: str(season["currency"]),
  }));

  const extractedImages = absoluteImages(data["images"], origin);
  const ogImage = str(metadata["ogImage"]);
  const images = [...(ogImage ? [ogImage] : []), ...extractedImages].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  const durationDays = num(data["durationDays"]);
  const durationNights = num(data["durationNights"]);

  const row: Omit<TtcTourRow, "content_hash" | "synced_at" | "source_scraped_at"> = {
    brand: source.brand,
    brand_label: TTC_BRANDS[source.brand].label,
    tour_slug: source.slug,
    source_url: source.url,
    locale: source.locale,
    supplier_tour_id: str(data["supplierTourCode"]),
    supplier_option_id: str(data["supplierOptionCode"]),
    name,
    subtitle: str(data["subtitle"]),
    summary: str(data["summary"]),
    description: str(data["description"]),
    hero_image: images[0] ?? null,
    images,
    duration_days: durationDays ?? (durationNights !== null ? durationNights + 1 : null),
    duration_nights: durationNights ?? (durationDays !== null ? Math.max(durationDays - 1, 0) : null),
    countries: strArray(data["countries"]),
    destinations: strArray(data["destinations"]),
    start_city: str(data["startCity"]),
    end_city: str(data["endCity"]),
    group_size: str(data["groupSize"]),
    group_size_max: num(data["groupSizeMax"]),
    price_from: num(data["priceFrom"]),
    price_currency: str(data["priceCurrency"]),
    price_note: str(data["priceNote"]),
    tour_style: str(data["tourStyle"]),
    trip_type: str(data["tripType"]),
    highlights: strArray(data["highlights"]),
    inclusions: strArray(data["inclusions"]),
    exclusions: strArray(data["exclusions"]),
    itinerary,
    accommodation,
    transport: strArray(data["transport"]),
    meals: strArray(data["meals"]),
    tour_options: tourOptions,
    departures,
    seasons,
    review_rating: num(data["reviewRating"]),
    review_count: num(data["reviewCount"]),
    source: "website",
    source_payload: { extracted: data, metadata },
  };

  const now = new Date().toISOString();
  return {
    ...row,
    content_hash: hashTtcRow(row),
    source_scraped_at: now,
    synced_at: now,
  };
}

/** Stable fingerprint used for idempotent, change-only writes. */
export function hashTtcRow(row: Record<string, unknown>): string {
  const { source_payload: _payload, ...rest } = row;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return createHash("sha256").update(canonical).digest("hex");
}
