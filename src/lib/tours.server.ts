// Server-only client for the multi-day guided-tour supplier REST API.
// Auth: `X-Application-Key` header. Never expose the key to the browser.
// Secrets: TOURS_API_KEY, TOURS_API_ENV, TOURS_AGENCY_CODE, TOURS_WEBHOOK_KEY.

const BASE = "https://rest.gadventures.com";

export type TourSummary = {
  id: string;
  name: string;
  slug: string;
  productLine: string;
  description: string;
  image: string | null;
  map: string | null;
  region: string | null;
  countries: string[];
  startCity: string | null;
  finishCity: string | null;
  categories: string[];
  fromPrice: number | null;
  currency: string;
  departuresStart: string | null;
  departuresEnd: string | null;
  /** Trip length in days, resolved from the next live departure. */
  durationDays?: number | null;
};

export type TourDay = {
  day: number;
  title: string;
  summary: string;
  location: string | null;
  accommodation: string | null;
  meals: string[];
};

export type TourDeparture = {
  id: string;
  startDate: string;
  finishDate: string;
  days: number | null;
  status: string;
  availableSpaces: number | null;
  price: number | null;
  currency: string;
  rooms: { code: string; name: string; status: string; price: number | null; currency: string }[];
};

export type TourDetail = TourSummary & {
  highlights: string | null;
  included: string | null;
  details: { label: string; body: string }[];
  itinerary: TourDay[];
  durationDays: number | null;
  departures: TourDeparture[];
};

export function toursEnvironment(): "sandbox" | "production" {
  return process.env.TOURS_API_ENV === "production" ? "production" : "sandbox";
}

function toursKey(): string | undefined {
  return process.env.TOURS_API_KEY || process.env.TOURS_PUBLISHABLE_KEY;
}

export function toursConfigured(): boolean {
  return Boolean(toursKey());
}

export function toursBookingConfigured(): boolean {
  return Boolean(process.env.TOURS_API_KEY && process.env.TOURS_AGENCY_CODE);
}

export function toursStatus() {
  return {
    configured: toursConfigured(),
    bookingConfigured: toursBookingConfigured(),
    environment: toursEnvironment(),
    missing: [
      process.env.TOURS_API_KEY ? null : "TOURS_API_KEY",
      process.env.TOURS_AGENCY_CODE ? null : "TOURS_AGENCY_CODE",
      process.env.TOURS_WEBHOOK_KEY ? null : "TOURS_WEBHOOK_KEY",
    ].filter(Boolean) as string[],
  };
}

type Res<T> = { ok: boolean; status: number; error?: string; data?: T };

export async function gFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST" | "PATCH"; body?: unknown },
): Promise<Res<T>> {
  const key = toursKey();
  if (!key) return { ok: false, status: 503, error: "Tour supplier API key not configured." };
  // Retry transient supplier failures (rate limit / gateway) with backoff.
  let last: Res<T> = { ok: false, status: 502, error: "Supplier request failed" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 250 * attempt * attempt));
    last = await gFetchOnce<T>(path, init, key);
    if (last.ok) return last;
    if (last.status !== 429 && last.status < 500) return last;
  }
  return last;
}

async function gFetchOnce<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } | undefined,
  key: string,
): Promise<Res<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-Application-Key": key,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
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
      const j = json as { message?: string; errors?: { message?: string }[] } | null;
      return {
        ok: false,
        status: res.status,
        error: j?.errors?.[0]?.message ?? j?.message ?? `Supplier responded ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Supplier request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- normalisation ----------

type RawPrice = { currency?: string; amount?: string | null; room?: { code?: string } | null };
type RawDossier = {
  id?: string;
  name?: string;
  slug?: string;
  product_line?: string;
  description?: string;
  departures_start_date?: string | null;
  departures_end_date?: string | null;
  images?: { type?: string; image_href?: string }[];
  advertised_departures?: RawPrice[];
  categories?: { name?: string; category_type?: { label?: string } }[];
  geography?: {
    region?: { name?: string } | null;
    visited_countries?: { name?: string }[];
    start_city?: { name?: string } | null;
    finish_city?: { name?: string } | null;
  } | null;
  details?: { body?: string; detail_type?: { label?: string; id?: string } }[];
  structured_itineraries?: {
    id?: string;
    variation_id?: string;
    valid_during_ranges?: { start_date?: string; end_date?: string | null }[];
  }[];
};

function pickImage(images: RawDossier["images"], type: string): string | null {
  return images?.find((i) => i.type === type)?.image_href ?? null;
}

function lowestPrice(prices: RawPrice[] | undefined, currency: string) {
  const rows = (prices ?? []).filter((p) => p.currency === currency && p.amount);
  if (!rows.length) return null;
  return rows.reduce<number | null>((min, p) => {
    const v = Number(p.amount);
    return Number.isFinite(v) && (min === null || v < min) ? v : min;
  }, null);
}

export function normaliseTour(raw: RawDossier, currency: string): TourSummary {
  return {
    id: String(raw.id ?? ""),
    name: raw.name ?? "Guided journey",
    slug: raw.slug ?? String(raw.id ?? ""),
    productLine: raw.product_line ?? "",
    description: (raw.description ?? "").replace(/\s+/g, " ").trim(),
    image: pickImage(raw.images, "BANNER_HIRES") ?? pickImage(raw.images, "BANNER"),
    map: pickImage(raw.images, "MAP"),
    region: raw.geography?.region?.name ?? null,
    countries: (raw.geography?.visited_countries ?? [])
      .map((c) => c.name ?? "")
      .filter(Boolean)
      .slice(0, 8),
    startCity: raw.geography?.start_city?.name ?? null,
    finishCity: raw.geography?.finish_city?.name ?? null,
    categories: (raw.categories ?? [])
      .map((c) => c.name ?? "")
      .filter(Boolean)
      .slice(0, 6),
    fromPrice: lowestPrice(raw.advertised_departures, currency),
    currency,
    departuresStart: raw.departures_start_date ?? null,
    departuresEnd: raw.departures_end_date ?? null,
  };
}

// ---------- search ----------

export type TourSearchInput = {
  q?: string;
  country?: string;
  region?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  currency?: string;
  sort?: "NAME" | "PRICE" | "DEPARTURE";
  /** Inclusive trip-length window in days. */
  durationMin?: number;
  durationMax?: number;
  /** Inclusive per-person budget window in the requested currency. */
  priceMin?: number;
  priceMax?: number;
  /** Departure window (YYYY-MM-DD) used for live availability filtering. */
  departFrom?: string;
  departTo?: string;
};

export type TourSearchResult = {
  ok: boolean;
  status: number;
  error?: string;
  configured: boolean;
  environment: "sandbox" | "production";
  totalCount: number;
  page: number;
  pageSize: number;
  currency: string;
  tours: TourSummary[];
  hasMore: boolean;
};

// Module-level caches (per worker instance). The supplier's list endpoint
// returns thin records without images/description/geography, so every card
// needs a full dossier fetch; caching keeps repeat pages fast.
const dossierCache = new Map<string, RawDossier>();

type LiveEntry = {
  id: string;
  live: boolean;
  next: string | null;
  price: number | null;
  duration: number | null;
};

const liveCache = new Map<string, LiveEntry>();
const idListCache = new Map<
  string,
  {
    ids: string[];
    live: LiveEntry[];
    supplierPage: number;
    exhausted: boolean;
    total: number;
    at: number;
  }
>();
const LIST_TTL = 10 * 60 * 1000;
const SCAN_BUDGET_MS = 18000;
const MAX_SUPPLIER_PAGES = 80; // 4,000 dossiers — the full active catalogue

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

async function fullDossier(id: string): Promise<RawDossier | null> {
  const hit = dossierCache.get(id);
  if (hit) return hit;
  const res = await gFetch<RawDossier>(`/tour_dossiers/${encodeURIComponent(id)}`);
  if (!res.ok || !res.data) return null;
  dossierCache.set(id, res.data);
  return res.data;
}

function daysBetween(start?: string | null, finish?: string | null): number | null {
  if (!start || !finish) return null;
  const a = Date.parse(start);
  const b = Date.parse(finish);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000) + 1;
}

/** Cheapest live departure inside the requested window, plus trip length. */
async function liveProbe(
  id: string,
  currency: string,
  from?: string,
  to?: string,
): Promise<LiveEntry> {
  const start = from || new Date().toISOString().slice(0, 10);
  const key = `${id}:${currency}:${start}:${to ?? ""}`;
  const hit = liveCache.get(key);
  if (hit) return hit;
  const qs = new URLSearchParams({ start_date__gte: start, max_per_page: "1" });
  if (to) qs.set("start_date__lte", to);
  const probe = await gFetch<{ count?: number; results?: RawDeparture[] }>(
    `/tours/${encodeURIComponent(id)}/departures?${qs.toString()}`,
  );
  const first = probe.data?.results?.[0];
  const amount = (first?.lowest_pp2a_prices ?? []).find((p) => p.currency === currency)?.amount;
  const value: LiveEntry = {
    id,
    live: Boolean(probe.ok && (probe.data?.count ?? 0) > 0),
    next: first?.start_date ?? null,
    price: amount != null && Number.isFinite(Number(amount)) ? Number(amount) : null,
    duration: first?.days ?? daysBetween(first?.start_date, first?.finish_date),
  };
  liveCache.set(key, value);
  return value;
}

export async function searchTours(input: TourSearchInput): Promise<TourSearchResult> {
  const currency = (input.currency ?? "USD").toUpperCase();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 24));
  const base: TourSearchResult = {
    ok: false,
    status: 503,
    configured: toursConfigured(),
    environment: toursEnvironment(),
    totalCount: 0,
    page,
    pageSize,
    currency,
    tours: [],
    hasMore: false,
  };
  if (!toursConfigured()) {
    return { ...base, error: "Tour supplier credentials are not configured yet." };
  }

  const query = new URLSearchParams();
  if (input.q?.trim()) query.set("name", input.q.trim());
  if (input.country?.trim()) query.set("geography.visited_countries.name", input.country.trim());
  if (input.region?.trim()) query.set("geography.region.name", input.region.trim());
  if (input.category?.trim()) query.set("categories.name", input.category.trim());
  if (input.sort === "NAME") query.set("order_by", "name");
  const departFrom = input.departFrom?.trim() || undefined;
  const departTo = input.departTo?.trim() || undefined;
  const cacheKey = `${query.toString()}|${currency}|${departFrom ?? ""}|${departTo ?? ""}`;

  let index = idListCache.get(cacheKey);
  if (!index || Date.now() - index.at > LIST_TTL) {
    index = { ids: [], live: [], supplierPage: 0, exhausted: false, total: 0, at: Date.now() };
    idListCache.set(cacheKey, index);
  }

  const need = page * pageSize;
  let lastError: { status: number; error?: string } | null = null;
  const startedAt = Date.now();

  const matches = (e: LiveEntry) => {
    if (input.durationMin != null && (e.duration ?? 0) < input.durationMin) return false;
    if (input.durationMax != null && (e.duration ?? 9999) > input.durationMax) return false;
    if (input.priceMin != null && (e.price ?? 0) < input.priceMin) return false;
    if (input.priceMax != null && e.price != null && e.price > input.priceMax) return false;
    return true;
  };
  const filtered = () => index!.live.filter(matches);

  // Scan supplier pages until we have enough journeys with live future
  // departures to satisfy the requested page.
  while (filtered().length < need + 1 && !index.exhausted) {
    if (Date.now() - startedAt > SCAN_BUDGET_MS) break;
    const p = new URLSearchParams(query);
    p.set("max_per_page", "50");
    p.set("page", String(index.supplierPage + 1));
    const res = await gFetch<{ count?: number; results?: RawDossier[] }>(
      `/tour_dossiers?${p.toString()}`,
    );
    if (!res.ok) {
      lastError = { status: res.status, error: res.error };
      break;
    }
    index.supplierPage += 1;
    index.total = res.data?.count ?? index.total;
    const batch = res.data?.results ?? [];
    if (batch.length < 50) index.exhausted = true;
    if (!batch.length) break;
    const ids = batch.map((r) => String(r.id ?? "")).filter(Boolean);
    index.ids.push(...ids);
    const probes = await mapLimit(ids, 12, (id) => liveProbe(id, currency, departFrom, departTo));
    index.live.push(...probes.filter((x) => x.live));
    if (index.supplierPage >= MAX_SUPPLIER_PAGES) {
      index.exhausted = true;
      break;
    }
  }

  if (!index.live.length && lastError) return { ...base, ...lastError };

  const eligible = filtered();
  const slice = eligible.slice((page - 1) * pageSize, page * pageSize).map((e) => e.id);
  const hydrated = await mapLimit(slice, 10, async (id) => {
    const raw = await fullDossier(id);
    if (!raw) return null;
    const probe = await liveProbe(id, currency, departFrom, departTo);
    const t = normaliseTour({ ...raw, id }, currency);
    return {
      ...t,
      departuresStart: probe.next ?? t.departuresStart,
      fromPrice: t.fromPrice ?? probe.price,
      durationDays: probe.duration,
    };
  });
  let tours = hydrated.filter(Boolean) as TourSummary[];
  if (input.sort === "PRICE") {
    tours = tours.sort((a, b) => (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity));
  }
  if (input.sort === "DEPARTURE") {
    tours = tours.sort((a, b) =>
      (a.departuresStart ?? "9999").localeCompare(b.departuresStart ?? "9999"),
    );
  }
  // Estimate the live catalogue size from the observed live ratio.
  const scanned = index.ids.length || 1;
  const ratio = eligible.length / scanned;
  const totalCount = index.exhausted
    ? eligible.length
    : Math.max(eligible.length, Math.round((index.total || scanned) * ratio));
  return {
    ...base,
    ok: true,
    status: 200,
    totalCount,
    tours,
    hasMore: eligible.length > page * pageSize || !index.exhausted,
  };
}

// ---------- detail ----------

type RawItinerary = {
  days?: {
    day?: number;
    label?: string;
    summary?: string;
    description?: string;
    accommodations?: { name?: string; accommodation?: { name?: string } }[];
    meals?: { included?: boolean; type?: string; label?: string }[];
    location?: string;
    start_location?: { name?: string } | null;
  }[];
  duration?: number;
  name?: string;
};

function normaliseDays(raw: RawItinerary | undefined): TourDay[] {
  return (raw?.days ?? []).map((d, i) => ({
    day: d.day ?? i + 1,
    title: (d.label ?? `Day ${d.day ?? i + 1}`).trim(),
    summary: (d.summary ?? d.description ?? "").replace(/\s+/g, " ").trim(),
    location: d.start_location?.name ?? d.location ?? null,
    accommodation:
      d.accommodations?.[0]?.accommodation?.name ?? d.accommodations?.[0]?.name ?? null,
    meals: (d.meals ?? [])
      .filter((m) => m.included !== false)
      .map((m) => m.label ?? m.type ?? "")
      .filter(Boolean),
  }));
}

type RawDeparture = {
  id?: string;
  start_date?: string;
  finish_date?: string;
  days?: number;
  availability?: { status?: string; total?: number | null };
  rooms?: {
    code?: string;
    name?: string;
    availability?: { status?: string; total?: number | null };
    price_bands?: {
      prices?: { currency?: string; amount?: string }[];
      dossier_segment?: string;
    }[];
  }[];
  lowest_pp2a_prices?: { currency?: string; amount?: string }[];
};

function normaliseDeparture(raw: RawDeparture, currency: string): TourDeparture {
  const price = (() => {
    const row = (raw.lowest_pp2a_prices ?? []).find((p) => p.currency === currency);
    return row?.amount ? Number(row.amount) : null;
  })();
  const days =
    raw.start_date && raw.finish_date
      ? Math.round(
          (new Date(raw.finish_date).getTime() - new Date(raw.start_date).getTime()) / 86400000,
        ) + 1
      : null;
  return {
    id: String(raw.id ?? ""),
    startDate: raw.start_date ?? "",
    finishDate: raw.finish_date ?? "",
    days,
    status: raw.availability?.status ?? "UNKNOWN",
    availableSpaces: raw.availability?.total ?? null,
    price,
    currency,
    rooms: (raw.rooms ?? []).map((r) => {
      const band = r.price_bands?.[0]?.prices?.find((p) => p.currency === currency);
      return {
        code: r.code ?? "",
        name: r.name ?? r.code ?? "Standard",
        status: r.availability?.status ?? "UNKNOWN",
        price: band?.amount ? Number(band.amount) : null,
        currency,
      };
    }),
  };
}

function detailBody(raw: RawDossier, label: string): string | null {
  const row = (raw.details ?? []).find((d) =>
    (d.detail_type?.label ?? "").toLowerCase().includes(label.toLowerCase()),
  );
  return row?.body?.trim() ?? null;
}

export async function getTourDetail(
  id: string,
  currency = "USD",
  fromDate?: string,
): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  configured: boolean;
  tour?: TourDetail;
}> {
  if (!toursConfigured()) {
    return {
      ok: false,
      status: 503,
      configured: false,
      error: "Tour supplier credentials are not configured yet.",
    };
  }
  const res = await gFetch<RawDossier>(`/tour_dossiers/${encodeURIComponent(id)}`);
  if (!res.ok || !res.data) {
    return { ok: false, status: res.status, configured: true, error: res.error };
  }
  const raw = res.data;
  const summary = normaliseTour(raw, currency);

  const start = fromDate || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const refs = (raw.structured_itineraries ?? []).filter((r) => r.id && r.variation_id);
  // Prefer the itinerary variation valid today; otherwise walk the list until
  // one returns days so the day-by-day plan is never blank.
  const ordered = [
    ...refs.filter((r) =>
      (r.valid_during_ranges ?? []).some(
        (v) => (v.start_date ?? "0000") <= today && (!v.end_date || v.end_date >= today),
      ),
    ),
    ...refs.slice().reverse(),
  ];
  const seen = new Set<string>();
  const candidates = ordered.filter((r) => {
    const k = `${r.id}/${r.variation_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  async function loadItinerary(): Promise<RawItinerary | undefined> {
    for (const ref of candidates.slice(0, 4)) {
      const r = await gFetch<RawItinerary>(`/itineraries/${ref.id}/${ref.variation_id}`);
      if (r.ok && (r.data?.days?.length ?? 0) > 0) return r.data;
    }
    return undefined;
  }

  const [itinRaw, depRes] = await Promise.all([
    loadItinerary(),
    gFetch<{ results?: RawDeparture[] }>(
      `/tours/${encodeURIComponent(id)}/departures?start_date__gte=${start}&max_per_page=40`,
    ),
  ]);

  const itinerary = normaliseDays(itinRaw);
  const departures = (depRes.ok ? (depRes.data?.results ?? []) : [])
    .map((d) => normaliseDeparture(d, currency))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return {
    ok: true,
    status: 200,
    configured: true,
    tour: {
      ...summary,
      highlights: detailBody(raw, "highlights"),
      included: detailBody(raw, "included"),
      details: (raw.details ?? [])
        .filter((d) => d.body && d.detail_type?.label)
        .map((d) => ({ label: d.detail_type!.label!, body: d.body!.trim() }))
        .slice(0, 14),
      itinerary,
      durationDays: itinerary.length || departures[0]?.days || null,
      departures,
    },
  };
}

export async function getTourDepartures(id: string, currency = "USD", fromDate?: string) {
  if (!toursConfigured()) {
    return { ok: false, status: 503, configured: false, departures: [] as TourDeparture[] };
  }
  const start = fromDate || new Date().toISOString().slice(0, 10);
  const res = await gFetch<{ results?: RawDeparture[] }>(
    `/tours/${encodeURIComponent(id)}/departures?start_date__gte=${start}&max_per_page=60`,
  );
  return {
    ok: res.ok,
    status: res.status,
    configured: true,
    error: res.error,
    departures: (res.data?.results ?? []).map((d) => normaliseDeparture(d, currency)),
  };
}

// ---------- booking ----------

export type TourBookingInput = {
  departureId: string;
  roomCode: string;
  tourName: string;
  startDate: string;
  travellers: { firstName: string; lastName: string; email: string; phone?: string }[];
  currency?: string;
};

export async function createTourBooking(input: TourBookingInput) {
  if (!toursConfigured()) {
    return {
      ok: false,
      status: 503,
      needsCredentials: true,
      error: "Tour supplier credentials are not configured yet.",
    };
  }
  const agency = process.env.TOURS_AGENCY_CODE;
  if (!agency) {
    return {
      ok: false,
      status: 503,
      needsCredentials: true,
      error: "Agency code required before live reservations can be issued.",
    };
  }
  const lead = input.travellers[0];
  const bookingRes = await gFetch<{ id?: string; href?: string }>("/bookings", {
    method: "POST",
    body: {
      agency: { id: agency },
      currency: (input.currency ?? "USD").toUpperCase(),
      customers: input.travellers.map((t) => ({
        given_name: t.firstName,
        surname: t.lastName,
        email_addresses: [{ type: "HOME", email_address: t.email }],
        ...(t.phone ? { telephones: [{ type: "MOBILE", number: t.phone }] } : {}),
      })),
      external_id: `WWTG-${Date.now()}`,
    },
  });
  if (!bookingRes.ok || !bookingRes.data?.id) {
    return { ok: false, status: bookingRes.status, error: bookingRes.error };
  }
  const bookingId = bookingRes.data.id;
  const serviceRes = await gFetch<{ id?: string; status?: string }>(
    `/bookings/${bookingId}/services`,
    {
      method: "POST",
      body: {
        type: "DEPARTURE_SERVICE",
        departure: { id: input.departureId },
        room: { code: input.roomCode || "STD" },
        travellers: input.travellers.map((_, i) => ({ id: String(i + 1) })),
      },
    },
  );
  return {
    ok: serviceRes.ok,
    status: serviceRes.status,
    error: serviceRes.error,
    bookingId,
    serviceStatus: serviceRes.data?.status ?? null,
    reference: `WWTG-${bookingId}`,
    lead: lead?.email ?? null,
  };
}

/** Related journeys in the same region / travel style, excluding the current one. */
export async function getSimilarTours(
  id: string,
  currency = "USD",
  limit = 3,
): Promise<{ ok: boolean; tours: TourSummary[] }> {
  if (!toursConfigured()) return { ok: false, tours: [] };
  const raw = await fullDossier(id);
  if (!raw) return { ok: false, tours: [] };
  const region = raw.geography?.region?.name;
  const category = (raw.categories ?? []).map((c) => c.name).filter(Boolean)[0];
  const attempts = [
    region ? `geography.region.name=${encodeURIComponent(region)}` : null,
    category ? `categories.name=${encodeURIComponent(category)}` : null,
  ].filter(Boolean) as string[];
  for (const filter of attempts) {
    const res = await gFetch<{ results?: RawDossier[] }>(
      `/tour_dossiers?${filter}&max_per_page=${limit + 6}`,
    );
    const ids = (res.data?.results ?? [])
      .map((r) => String(r.id ?? ""))
      .filter((x) => x && x !== id)
      .slice(0, limit + 4);
    const hydrated = await mapLimit(ids, 6, async (rid) => {
      const probe = await liveProbe(rid, currency);
      if (!probe.live) return null;
      const d = await fullDossier(rid);
      if (!d) return null;
      const t = normaliseTour({ ...d, id: rid }, currency);
      return {
        ...t,
        departuresStart: probe.next ?? t.departuresStart,
        fromPrice: t.fromPrice ?? probe.price,
        durationDays: probe.duration,
      };
    });
    const tours = (hydrated.filter(Boolean) as TourSummary[]).slice(0, limit);
    if (tours.length) return { ok: true, tours };
  }
  return { ok: true, tours: [] };
}

export async function getDepartureDetail(departureId: string, currency = "USD") {
  if (!toursConfigured()) {
    return { ok: false, status: 503, configured: false, error: "Not configured." };
  }
  const res = await gFetch<RawDeparture>(`/departures/${encodeURIComponent(departureId)}`);
  if (!res.ok || !res.data) {
    return { ok: false, status: res.status, configured: true, error: res.error };
  }
  return {
    ok: true,
    status: 200,
    configured: true,
    departure: normaliseDeparture(res.data, currency),
  };
}
