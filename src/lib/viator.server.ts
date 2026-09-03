// Server-only Viator Partner API v2 client.
// Auth: `exp-api-key` header. Sandbox and production share the same contract,
// only the base URL differs (VIATOR_API_ENV=sandbox|production).

export type ViatorProduct = {
  productCode: string;
  title: string;
  description: string;
  image: string | null;
  rating: number | null;
  reviewCount: number;
  price: number | null;
  currency: string;
  durationMinutes: number | null;
  durationLabel: string | null;
  confirmationType: string | null;
  flags: string[];
  destinationIds: number[];
  productUrl: string | null;
  tags: number[];
  /** Human destination trail, e.g. ["Paris", "Ile-de-France", "France"] */
  destinationNames: string[];
};

export type ViatorSearchResult = {
  ok: boolean;
  status: number;
  error?: string;
  configured: boolean;
  environment: "sandbox" | "production";
  destination?: { id: number; name: string } | null;
  totalCount: number;
  page: number;
  pageSize: number;
  currency: string;
  products: ViatorProduct[];
  /** "search" = destination/keyword scoped, "catalogue" = full worldwide catalogue walk */
  mode?: "search" | "catalogue";
  hasMore?: boolean;
};

const PROD_BASE = "https://api.viator.com/partner";
const SANDBOX_BASE = "https://api.sandbox.viator.com/partner";

export function viatorEnvironment(): "sandbox" | "production" {
  return process.env.VIATOR_API_ENV === "production" ? "production" : "sandbox";
}

export function viatorConfigured(): boolean {
  return Boolean(process.env.VIATOR_API_KEY);
}

function headers(): Record<string, string> | null {
  const key = process.env.VIATOR_API_KEY;
  if (!key) return null;
  return {
    "exp-api-key": key,
    Accept: "application/json;version=2.0",
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
  };
}

export async function viatorFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<{ ok: boolean; status: number; error?: string; data?: T }> {
  const h = headers();
  if (!h) return { ok: false, status: 503, error: "Viator API key not configured." };
  const base = viatorEnvironment() === "production" ? PROD_BASE : SANDBOX_BASE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method,
      headers: h,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const msg =
        (json as { message?: string; errorMessage?: string } | null)?.message ??
        (json as { errorMessage?: string } | null)?.errorMessage ??
        `Viator responded ${res.status}`;
      return { ok: false, status: res.status, error: msg };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Viator request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- destination taxonomy (cached in module memory) ----------

type RawDestination = {
  destinationId: number;
  name: string;
  type?: string;
  parentDestinationId?: number;
  lookupId?: string;
};

let destinationCache: { at: number; rows: RawDestination[] } | null = null;
const DEST_TTL_MS = 12 * 60 * 60 * 1000;

export async function viatorDestinations(): Promise<RawDestination[]> {
  if (destinationCache && Date.now() - destinationCache.at < DEST_TTL_MS) {
    return destinationCache.rows;
  }
  const res = await viatorFetch<{ destinations?: RawDestination[] }>("/destinations", {
    method: "GET",
  });
  const rows = res.data?.destinations ?? [];
  if (rows.length) destinationCache = { at: Date.now(), rows };
  return rows;
}

export async function resolveDestination(query: string): Promise<RawDestination | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const rows = await viatorDestinations();
  if (!rows.length) return null;
  const exact = rows.find((r) => r.name.toLowerCase() === q);
  if (exact) return exact;
  const starts = rows.filter((r) => r.name.toLowerCase().startsWith(q));
  if (starts.length) {
    return (
      starts.find((r) => r.type === "CITY") ??
      starts.find((r) => r.type === "REGION") ??
      starts[0]
    );
  }
  const contains = rows.filter((r) => r.name.toLowerCase().includes(q));
  return contains.find((r) => r.type === "CITY") ?? contains[0] ?? null;
}

export async function suggestDestinations(query: string, limit = 8) {
  const q = query.trim().toLowerCase();
  const rows = await viatorDestinations();
  const hits = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows.slice(0, limit);
  return hits
    .sort((a, b) => (a.type === "CITY" ? -1 : 1) - (b.type === "CITY" ? -1 : 1))
    .slice(0, limit)
    .map((r) => ({ id: r.destinationId, name: r.name, type: r.type ?? "" }));
}

// ---------- normalisation ----------

type RawProduct = {
  productCode?: string;
  title?: string;
  description?: string;
  status?: string;
  images?: {
    variants?: { url?: string; width?: number; height?: number }[];
    isCover?: boolean;
  }[];
  reviews?: { combinedAverageRating?: number; totalReviews?: number };
  duration?: {
    fixedDurationInMinutes?: number;
    variableDurationFromMinutes?: number;
    variableDurationToMinutes?: number;
  };
  pricing?: { summary?: { fromPrice?: number; fromPriceBeforeDiscount?: number }; currency?: string };
  productUrl?: string;
  flags?: string[];
  confirmationType?: string;
  destinations?: { ref?: string; primary?: boolean }[];
  tags?: number[];
};

function pickImage(p: RawProduct): string | null {
  const imgs = p.images ?? [];
  const cover = imgs.find((i) => i.isCover) ?? imgs[0];
  const variants = (cover?.variants ?? []).filter((v) => v.url);
  if (!variants.length) return null;
  const wide = variants
    .slice()
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
    .find((v) => (v.width ?? 0) <= 900);
  return (wide ?? variants[0]).url ?? null;
}

function durationLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) {
    const d = Math.round(h / 24);
    return `${d} day${d > 1 ? "s" : ""}`;
  }
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function normaliseProduct(p: RawProduct, fallbackCurrency: string): ViatorProduct {
  const minutes =
    p.duration?.fixedDurationInMinutes ?? p.duration?.variableDurationToMinutes ?? null;
  return {
    productCode: p.productCode ?? "",
    title: p.title ?? "Untitled experience",
    description: p.description ?? "",
    image: pickImage(p),
    rating: p.reviews?.combinedAverageRating ?? null,
    reviewCount: p.reviews?.totalReviews ?? 0,
    price: p.pricing?.summary?.fromPrice ?? null,
    currency: p.pricing?.currency ?? fallbackCurrency,
    durationMinutes: minutes,
    durationLabel: durationLabel(minutes),
    confirmationType: p.confirmationType ?? null,
    flags: p.flags ?? [],
    destinationIds: (p.destinations ?? [])
      .map((d) => Number(d.ref))
      .filter((n) => Number.isFinite(n)),
    productUrl: p.productUrl ?? null,
    tags: p.tags ?? [],
    destinationNames: [],
  };
}

/** Resolve destinationIds → names using the cached taxonomy (best effort). */
export async function enrichDestinations(products: ViatorProduct[]): Promise<ViatorProduct[]> {
  if (!products.length) return products;
  let rows: RawDestination[] = [];
  try {
    rows = await viatorDestinations();
  } catch {
    return products;
  }
  if (!rows.length) return products;
  const byId = new Map(rows.map((r) => [r.destinationId, r]));
  return products.map((p) => ({
    ...p,
    destinationNames: p.destinationIds
      .map((id) => byId.get(id)?.name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 3),
  }));
}

// ---------- search ----------

// ---------- full worldwide catalogue (all ~400k+ active products) ----------
// Viator exposes the complete catalogue only through the ingestion endpoint
// `/products/modified-since`, which is cursor-paged. We cache the cursor chain
// in module memory so page N is reachable without re-walking from the start.

const CATALOGUE_PAGE_SIZE = 24;
// cursorChain[i] = cursor that returns catalogue page i+1 ("" = first page)
let cursorChain: string[] = [""];
let cursorChainAt = 0;
const CURSOR_TTL_MS = 6 * 60 * 60 * 1000;
// Hard cap on cursor walks per request so a deep page never hangs the worker.
const MAX_WALK_STEPS = 8;

type ModifiedSinceResponse = { products?: RawProduct[]; nextCursor?: string };

async function fetchCataloguePage(cursor: string, count: number) {
  const qs = new URLSearchParams({ count: String(count) });
  if (cursor) qs.set("cursor", cursor);
  return viatorFetch<ModifiedSinceResponse>(`/products/modified-since?${qs.toString()}`, {
    method: "GET",
  });
}

export async function browseFullCatalogue(
  page: number,
  pageSize: number,
  currency: string,
): Promise<ViatorSearchResult> {
  const base: ViatorSearchResult = {
    ok: false,
    status: 502,
    configured: viatorConfigured(),
    environment: viatorEnvironment(),
    totalCount: 0,
    page,
    pageSize,
    currency,
    products: [],
    destination: null,
    mode: "catalogue",
  };

  if (Date.now() - cursorChainAt > CURSOR_TTL_MS) {
    cursorChain = [""];
    cursorChainAt = Date.now();
  }

  // Walk forward until we have a cursor for the requested page.
  let steps = 0;
  while (cursorChain.length < page && steps < MAX_WALK_STEPS) {
    const from = cursorChain[cursorChain.length - 1];
    const res = await fetchCataloguePage(from, pageSize);
    if (!res.ok) return { ...base, status: res.status, error: res.error };
    const next = res.data?.nextCursor;
    if (!next) break;
    cursorChain.push(next);
    steps += 1;
  }

  const cursor = cursorChain[Math.min(page, cursorChain.length) - 1] ?? "";
  const res = await fetchCataloguePage(cursor, pageSize);
  if (!res.ok) return { ...base, status: res.status, error: res.error };

  const rows = (res.data?.products ?? []).filter(
    (p) => !p.status || p.status.toUpperCase() === "ACTIVE",
  );
  const nextCursor = res.data?.nextCursor;
  if (nextCursor && cursorChain.length === page) cursorChain.push(nextCursor);
  const hasMore = Boolean(nextCursor) && rows.length > 0;

  return {
    ...base,
    ok: true,
    status: 200,
    hasMore,
    // The ingestion feed reports no grand total; expose a forward-only count so
    // pagination stays honest instead of inventing a page count.
    totalCount: (page - 1) * pageSize + rows.length + (hasMore ? pageSize : 0),
    products: await enrichDestinations(rows.map((p) => normaliseProduct(p, currency))),
  };
}

export type ViatorSearchInput = {
  destination?: string;
  destinationId?: number;
  q?: string;
  startDate?: string;
  endDate?: string;
  priceMin?: number;
  priceMax?: number;
  tags?: number[];
  flags?: string[];
  durationMin?: number;
  durationMax?: number;
  ratingMin?: number;
  confirmationType?: "INSTANT" | "MANUAL";
  sort?: "DEFAULT" | "PRICE" | "TRAVELER_RATING" | "ITINERARY_DURATION" | "REVIEW_AVG_RATING";
  order?: "ASCENDING" | "DESCENDING";
  page?: number;
  pageSize?: number;
  currency?: string;
};

export async function searchViator(input: ViatorSearchInput): Promise<ViatorSearchResult> {
  const environment = viatorEnvironment();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 24));
  const currency = input.currency ?? "USD";
  const base: ViatorSearchResult = {
    ok: false,
    status: 503,
    configured: viatorConfigured(),
    environment,
    totalCount: 0,
    page,
    pageSize,
    currency,
    products: [],
    destination: null,
  };
  if (!viatorConfigured()) {
    return { ...base, error: "Viator API key not configured." };
  }

  let dest: RawDestination | null = null;
  if (input.destinationId) {
    dest = { destinationId: input.destinationId, name: input.destination ?? "" };
  } else if (input.destination) {
    dest = await resolveDestination(input.destination);
  }

  // No destination and no keyword → browse the complete worldwide catalogue.
  if (!dest && !(input.q || input.destination || "").trim()) {
    return browseFullCatalogue(page, pageSize || CATALOGUE_PAGE_SIZE, currency);
  }

  const start = (page - 1) * pageSize + 1;

  // Destination-scoped browsing uses /products/search (full catalogue + filters).
  if (dest) {
    const body: Record<string, unknown> = {
      filtering: {
        destination: String(dest.destinationId),
        ...(input.startDate ? { startDate: input.startDate } : {}),
        ...(input.endDate ? { endDate: input.endDate } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
        ...(input.flags?.length ? { flags: input.flags } : {}),
        ...(input.priceMin != null ? { lowestPrice: input.priceMin } : {}),
        ...(input.priceMax != null ? { highestPrice: input.priceMax } : {}),
        ...(input.durationMin != null || input.durationMax != null
          ? {
              durationInMinutes: {
                ...(input.durationMin != null ? { from: input.durationMin } : {}),
                ...(input.durationMax != null ? { to: input.durationMax } : {}),
              },
            }
          : {}),
        ...(input.ratingMin != null ? { rating: { from: input.ratingMin, to: 5 } } : {}),
        ...(input.confirmationType ? { confirmationType: input.confirmationType } : {}),
      },
      sorting:
        input.sort && input.sort !== "DEFAULT"
          ? { sort: input.sort, order: input.order ?? "DESCENDING" }
          : { sort: "DEFAULT" },
      pagination: { start, count: pageSize },
      currency,
    };
    const res = await viatorFetch<{ products?: RawProduct[]; totalCount?: number }>(
      "/products/search",
      { method: "POST", body },
    );
    if (!res.ok) return { ...base, status: res.status, error: res.error };
    return {
      ...base,
      ok: true,
      status: 200,
      mode: "search",
      destination: { id: dest.destinationId, name: dest.name || (input.destination ?? "") },
      totalCount: res.data?.totalCount ?? res.data?.products?.length ?? 0,
      products: await enrichDestinations(
        (res.data?.products ?? []).map((p) => normaliseProduct(p, currency)),
      ),
    };
  }

  // Free-text fallback when the destination cannot be resolved.
  const term = (input.q || input.destination || "").trim();
  if (!term) return { ...base, status: 400, error: "Enter a destination or keyword." };
  const res = await viatorFetch<{
    products?: { totalCount?: number; results?: RawProduct[] };
  }>("/search/freetext", {
    method: "POST",
    body: {
      searchTerm: term,
      currency,
      productFiltering: {
        ...(input.startDate || input.endDate
          ? { dateRange: { from: input.startDate, to: input.endDate } }
          : {}),
        ...(input.priceMin != null ? { lowestPrice: input.priceMin } : {}),
        ...(input.priceMax != null ? { highestPrice: input.priceMax } : {}),
        ...(input.flags?.length ? { flags: input.flags } : {}),
      },
      ...(input.sort && input.sort !== "DEFAULT"
        ? { productSorting: { sort: input.sort, order: input.order ?? "DESCENDING" } }
        : {}),
      searchTypes: [{ searchType: "PRODUCTS", pagination: { start, count: pageSize } }],
    },
  });
  if (!res.ok) return { ...base, status: res.status, error: res.error };
  return {
    ...base,
    ok: true,
    status: 200,
    mode: "search",
    totalCount: res.data?.products?.totalCount ?? 0,
    products: await enrichDestinations(
      (res.data?.products?.results ?? []).map((p) => normaliseProduct(p, currency)),
    ),
  };
}

export async function viatorProductDetail(code: string, currency = "USD") {
  const res = await viatorFetch<RawProduct>(`/products/${encodeURIComponent(code)}`, {
    method: "GET",
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error, product: null };
  return { ok: true, status: 200, product: normaliseProduct(res.data ?? {}, currency) };
}

// ---------- tag taxonomy (categories) ----------

type RawTag = {
  tagId: number;
  parentTagIds?: number[];
  allNamesByLocale?: Record<string, string>;
  allNames?: Record<string, string>;
};
let tagCache: { at: number; rows: { id: number; name: string; parents: number[] }[] } | null = null;

export async function viatorTags() {
  if (tagCache && Date.now() - tagCache.at < DEST_TTL_MS) return tagCache.rows;
  const res = await viatorFetch<{ tags?: RawTag[] }>("/products/tags", { method: "GET" });
  const rows = (res.data?.tags ?? []).map((t) => ({
    id: t.tagId,
    name:
      t.allNamesByLocale?.["en"] ??
      t.allNamesByLocale?.["en_US"] ??
      t.allNames?.["en"] ??
      String(t.tagId),
    parents: t.parentTagIds ?? [],
  }));
  if (rows.length) tagCache = { at: Date.now(), rows };
  return rows;
}

// ---------- rich product detail ----------

export type ViatorProductDetail = ViatorProduct & {
  images: string[];
  itinerary: {
    type: string | null;
    days: { title: string; description: string; stops: string[] }[];
    stops: { title: string; description: string; duration: string | null }[];
  };
  inclusions: string[];
  exclusions: string[];
  additionalInfo: string[];
  cancellationPolicy: { type: string | null; description: string | null };
  languages: string[];
  meetingPoint: string | null;
  pickup: string | null;
  coordinates: { lat: number; lng: number } | null;
  bookingQuestionsCount: number;
  ticketInfo: string | null;
};

type RawDetail = RawProduct & {
  itinerary?: {
    itineraryType?: string;
    days?: { title?: string; dayNumber?: number; items?: { description?: string; pointOfInterestLocation?: unknown }[]; description?: string }[];
    itineraryItems?: {
      description?: string;
      duration?: { fixedDurationInMinutes?: number };
      pointOfInterestLocation?: { location?: { ref?: string } };
      passByWithoutStopping?: boolean;
    }[];
  };
  inclusions?: { otherDescription?: string; description?: string; typeDescription?: string }[];
  exclusions?: { otherDescription?: string; description?: string; typeDescription?: string }[];
  additionalInfo?: { description?: string }[];
  cancellationPolicy?: { type?: string; description?: string };
  languageGuides?: { language?: string; type?: string }[];
  logistics?: {
    start?: { description?: string; location?: { ref?: string } }[];
    end?: { description?: string }[];
    travelerPickup?: { pickupOptionType?: string; additionalInfo?: string; allowCustomTravelerPickup?: boolean };
  };
  bookingQuestions?: string[];
  ticketInfo?: { ticketTypeDescription?: string; ticketTypes?: string[] };
};

function textList(rows?: { otherDescription?: string; description?: string; typeDescription?: string }[]) {
  return (rows ?? [])
    .map((r) => r.otherDescription || r.description || r.typeDescription || "")
    .map((s) => s.trim())
    .filter(Boolean);
}

function galleryImages(p: RawProduct): string[] {
  const out: string[] = [];
  for (const img of p.images ?? []) {
    const variants = (img.variants ?? []).filter((v) => v.url);
    if (!variants.length) continue;
    const best =
      variants
        .slice()
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
        .find((v) => (v.width ?? 0) <= 1200) ?? variants[0];
    if (best.url) out.push(best.url);
  }
  return Array.from(new Set(out)).slice(0, 12);
}

export async function viatorProductFull(code: string, currency = "USD") {
  const res = await viatorFetch<RawDetail>(`/products/${encodeURIComponent(code)}`, {
    method: "GET",
  });
  if (!res.ok || !res.data) {
    return { ok: false as const, status: res.status, error: res.error, product: null };
  }
  const raw = res.data;
  const baseProduct = normaliseProduct(raw, currency);
  const startLogistics = raw.logistics?.start ?? [];
  const detail: ViatorProductDetail = {
    ...baseProduct,
    images: galleryImages(raw),
    itinerary: {
      type: raw.itinerary?.itineraryType ?? null,
      days: (raw.itinerary?.days ?? []).map((d, i) => ({
        title: d.title?.trim() || `Day ${d.dayNumber ?? i + 1}`,
        description: (d.description ?? "").trim(),
        stops: (d.items ?? []).map((it) => (it.description ?? "").trim()).filter(Boolean),
      })),
      stops: (raw.itinerary?.itineraryItems ?? []).map((it) => ({
        title: (it.description ?? "").split(".")[0]?.slice(0, 90) ?? "",
        description: (it.description ?? "").trim(),
        duration: it.duration?.fixedDurationInMinutes
          ? durationLabel(it.duration.fixedDurationInMinutes)
          : null,
      })),
    },
    inclusions: textList(raw.inclusions),
    exclusions: textList(raw.exclusions),
    additionalInfo: (raw.additionalInfo ?? [])
      .map((a) => (a.description ?? "").trim())
      .filter(Boolean),
    cancellationPolicy: {
      type: raw.cancellationPolicy?.type ?? null,
      description: raw.cancellationPolicy?.description ?? null,
    },
    languages: Array.from(
      new Set((raw.languageGuides ?? []).map((l) => l.language ?? "").filter(Boolean)),
    ),
    meetingPoint: startLogistics[0]?.description?.trim() || null,
    pickup: raw.logistics?.travelerPickup?.pickupOptionType
      ? `${raw.logistics.travelerPickup.pickupOptionType.replace(/_/g, " ").toLowerCase()}${
          raw.logistics.travelerPickup.additionalInfo
            ? ` — ${raw.logistics.travelerPickup.additionalInfo}`
            : ""
        }`
      : null,
    coordinates: null,
    bookingQuestionsCount: (raw.bookingQuestions ?? []).length,
    ticketInfo: raw.ticketInfo?.ticketTypeDescription ?? null,
  };
  return { ok: true as const, status: 200, product: detail };
}

// ---------- reviews ----------

export async function viatorReviews(code: string, limit = 6) {
  const res = await viatorFetch<{
    reviews?: {
      rating?: number;
      title?: string;
      text?: string;
      publishedDate?: string;
      reviewerName?: string;
    }[];
    totalReviewsSummary?: { totalReviews?: number; combinedAverageRating?: number };
  }>("/reviews/product", {
    method: "POST",
    body: {
      productCode: code,
      provider: "ALL",
      count: limit,
      start: 1,
      showMachineTranslated: true,
      reviewsForNonPrimaryLocale: true,
    },
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error, reviews: [], total: 0 };
  return {
    ok: true,
    status: 200,
    total: res.data?.totalReviewsSummary?.totalReviews ?? 0,
    reviews: (res.data?.reviews ?? []).map((r) => ({
      rating: r.rating ?? null,
      title: r.title ?? "",
      text: r.text ?? "",
      date: r.publishedDate ?? null,
      author: r.reviewerName ?? "Traveller",
    })),
  };
}

// ---------- live availability + pricing ----------

export async function viatorSchedule(code: string, currency = "USD") {
  const res = await viatorFetch<{
    currency?: string;
    summary?: { fromPrice?: number };
    bookableItems?: {
      productOptionCode?: string;
      seasons?: {
        startDate?: string;
        endDate?: string;
        pricingRecords?: {
          daysOfWeek?: string[];
          timedEntries?: { startTime?: string }[];
          pricingDetails?: { price?: { original?: { recommendedRetailPrice?: number } } }[];
        }[];
      }[];
    }[];
  }>(`/availability/schedules/${encodeURIComponent(code)}`, { method: "GET" });
  if (!res.ok) {
    return { ok: false, status: res.status, error: res.error, dates: [], fromPrice: null, currency };
  }
  const dates: string[] = [];
  const today = new Date();
  const seasons = (res.data?.bookableItems ?? []).flatMap((b) => b.seasons ?? []);
  for (const s of seasons) {
    const start = s.startDate ? new Date(s.startDate) : today;
    const from = start > today ? start : today;
    const days = new Set(
      (s.pricingRecords ?? []).flatMap((r) => r.daysOfWeek ?? []).map((d) => d.toUpperCase()),
    );
    const names = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    for (let i = 0; i < 60 && dates.length < 12; i += 1) {
      const d = new Date(from.getTime() + i * 86400000);
      if (s.endDate && d > new Date(s.endDate)) break;
      if (!days.size || days.has(names[d.getUTCDay()])) dates.push(d.toISOString().slice(0, 10));
    }
  }
  return {
    ok: true,
    status: 200,
    currency: res.data?.currency ?? currency,
    fromPrice: res.data?.summary?.fromPrice ?? null,
    dates: Array.from(new Set(dates)).sort().slice(0, 12),
  };
}

// ---------- booking entitlement ----------
// Viator gates the /bookings/* endpoints behind a separate "booking access"
// entitlement on the API key. Keys without it receive
// `403 FORBIDDEN "Endpoint access denied"` even though content, schedules and
// /availability/check succeed. We detect this with the documented, read-only
// /bookings/status endpoint (never creates holds or bookings) and cache it.

export type ViatorBookingAccess = {
  /** true = /bookings/* reachable, false = key not entitled, null = undetermined */
  granted: boolean | null;
  status: number;
  detail: string;
  checkedAt: string;
};

let bookingAccessCache: ViatorBookingAccess | null = null;
const BOOKING_ACCESS_TTL_MS = 10 * 60 * 1000;

export function isViatorEndpointDenied(status: number, error?: string): boolean {
  return status === 403 && /endpoint access denied|forbidden/i.test(error ?? "");
}

export const VIATOR_BOOKING_ACCESS_MESSAGE =
  "Instant payment for this experience is not switched on yet: the supplier has not enabled booking access on our production API key. Request a held reservation and our travel director will confirm it.";

export async function viatorBookingAccess(force = false): Promise<ViatorBookingAccess> {
  if (
    !force &&
    bookingAccessCache &&
    Date.now() - new Date(bookingAccessCache.checkedAt).getTime() < BOOKING_ACCESS_TTL_MS
  ) {
    return bookingAccessCache;
  }
  if (!viatorConfigured()) {
    return { granted: null, status: 503, detail: "VIATOR_API_KEY not configured.", checkedAt: new Date().toISOString() };
  }
  // Read-only probe with a reference that cannot exist; an entitled key answers
  // with 200/400/404 for the unknown ref, an unentitled key answers 403.
  const res = await viatorFetch<unknown>("/bookings/status", {
    method: "POST",
    body: { bookingRefs: ["BR-000000000"] },
  });
  let result: ViatorBookingAccess;
  if (res.ok) {
    result = { granted: true, status: res.status, detail: "Booking endpoints reachable.", checkedAt: new Date().toISOString() };
  } else if (isViatorEndpointDenied(res.status, res.error)) {
    result = {
      granted: false,
      status: res.status,
      detail:
        "Supplier returned 403 “Endpoint access denied” for /bookings/*. The production API key has content + availability access only; ask Viator to enable booking access (Merchant / Full + Booking) on this key.",
      checkedAt: new Date().toISOString(),
    };
  } else if (res.status === 400 || res.status === 404) {
    result = { granted: true, status: res.status, detail: "Booking endpoints reachable.", checkedAt: new Date().toISOString() };
  } else {
    result = { granted: null, status: res.status, detail: res.error ?? "Booking entitlement could not be determined.", checkedAt: new Date().toISOString() };
  }
  if (result.granted !== null) bookingAccessCache = result;
  return result;
}

export async function viatorStatus() {
  const configured = viatorConfigured();
  const environment = viatorEnvironment();
  if (!configured) {
    return {
      configured: false,
      environment,
      reachable: false,
      bookingAccess: null as ViatorBookingAccess | null,
      message: "Awaiting Viator API key (VIATOR_API_KEY).",
    };
  }
  const [res, bookingAccess] = await Promise.all([
    viatorFetch<unknown>("/products/tags", { method: "GET" }),
    viatorBookingAccess(),
  ]);
  return {
    configured: true,
    environment,
    reachable: res.ok,
    bookingAccess,
    message: res.ok
      ? bookingAccess.granted === false
        ? "Viator content + availability live; booking access not yet granted by supplier."
        : "Viator connector live."
      : (res.error ?? "Viator unreachable."),
  };
}
