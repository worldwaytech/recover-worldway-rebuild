// Pure TravelShop → Worldway tour mapping. No network, no secrets.
// The UI only ever reads the normalised row, never raw supplier fields.

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const posNum = (v: unknown) => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
const label = (v: unknown): string | null => {
  if (typeof v === "string") return str(v);
  if (v && typeof v === "object") {
    const o = v as Json;
    return str(o["en"]) ?? str(o["name"]) ?? (o["name"] && typeof o["name"] === "object" ? str((o["name"] as Json)["en"]) : null);
  }
  return null;
};

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface NormalizedTour {
  external_id: number;
  slug: string;
  tour_code: string | null;
  name: string;
  summary: string | null;
  description_html: string | null;
  category_slug: string | null;
  category_name: string | null;
  activities: string[];
  destinations: string[];
  destination_slugs: string[];
  country: string | null;
  region: string | null;
  start_location: string | null;
  end_location: string | null;
  duration_days: number | null;
  duration_hours: number | null;
  languages: string[];
  rating: number | null;
  review_count: number;
  currency: string | null;
  price_from: number | null;
  net_price_from: number | null;
  is_private: boolean;
  is_regular: boolean;
  free_cancellation: boolean;
  instant_confirmation: boolean;
  group_min: number | null;
  group_max: number | null;
  max_pax: number | null;
  suitable_ages: string | null;
  cover_image: string | null;
  images: Array<{ url: string; alt: string | null }>;
  itinerary: Array<{ day: number | null; title: string | null; description: string }>;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  details: Json;
  source_ref: Json;
  source_status: string | null;
  source_updated_at: string | null;
  source_deleted_at: string | null;
  is_active: boolean;
  content_hash: string;
}

export type NormalizeResult = { ok: true; tour: NormalizedTour } | { ok: false; reason: string; externalId: number | null; slug: string | null };

export function normalizeTour(t: Json): NormalizeResult {
  const id = num(t["id"]);
  const slug = str(t["slug"]);
  const name = str(t["name_en"]) ?? str(t["name"]);
  if (id === null || !slug || !name) return { ok: false, reason: "missing id, slug or name", externalId: id, slug };

  const routes = arr(t["routes"]);
  const breadcrumbs = Array.isArray(t["location_breadcrumbs"]) ? (t["location_breadcrumbs"] as unknown[]).map(label).filter(Boolean) as string[] : [];
  const media = arr(t["images"]).length ? arr(t["images"]) : arr(t["media"]);
  const images = media
    .map((m) => ({ url: str(m["main"]) ?? str(m["original_url"]) ?? str(m["resize_url"]) ?? "", alt: str(m["name"]) }))
    .filter((m) => /^https:\/\//.test(m.url));
  const cover = str(t["image_resize_link"]) ?? str(t["image"]) ?? images[0]?.url ?? null;
  const category = (t["category"] && typeof t["category"] === "object" ? t["category"] : {}) as Json;
  const reg = t["is_regular"] === true;
  const prv = t["is_private"] === true;
  const priceFrom = posNum(t["price"]) ?? posNum(reg ? t["min_reg_price"] : t["min_prv_price"]);
  const netFrom = posNum(reg ? t["min_reg_net_price"] : t["min_prv_net_price"]) ?? posNum(t["adl_min_prv_net_price"]) ?? posNum(t["adl_min_reg_net_price"]);
  const languages = arr(t["languages"]).map(label).filter(Boolean) as string[];
  const inclusions = arr(t["included"]).length ? arr(t["included"]) : arr(t["inclusions"]);

  const tour: NormalizedTour = {
    external_id: id,
    slug,
    tour_code: str(t["tour_code"]),
    name,
    summary: stripHtml(str(t["description"])).slice(0, 600) || null,
    description_html: str(t["full_description"]) ?? str(t["description"]),
    category_slug: str(category["slug"]),
    category_name: label(category["name"]) ?? str(category["name"]),
    activities: [...new Set(arr(t["activities"]).map((a) => label(a["name"]) ?? str(a["name"])).filter(Boolean) as string[])],
    destinations: [...new Set(routes.map((r) => str(r["name"])).filter(Boolean) as string[])],
    destination_slugs: [...new Set(routes.map((r) => str(r["slug"])).filter(Boolean) as string[])],
    country: breadcrumbs[breadcrumbs.length - 1] ?? null,
    region: breadcrumbs[0] ?? null,
    start_location: str(t["startLocation"]),
    end_location: str(t["endLocation"]),
    duration_days: num(t["duration_days"]),
    duration_hours: num(t["duration_hours"]),
    languages,
    rating: posNum(t["rating"]),
    review_count: num(t["reviews_count"]) ?? num(t["review_count"]) ?? 0,
    currency: str(t["currency"]) ?? str(t["active_curr"]),
    price_from: priceFrom,
    net_price_from: netFrom,
    is_private: prv,
    is_regular: reg,
    free_cancellation: t["free_cancelation"] === true,
    instant_confirmation: t["instant_confirmation"] === true,
    group_min: num(t["groupSizeMin"]),
    group_max: num(t["groupSizeMax"]),
    max_pax: num(t["max_pax"]),
    suitable_ages: str(t["suitableAges"]),
    cover_image: cover && /^https:\/\//.test(cover) ? cover : null,
    images: images.slice(0, 30),
    itinerary: arr(t["itineraries"]).map((i) => ({ day: num(i["day"]), title: str(i["title"]), description: stripHtml(str(i["description"])) })),
    highlights: arr(t["highlights"]).map((h) => str(h["title"])).filter(Boolean) as string[],
    inclusions: inclusions.map((i) => str(i["name"])).filter(Boolean) as string[],
    exclusions: arr(t["excluded"]).map((i) => str(i["name"])).filter(Boolean) as string[],
    details: {
      guide: label(t["guide_type"]),
      physicalRating: label(t["physical_rating"]),
      budgetClass: label(t["budget_class"]),
      departureType: str(t["departure_type_id"]),
      groupType: str(t["group_type_id"]),
      pickupTime: str(t["pickupTime"]),
      dropoffTime: str(t["dropoffTime"]),
      mapImage: str(t["map"]),
      mealTypes: arr(t["meal_types"]).map((m) => label(m["name"]) ?? label(m)).filter(Boolean),
      transportTypes: arr(t["transport_types"]).map((m) => label(m["name"]) ?? label(m)).filter(Boolean),
      accommodationTypes: arr(t["accommodation_types"]).map((m) => label(m["name"]) ?? label(m)).filter(Boolean),
      reviews: arr(t["reviews"]).slice(0, 6).map((r) => ({ name: str(r["customer_display_name"]), title: str(r["title"]), content: stripHtml(str(r["content"])).slice(0, 600), rating: num(r["rating"]) })),
      lat: num(t["minLat"]),
      lng: num(t["minLng"]),
    },
    // Internal provenance only — never returned to customers.
    source_ref: {
      supplier: "TravelShop Booking",
      tourId: id,
      slug,
      companyId: num(t["company_id"]),
      companyName: t["company"] && typeof t["company"] === "object" ? str((t["company"] as Json)["name"]) : null,
      categoryId: num(t["category_id"]),
      type: str(t["type"]),
      b2c: t["b2c"] === true,
      legacyBokunId: t["bokun_id"] ?? null,
    },
    source_status: str(t["status"]),
    source_updated_at: str(t["updated_at"]),
    source_deleted_at: str(t["deleted_at"]),
    is_active: str(t["status"]) === "active",
    content_hash: "",
  };
  tour.content_hash = hash(JSON.stringify({ ...tour, content_hash: "" }));
  return { ok: true, tour };
}
