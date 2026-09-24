// Server-only Bókun catalogue: search, product detail, availability,
// environment verification and catalogue sync. Read-only — no bookings here.

import { BOKUN_LIMITS, BOKUN_REST_ENDPOINTS, type BokunEnvironment } from "./config";
import { BokunError, bokunFetch, octoFetch } from "./client.server";

// ------------------------------------------------------------------ model

export interface BokunProductSummary {
  id: string;
  title: string;
  summary?: string;
  city?: string;
  country?: string;
  durationText?: string;
  priceFrom?: number;
  currency?: string;
  coverPhoto?: string;
  rating?: number;
  reviewCount?: number;
}

export interface BokunSearchResult {
  items: BokunProductSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BokunAvailabilitySlot {
  date: string;
  startTime?: string;
  startTimeId?: number;
  available: boolean;
  availabilityCount?: number;
  pricesByCategory?: Array<{ category?: string; amount: number; currency: string }>;
}

function pick<T>(obj: unknown, keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k] as T;
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function summarize(raw: unknown): BokunProductSummary {
  const photos = pick<unknown[]>(raw, ["photos", "images"]) ?? [];
  const cover = photos.find((p) => {
    const flag = pick<unknown>(p, ["flag"]);
    return flag === "COVER" || flag === "cover";
  }) ?? photos[0];
  const derived = pick<Record<string, unknown>>(cover, ["derived"]);
  const coverUrl =
    str(derived?.["original"]) ??
    str(pick(cover, ["originalUrl", "url", "sourceUrl"]));
  const location = pick<Record<string, unknown>>(raw, ["location"]) ?? {};
  const priceObj = pick<Record<string, unknown>>(raw, ["price"]) ?? {};
  const price =
    num(priceObj["amount"]) ??
    num(pick(raw, ["priceFrom", "startingPrice", "defaultPrice"]));
  return {
    id: String(pick<unknown>(raw, ["id"]) ?? ""),
    title: str(pick(raw, ["title", "name"])) ?? "Untitled tour",
    summary: str(pick(raw, ["summary", "excerpt", "shortDescription"])),
    city: str(location["city"] ?? pick(raw, ["city"])),
    country: str(location["country"] ?? pick(raw, ["country"])),
    durationText: str(pick(raw, ["durationText", "duration"])),
    priceFrom: price,
    currency: str(priceObj["currency"] ?? pick(raw, ["currency"])),
    coverPhoto: coverUrl,
    rating: num(pick(raw, ["rating", "averageRating"])),
    reviewCount: num(pick(raw, ["reviewCount", "reviewsCount"])),
  };
}

// ------------------------------------------------------------------ search

export interface SearchToursInput {
  query?: string;
  page?: number;
  pageSize?: number;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
}

export async function searchTours(input: SearchToursInput): Promise<BokunSearchResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? BOKUN_LIMITS.searchPageSize));
  const body: Record<string, unknown> = { page, pageSize };
  if (input.query?.trim()) body["searchTerm"] = input.query.trim().slice(0, 120);
  if (input.startDate && input.endDate) {
    body["startDate"] = input.startDate;
    body["endDate"] = input.endDate;
  }
  const res = await bokunFetch<Record<string, unknown>>(BOKUN_REST_ENDPOINTS.search, {
    method: "POST",
    body,
  });
  const itemsRaw =
    (Array.isArray(res?.["results"]) && (res["results"] as unknown[])) ||
    (Array.isArray(res?.["items"]) && (res["items"] as unknown[])) ||
    [];
  return {
    items: itemsRaw.map(summarize).filter((p) => p.id),
    total: num(res?.["totalHits"] ?? res?.["total"] ?? res?.["count"]) ?? itemsRaw.length,
    page,
    pageSize,
  };
}

// ------------------------------------------------------------------ detail

export interface BokunProductDetail {
  summary: BokunProductSummary;
  description?: string;
  photos: string[];
  keywords: string[];
}

export async function getProduct(id: string): Promise<BokunProductDetail> {
  if (!/^[0-9]+$/.test(id)) throw new BokunError("Invalid product id.", 400, "test", id);
  const raw = await bokunFetch<Record<string, unknown>>(
    BOKUN_REST_ENDPOINTS.product.replace("{id}", id),
  );
  const photos = (pick<unknown[]>(raw, ["photos"]) ?? [])
    .map((p) => {
      const derived = pick<Record<string, unknown>>(p, ["derived"]);
      return str(derived?.["original"]) ?? str(pick(p, ["originalUrl", "url", "sourceUrl"]));
    })
    .filter((u): u is string => Boolean(u));
  return {
    summary: summarize(raw),
    description: str(pick(raw, ["description", "longDescription"])),
    photos,
    keywords: (pick<unknown[]>(raw, ["keywords"]) ?? []).filter((k): k is string => typeof k === "string"),
  };
}

// -------------------------------------------------------------- availability

export async function getAvailability(
  id: string,
  start: string,
  end: string,
): Promise<BokunAvailabilitySlot[]> {
  if (!/^[0-9]+$/.test(id)) throw new BokunError("Invalid product id.", 400, "test", id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new BokunError("Invalid date range.", 400, "test", id);
  }
  const path = `${BOKUN_REST_ENDPOINTS.availabilities.replace("{id}", id)}?start=${start}&end=${end}&includeSoldOut=false`;
  const raw = await bokunFetch<unknown>(path);
  const list = Array.isArray(raw) ? raw : [];
  return list.map((slot) => {
    const times = pick<unknown[]>(slot, ["startTimes"]) ?? [];
    const first = times[0];
    const prices = (pick<unknown[]>(first ?? slot, ["pricesByCategory", "prices"]) ?? [])
      .map((p) => ({
        category: str(pick(p, ["ticketCategory", "category", "id"])),
        amount: num(pick(p, ["amount", "price"])) ?? 0,
        currency: str(pick(p, ["currency"])) ?? "",
      }))
      .filter((p) => p.currency);
    return {
      date: str(pick(slot, ["date", "localizedDate"])) ?? start,
      startTime: str(pick(first, ["name", "time", "label"])),
      startTimeId: num(pick(first, ["id"])),
      available: num(pick(slot, ["availabilityCount", "count"])) !== 0,
      availabilityCount: num(pick(slot, ["availabilityCount", "count"])),
      pricesByCategory: prices,
    };
  });
}

// ----------------------------------------------- environment verification

export interface BokunEnvironmentReport {
  /** Which hosts the stored credentials authenticate against. */
  rest: { test: boolean; live: boolean };
  octo: { test: boolean; live: boolean };
  detectedEnvironment: BokunEnvironment | "unknown";
  sampleProductCount: number;
  /** Non-secret detail, safe for the admin screen. */
  detail: string;
}

/**
 * Non-destructive probe: a single-page search + OCTO product list against each
 * host. No bookings, no writes. Determines whether the stored credentials are
 * TEST or LIVE.
 */
export async function verifyEnvironment(): Promise<BokunEnvironmentReport> {
  const probe = async (env: BokunEnvironment) => {
    try {
      const res = await bokunFetch<Record<string, unknown>>(BOKUN_REST_ENDPOINTS.search, {
        method: "POST",
        body: { page: 1, pageSize: 1 },
        environment: env,
        retry: false,
        timeoutMs: 15_000,
      });
      const hits = Array.isArray(res?.["results"]) ? (res["results"] as unknown[]).length : 0;
      return { ok: true, hits };
    } catch (err) {
      return { ok: false, hits: 0, status: err instanceof BokunError ? err.status : 0 };
    }
  };
  const octoProbe = async (env: BokunEnvironment) => {
    try {
      if (!process.env["BOKUN_OCTO_TOKEN"]) return false;
      const res = await octoFetch<unknown[]>("/octo/v1/products", {
        environment: env,
        retry: false,
        timeoutMs: 15_000,
      });
      return Array.isArray(res);
    } catch {
      return false;
    }
  };
  const [restTest, restLive, octoTest, octoLive] = await Promise.all([
    probe("test"),
    probe("live"),
    octoProbe("test"),
    octoProbe("live"),
  ]);
  let detected: BokunEnvironment | "unknown" = "unknown";
  if (restTest.ok && !restLive.ok) detected = "test";
  else if (restLive.ok && !restTest.ok) detected = "live";
  else if (restTest.ok && restLive.ok) {
    // Keys valid on both hosts is unusual — flag rather than guess.
    detected = "unknown";
  }
  const sampleProductCount = (restTest.ok ? restTest.hits : 0) + (restLive.ok ? restLive.hits : 0);
  const detail = [
    `REST test host: ${restTest.ok ? "authenticated" : "not authenticated"}`,
    `REST live host: ${restLive.ok ? "authenticated" : "not authenticated"}`,
    `OCTO test host: ${octoTest ? "authenticated" : "not authenticated/disabled"}`,
    `OCTO live host: ${octoLive ? "authenticated" : "not authenticated/disabled"}`,
  ].join("; ");
  return { rest: { test: restTest.ok, live: restLive.ok }, octo: { test: octoTest, live: octoLive }, detectedEnvironment: detected, sampleProductCount, detail };
}

// -------------------------------------------------------------------- sync

export interface SyncResult {
  synced: number;
  pages: number;
  errors: string[];
}

/**
 * Syncs the Bókun product catalogue into public.bokun_products (upsert by
 * product_id). Called by staff from the admin screen.
 */
export async function syncCatalogue(): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const errors: string[] = [];
  let synced = 0;
  let pages = 0;
  for (let page = 1; page <= BOKUN_LIMITS.catalogueMaxPages; page += 1) {
    let result: BokunSearchResult;
    try {
      result = await searchTours({ page, pageSize: BOKUN_LIMITS.catalogueSyncPageSize });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "page fetch failed");
      break;
    }
    pages = page;
    if (result.items.length === 0) break;
    const rows = result.items.map((p) => ({
      product_id: p.id,
      title: p.title,
      summary: p.summary ?? null,
      city: p.city ?? null,
      country: p.country ?? null,
      duration_text: p.durationText ?? null,
      price_from: p.priceFrom ?? null,
      currency: p.currency ?? null,
      cover_photo: p.coverPhoto ?? null,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("bokun_products" as never)
      .upsert(rows as never, { onConflict: "product_id" });
    if (error) {
      errors.push("database upsert failed");
      break;
    }
    synced += rows.length;
    if (result.items.length < BOKUN_LIMITS.catalogueSyncPageSize) break;
  }
  return { synced, pages, errors };
}
