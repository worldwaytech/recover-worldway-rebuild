// Worldway tour marketplace — server-only reads over the synced catalogue plus
// live availability/pricing. Returns Worldway DTOs only: no supplier name,
// IDs of the operator company, net prices or raw supplier references.
import { TRAVELSHOP_PATHS, travelshopRequest } from "./client.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Untyped view: these rows are mapped to Worldway DTOs explicitly below.
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
}

export const PAGE_SIZE = 24;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TourRow = { price_from: number | null; [k: string]: any };
const CARD_COLS =
  "slug, name, summary, category_name, destinations, country, duration_days, duration_hours, rating, review_count, currency, price_from, cover_image, is_private, is_regular, free_cancellation, instant_confirmation, languages";

export interface SearchInput {
  query?: string;
  destination?: string;
  country?: string;
  category?: string;
  activity?: string;
  language?: string;
  duration?: "day" | "2-4" | "5-8" | "9+";
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sort?: "popular" | "price-asc" | "price-desc" | "rating" | "duration";
  page?: number;
}

export async function searchTours(input: SearchInput) {
  const db = await admin();
  const page = input.page ?? 1;
  let q = db.from("travelshop_tours").select(CARD_COLS, { count: "exact" }).eq("is_active", true);
  if (input.query) {
    const s = input.query.replace(/[%,()]/g, " ").trim();
    if (s) q = q.or(`name.ilike.%${s}%,country.ilike.%${s}%,start_location.ilike.%${s}%,category_name.ilike.%${s}%`);
  }
  if (input.destination) q = q.contains("destinations", [input.destination]);
  if (input.country) q = q.eq("country", input.country);
  if (input.category) q = q.eq("category_slug", input.category);
  if (input.activity) q = q.contains("activities", [input.activity]);
  if (input.language) q = q.contains("languages", [input.language]);
  if (input.duration === "day") q = q.lte("duration_days", 1);
  if (input.duration === "2-4") q = q.gte("duration_days", 2).lte("duration_days", 4);
  if (input.duration === "5-8") q = q.gte("duration_days", 5).lte("duration_days", 8);
  if (input.duration === "9+") q = q.gte("duration_days", 9);
  if (input.minPrice !== undefined) q = q.gte("price_from", input.minPrice);
  if (input.maxPrice !== undefined) q = q.lte("price_from", input.maxPrice);
  if (input.minRating !== undefined) q = q.gte("rating", input.minRating);
  switch (input.sort) {
    case "price-asc": q = q.order("price_from", { ascending: true, nullsFirst: false }); break;
    case "price-desc": q = q.order("price_from", { ascending: false, nullsFirst: false }); break;
    case "duration": q = q.order("duration_days", { ascending: true }); break;
    case "rating": q = q.order("rating", { ascending: false, nullsFirst: false }); break;
    default: q = q.order("review_count", { ascending: false }).order("rating", { ascending: false, nullsFirst: false });
  }
  q = q.order("external_id", { ascending: true }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await q;
  if (error) throw new Error("Catalogue unavailable");
  return { items: ((data ?? []) as TourRow[]).map(withCustomerFromPrice), total: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function facets() {
  const db = await admin();
  const { data } = await db.rpc("travelshop_facets" as never);
  return (data ?? { categories: [], countries: [], destinations: [], activities: [], languages: [] }) as {
    categories: Array<{ value: string; label: string; count: number }>;
    countries: Array<{ value: string; count: number }>;
    destinations: Array<{ value: string; count: number }>;
    activities: Array<{ value: string; count: number }>;
    languages: Array<{ value: string; count: number }>;
  };
}

export async function getTour(slug: string) {
  const db = await admin();
  const { data } = await db
    .from("travelshop_tours")
    .select(
      `${CARD_COLS}, description_html, activities, start_location, end_location, group_min, group_max, max_pax, suitable_ages, images, itinerary, highlights, inclusions, exclusions, details`,
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return withCustomerFromPrice(data as TourRow);
}

// ---------------------------------------------------------------- pricing

/**
 * Worldway customer pricing for tours. Basis is the supplier's live B2C retail
 * price. An approved Worldway markup applies only when TRAVELSHOP_MARKUP_PERCENT
 * is set; until then the customer pays the live retail price and Worldway's
 * margin is the supplier commission (retail − net), visible to staff only.
 */
export function tourPricingRule() {
  const raw = (process.env["TRAVELSHOP_MARKUP_PERCENT"] ?? "").trim();
  const n = Number(raw);
  const markupPercent = raw !== "" && Number.isFinite(n) && n >= 0 && n <= 50 ? n : null;
  return { markupPercent, basis: "retail-price" as const, source: markupPercent === null ? "supplier-retail (no Worldway markup approved)" : "TRAVELSHOP_MARKUP_PERCENT" };
}
export function customerPrice(retail: number): number {
  const { markupPercent } = tourPricingRule();
  return Math.round(retail * (1 + (markupPercent ?? 0) / 100) * 100) / 100;
}
function withCustomerFromPrice<T extends { price_from: number | null }>(row: T) {
  return { ...row, price_from: row.price_from !== null ? customerPrice(row.price_from) : null };
}

// ------------------------------------------------------ live availability

type PriceBlock = { unit: number; adl: number; chd: number; inf: number };
interface AvailabilityResponse {
  id: number;
  slug: string;
  currency: string;
  is_regular: boolean;
  is_private: boolean;
  maxPax: number;
  prices?: Array<{ dates?: Array<{ start: string; end: string; seats: number; prices: { regular: PriceBlock; private: PriceBlock; currency: string } }> }>;
}

export type ServiceType = "private" | "regular";
export interface LiveDate {
  date: string;
  endDate: string;
  service: ServiceType;
  currency: string;
  perAdult: number;
  perChild: number;
  perInfant: number;
  perUnit: number;
  seats: number | null;
}

export async function liveAvailability(slug: string, fromDate: string, pax: number): Promise<{ checkedAt: string; maxPax: number; dates: LiveDate[] }> {
  const res = await travelshopRequest<AvailabilityResponse>(TRAVELSHOP_PATHS.availability(slug), {
    query: { date: fromDate, pax: Math.max(1, pax) },
    maxRetries: 3,
    timeoutMs: 25_000,
  });
  const out: LiveDate[] = [];
  for (const block of res.prices ?? []) {
    for (const d of block.dates ?? []) {
      if (d.start < fromDate) continue;
      for (const service of ["private", "regular"] as const) {
        const p = d.prices?.[service];
        if (!p) continue;
        if (!(p.adl > 0 || p.unit > 0)) continue;
        const seats = typeof d.seats === "number" && d.seats > 0 ? d.seats : null;
        out.push({
          date: d.start, endDate: d.end, service, currency: d.prices.currency ?? res.currency,
          perAdult: customerPrice(p.adl), perChild: customerPrice(p.chd), perInfant: customerPrice(p.inf), perUnit: customerPrice(p.unit), seats,
        });
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { checkedAt: new Date().toISOString(), maxPax: res.maxPax, dates: out };
}

/** Raw supplier (retail) price for one date/service — server-side quote basis. */
export async function liveQuote(input: { slug: string; date: string; service: ServiceType; adults: number; children: number; infants: number }) {
  const pax = input.adults + input.children;
  const res = await travelshopRequest<AvailabilityResponse>(TRAVELSHOP_PATHS.availability(input.slug), {
    query: { date: input.date, pax }, maxRetries: 3, timeoutMs: 25_000,
  });
  if (pax > (res.maxPax || 999)) return { ok: false as const, reason: `This tour allows up to ${res.maxPax} travellers.` };
  const day = (res.prices ?? []).flatMap((b) => b.dates ?? []).find((d) => d.start === input.date);
  const p = day?.prices?.[input.service];
  if (!day || !p || !(p.adl > 0 || p.unit > 0)) return { ok: false as const, reason: "This date is no longer available for the selected option." };
  if (typeof day.seats === "number" && day.seats > 0 && pax > day.seats) return { ok: false as const, reason: `Only ${day.seats} places are left on this date.` };
  if (input.children > 0 && !(p.chd > 0) && !(p.adl > 0)) return { ok: false as const, reason: "Children can't be priced online for this date." };
  const retail =
    p.unit > 0 && !(p.adl > 0)
      ? p.unit
      : p.adl * input.adults + (p.chd > 0 ? p.chd : p.adl) * input.children + p.inf * input.infants;
  const currency = day.prices.currency ?? res.currency;
  return {
    ok: true as const,
    currency,
    retailTotal: Math.round(retail * 100) / 100,
    customerTotal: customerPrice(retail),
    rule: tourPricingRule(),
    checkedAt: new Date().toISOString(),
    tourId: res.id,
  };
}
