// Connector runtime — server-only. One implementation drives every supplier;
// behaviour comes from the registry config (auth, endpoints, retries, rate
// limit, cache TTL, sync strategy). Adding a supplier requires configuration
// only. Until credentials exist a connector runs in demonstration mode and
// serves clearly-flagged internal sample records.
import { PARTNER_CONNECTORS, getConnector } from "./registry";
import { ALL_DEMO_JOURNEYS as DEMO_JOURNEYS } from "./demo-journeys-verticals";
import type {
  Journey,
  JourneyWaypoint,
  PartnerConnectorConfig,
  PartnerHealth,
  PartnerLogEntry,
  PartnerMode,
  PartnerSyncResult,
} from "./types";

// ---------------------------------------------------------------- logging
const LOG_LIMIT = 200;
const logBuffer: PartnerLogEntry[] = [];

function log(entry: PartnerLogEntry) {
  logBuffer.unshift(entry);
  if (logBuffer.length > LOG_LIMIT) logBuffer.length = LOG_LIMIT;
  const line = `[partner:${entry.partnerId}] ${entry.operation} ${entry.status} ${entry.durationMs}ms${entry.detail ? ` — ${entry.detail}` : ""}`;
  if (entry.status === "error") console.error(line);
  else console.log(line);
}

export function partnerLogs(limit = 50): PartnerLogEntry[] {
  return logBuffer.slice(0, limit);
}

// ------------------------------------------------------------ rate limiting
const buckets = new Map<string, { tokens: number; last: number }>();

async function takeToken(cfg: PartnerConnectorConfig): Promise<boolean> {
  const now = Date.now();
  const b = buckets.get(cfg.id) ?? { tokens: cfg.rateLimitPerSecond, last: now };
  const refill = ((now - b.last) / 1000) * cfg.rateLimitPerSecond;
  b.tokens = Math.min(cfg.rateLimitPerSecond, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(cfg.id, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(cfg.id, b);
  return true;
}

// -------------------------------------------------------------------- cache
type CacheEntry = { at: number; ttl: number; value: unknown };
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl * 1000) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown, ttl: number) {
  cache.set(key, { at: Date.now(), ttl, value });
}

export function invalidatePartnerCache(partnerId?: string) {
  for (const k of Array.from(cache.keys()))
    if (!partnerId || k.startsWith(`${partnerId}:`)) cache.delete(k);
}

// ----------------------------------------------------------------- creds
export function missingSecrets(cfg: PartnerConnectorConfig): string[] {
  return cfg.auth.secrets.filter((name) => !process.env[name]);
}

export function resolveMode(cfg: PartnerConnectorConfig): PartnerMode {
  if (missingSecrets(cfg).length === 0) return "live";
  return "demonstration";
}

function authHeaders(cfg: PartnerConnectorConfig): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const [a, b] = cfg.auth.secrets.map((s) => process.env[s] ?? "");
  switch (cfg.auth.kind) {
    case "api-key-header":
      if (cfg.auth.header && a) h[cfg.auth.header] = a;
      break;
    case "bearer-token":
      if (a) h.Authorization = `Bearer ${a}`;
      break;
    case "basic":
      if (a) h.Authorization = `Basic ${btoa(`${a}:${b ?? ""}`)}`;
      break;
    case "header-pair":
      // First secret becomes Username header, second becomes Password header.
      if (a) h.Username = a;
      if (b) h.Password = b;
      break;
    case "signed-session":
      if (cfg.auth.header && a) h[cfg.auth.header] = a;
      break;
    case "oauth2-client-credentials":
      // Token is attached by `oauthToken()` at call time.
      break;
  }
  return h;
}

const tokenCache = new Map<string, { token: string; expires: number }>();

async function oauthToken(cfg: PartnerConnectorConfig): Promise<string | null> {
  if (cfg.auth.kind !== "oauth2-client-credentials" || !cfg.auth.tokenPath) return null;
  const hit = tokenCache.get(cfg.id);
  if (hit && hit.expires > Date.now()) return hit.token;
  const [idKey, secretKey] = cfg.auth.secrets;
  const clientId = process.env[idKey];
  const clientSecret = process.env[secretKey];
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (cfg.auth.scope) body.set("scope", cfg.auth.scope);
  const res = await fetch(`${cfg.baseUrl}${cfg.auth.tokenPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  tokenCache.set(cfg.id, {
    token: json.access_token,
    expires: Date.now() + (json.expires_in ?? 1800) * 1000 - 30_000,
  });
  return json.access_token;
}

// ------------------------------------------------------------ http w/ retry
export interface PartnerRequestResult {
  ok: boolean;
  status: number;
  attempts: number;
  durationMs: number;
  body: unknown;
  error?: string;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function partnerRequest(
  cfg: PartnerConnectorConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<PartnerRequestResult> {
  const started = Date.now();
  let attempts = 0;
  let lastError = "";
  let lastStatus = 0;

  while (attempts < Math.max(1, cfg.maxRetries)) {
    attempts += 1;
    if (!(await takeToken(cfg))) {
      log({
        at: new Date().toISOString(),
        partnerId: cfg.id,
        operation: path,
        status: "rate-limited",
        durationMs: Date.now() - started,
      });
      await sleep(1000 / cfg.rateLimitPerSecond);
      continue;
    }
    const headers = authHeaders(cfg);
    if (cfg.auth.kind === "oauth2-client-credentials") {
      const token = await oauthToken(cfg);
      if (!token)
        return {
          ok: false,
          status: 401,
          attempts,
          durationMs: Date.now() - started,
          body: null,
          error: "OAuth token unavailable",
        };
      headers.Authorization = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text.slice(0, 500) };
      }
      if (res.ok) {
        log({
          at: new Date().toISOString(),
          partnerId: cfg.id,
          operation: path,
          status: "ok",
          durationMs: Date.now() - started,
        });
        return { ok: true, status: res.status, attempts, durationMs: Date.now() - started, body };
      }
      // 4xx (other than 429) is not retryable.
      if (res.status < 500 && res.status !== 429) {
        log({
          at: new Date().toISOString(),
          partnerId: cfg.id,
          operation: path,
          status: "error",
          durationMs: Date.now() - started,
          detail: `HTTP ${res.status}`,
        });
        return {
          ok: false,
          status: res.status,
          attempts,
          durationMs: Date.now() - started,
          body,
          error: `HTTP ${res.status}`,
        };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err.message : "Network error";
    }
    log({
      at: new Date().toISOString(),
      partnerId: cfg.id,
      operation: path,
      status: "retry",
      durationMs: Date.now() - started,
      detail: lastError,
    });
    await sleep(250 * 2 ** (attempts - 1));
  }

  log({
    at: new Date().toISOString(),
    partnerId: cfg.id,
    operation: path,
    status: "error",
    durationMs: Date.now() - started,
    detail: lastError,
  });
  return {
    ok: false,
    status: lastStatus,
    attempts,
    durationMs: Date.now() - started,
    body: null,
    error: lastError || "Request failed",
  };
}

// ------------------------------------------------------------------ health
export async function checkHealth(cfg: PartnerConnectorConfig): Promise<PartnerHealth> {
  const missing = missingSecrets(cfg);
  const base: PartnerHealth = {
    id: cfg.id,
    name: cfg.name,
    mode: missing.length ? "demonstration" : "live",
    credentialsPresent: missing.length === 0,
    missingSecrets: missing,
    reachable: null,
    status: null,
    latencyMs: null,
    attempts: 0,
    message: missing.length
      ? `Demonstration mode — awaiting ${missing.join(", ")}. Catalogue, search, filters and enquiry flows remain fully functional.`
      : "Credentials present.",
    checkedAt: new Date().toISOString(),
  };
  if (missing.length || !cfg.endpoints.health) return base;

  const res = await partnerRequest(cfg, cfg.endpoints.health);
  return {
    ...base,
    reachable: res.ok,
    status: res.status || null,
    latencyMs: res.durationMs,
    attempts: res.attempts,
    mode: res.ok ? "live" : "demonstration",
    message: res.ok
      ? "Connector healthy — live partner inventory in use."
      : `Partner unreachable (${res.error ?? "unknown"}). Serving demonstration inventory until it recovers.`,
  };
}

export async function healthAll(): Promise<PartnerHealth[]> {
  return Promise.all(PARTNER_CONNECTORS.map((c) => checkHealth(c)));
}

// -------------------------------------------------------------- normalising
function pickArray(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  for (const key of ["journeys", "voyages", "results", "data", "items", "products", "tours"]) {
    const v = rec[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : Number(v) || fallback);
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Maps any supplier record onto the enterprise journey model. */
export function normaliseJourney(
  cfg: PartnerConnectorConfig,
  raw: Record<string, unknown>,
): Journey {
  const template = DEMO_JOURNEYS.find((j) => j.partnerId === cfg.id) ?? DEMO_JOURNEYS[0];
  const country = str(raw.country, template.country);
  const region = str(raw.region, template.region);
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const cities = arr(raw.cities);
  return {
    code: str(
      raw.code ?? raw.id ?? raw.productCode,
      `${cfg.id}-${Math.random().toString(36).slice(2, 8)}`,
    ).toUpperCase(),
    title: str(raw.title ?? raw.name, "Untitled journey"),
    subtitle: str(raw.subtitle ?? raw.summary ?? raw.description).slice(0, 180),
    partnerId: cfg.id,
    partnerName: cfg.name,
    collection: str(raw.collection, template.collection),
    collectionKind: str(raw.collectionKind, cfg.collections[0] ?? template.collectionKind),
    region,
    regionSlug: slugify(region),
    country,
    countrySlug: slugify(country),
    cities,
    destinationSlugs: cities.map(slugify),
    durationDays: num(raw.durationDays ?? raw.days, template.durationDays),
    durationNights: num(
      raw.durationNights ?? raw.nights,
      Math.max(1, num(raw.durationDays ?? raw.days, template.durationDays) - 1),
    ),
    priceFrom: num(raw.priceFrom ?? raw.price, template.priceFrom),
    currency: str(raw.currency, "USD"),
    groupSizeMax: num(raw.groupSizeMax ?? raw.maxGroupSize, template.groupSizeMax),
    groupStyle: str(raw.groupStyle, template.groupStyle) as Journey["groupStyle"],
    luxuryLevel: str(raw.luxuryLevel, template.luxuryLevel) as Journey["luxuryLevel"],
    hotels: arr(raw.hotels),
    ships: arr(raw.ships),
    rail: arr(raw.rail),
    mealPlan: str(raw.mealPlan, template.mealPlan),
    highlights: arr(raw.highlights),
    itinerary: Array.isArray(raw.itinerary)
      ? (raw.itinerary as Record<string, unknown>[]).map((dRaw, i) => ({
          day: num(dRaw.day, i + 1),
          title: str(dRaw.title, `Day ${i + 1}`),
          location: str(dRaw.location),
          description: str(dRaw.description),
          meals: arr(dRaw.meals),
          accommodation: str(dRaw.accommodation) || undefined,
        }))
      : [],
    inclusions: arr(raw.inclusions),
    exclusions: arr(raw.exclusions),
    extensions: Array.isArray(raw.extensions)
      ? (raw.extensions as Record<string, unknown>[]).map((e) => ({
          title: str(e.title),
          nights: num(e.nights),
          priceFrom: num(e.priceFrom),
        }))
      : [],
    departures: Array.isArray(raw.departures)
      ? (raw.departures as Record<string, unknown>[]).map((dep) => ({
          date: str(dep.date ?? dep.startDate),
          endDate: str(dep.endDate),
          price: num(dep.price),
          currency: str(dep.currency, "USD"),
          availability: str(
            dep.availability,
            "available",
          ) as Journey["departures"][number]["availability"],
          seatsRemaining: typeof dep.seatsRemaining === "number" ? dep.seatsRemaining : null,
        }))
      : [],
    media: {
      hero: str(
        (raw.media as Record<string, unknown> | undefined)?.hero ?? raw.image,
        template.media.hero,
      ),
      gallery: arr((raw.media as Record<string, unknown> | undefined)?.gallery),
      videoUrl: str((raw.media as Record<string, unknown> | undefined)?.videoUrl) || undefined,
      brochureUrl:
        str((raw.media as Record<string, unknown> | undefined)?.brochureUrl) || undefined,
    },
    terms: arr(raw.terms),
    reviews: [],
    rating: num(raw.rating, 4.8),
    reviewCount: num(raw.reviewCount, 0),
    interests: arr(raw.interests),
    templateId: str(raw.templateId) || cfg.templates?.[0] || undefined,
    waypoints: Array.isArray(raw.waypoints)
      ? (raw.waypoints as Record<string, unknown>[])
          .map((w) => ({
            name: str(w.name ?? w.port ?? w.city),
            lat: num(w.lat ?? w.latitude, NaN),
            lng: num(w.lng ?? w.lon ?? w.longitude, NaN),
            day: typeof w.day === "number" ? w.day : undefined,
            kind: (str(w.kind) || undefined) as JourneyWaypoint["kind"],
          }))
          .filter((w) => w.name && Number.isFinite(w.lat) && Number.isFinite(w.lng))
      : undefined,
    documents: Array.isArray(raw.documents)
      ? (raw.documents as Record<string, unknown>[])
          .map((d) => ({
            title: str(d.title ?? d.name, "Document"),
            url: str(d.url ?? d.href),
            kind: (str(d.kind, "other") || "other") as NonNullable<
              Journey["documents"]
            >[number]["kind"],
          }))
          .filter((d) => d.url)
      : undefined,
    faqs: Array.isArray(raw.faqs)
      ? (raw.faqs as Record<string, unknown>[])
          .map((f) => ({
            question: str(f.question ?? f.q),
            answer: str(f.answer ?? f.a),
          }))
          .filter((f) => f.question && f.answer)
      : undefined,
    vessel:
      raw.vessel && typeof raw.vessel === "object"
        ? (() => {
            const v = raw.vessel as Record<string, unknown>;
            return {
              name: str(v.name, "Vessel"),
              type: str(v.type, "Vessel"),
              guests: v.guests != null ? num(v.guests) : undefined,
              cabins: v.cabins != null ? num(v.cabins) : undefined,
              crew: v.crew != null ? num(v.crew) : undefined,
              bedrooms: v.bedrooms != null ? num(v.bedrooms) : undefined,
              yearBuilt: v.yearBuilt != null ? num(v.yearBuilt) : undefined,
              iceClass: str(v.iceClass) || undefined,
              amenities: arr(v.amenities),
            };
          })()
        : undefined,
    availableDates: arr(raw.availableDates),
    dataSource: "partner-api",
    updatedAt: str(raw.updatedAt, new Date().toISOString().slice(0, 10)),
  };
}

// ------------------------------------------------------------------- sync

/** Ingest an authorised bulk feed (XML/JSON/CSV) and normalise it. */
async function syncFromFeed(
  cfg: PartnerConnectorConfig,
  started: number,
  cacheKey: string,
): Promise<PartnerSyncResult | null> {
  const { fetchFeed } = await import("./feeds.server");
  const feed = await fetchFeed(cfg);
  if (!feed.ok || feed.records.length === 0) {
    log({
      at: new Date().toISOString(),
      partnerId: cfg.id,
      operation: "feed",
      status: "error",
      durationMs: feed.durationMs,
      detail: feed.error ?? "empty feed",
    });
    return null;
  }
  const journeys = feed.records.map((r) => normaliseJourney(cfg, r));
  log({
    at: new Date().toISOString(),
    partnerId: cfg.id,
    operation: "feed",
    status: "ok",
    durationMs: feed.durationMs,
    detail: `${journeys.length} records`,
  });
  const result: PartnerSyncResult = {
    partnerId: cfg.id,
    partnerName: cfg.name,
    mode: "live",
    journeys,
    received: journeys.length,
    created: journeys.length,
    updated: 0,
    unchanged: 0,
    cursor: new Date().toISOString(),
    fromCache: false,
    durationMs: Date.now() - started,
    warnings: [],
    syncedAt: new Date().toISOString(),
  };
  cacheSet(cacheKey, result, cfg.cacheTtlSeconds);
  return result;
}

export async function syncCatalogue(
  partnerId: string,
  opts: { since?: string; force?: boolean } = {},
): Promise<PartnerSyncResult> {
  const started = Date.now();
  const cfg = getConnector(partnerId);
  if (!cfg) {
    return {
      partnerId,
      partnerName: partnerId,
      mode: "disabled",
      journeys: [],
      received: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      cursor: null,
      fromCache: false,
      durationMs: 0,
      warnings: ["Unknown connector"],
      syncedAt: new Date().toISOString(),
    };
  }

  const cacheKey = `${cfg.id}:catalog:${opts.since ?? "full"}`;
  if (!opts.force) {
    const hit = cacheGet<PartnerSyncResult>(cacheKey);
    if (hit) {
      log({
        at: new Date().toISOString(),
        partnerId: cfg.id,
        operation: "catalog",
        status: "cache-hit",
        durationMs: Date.now() - started,
      });
      return { ...hit, fromCache: true };
    }
  }

  const demo = DEMO_JOURNEYS.filter((j) => j.partnerId === cfg.id);
  const missing = missingSecrets(cfg);

  if (missing.length || !cfg.endpoints.catalog) {
    // A partner may license a bulk feed instead of a REST catalogue.
    if (!missing.length && cfg.feed) {
      const viaFeed = await syncFromFeed(cfg, started, cacheKey);
      if (viaFeed) return viaFeed;
    }
    log({
      at: new Date().toISOString(),
      partnerId: cfg.id,
      operation: "catalog",
      status: "demo",
      durationMs: Date.now() - started,
      detail: missing.join(",") || "no catalog endpoint",
    });
    const result: PartnerSyncResult = {
      partnerId: cfg.id,
      partnerName: cfg.name,
      mode: "demonstration",
      journeys: demo,
      received: demo.length,
      created: 0,
      updated: 0,
      unchanged: demo.length,
      cursor: null,
      fromCache: false,
      durationMs: Date.now() - started,
      warnings: missing.length
        ? [`Awaiting credentials: ${missing.join(", ")}`]
        : ["No catalogue endpoint configured"],
      syncedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, result, 60);
    return result;
  }

  const path =
    opts.since && cfg.endpoints.catalogDelta
      ? cfg.endpoints.catalogDelta.replace("{since}", encodeURIComponent(opts.since))
      : cfg.endpoints.catalog;
  const res = await partnerRequest(cfg, path);

  if (!res.ok) {
    if (cfg.feed) {
      const viaFeed = await syncFromFeed(cfg, started, cacheKey);
      if (viaFeed) return { ...viaFeed, warnings: ["REST catalogue unavailable; feed ingested."] };
    }
    const result: PartnerSyncResult = {
      partnerId: cfg.id,
      partnerName: cfg.name,
      mode: "demonstration",
      journeys: demo,
      received: demo.length,
      created: 0,
      updated: 0,
      unchanged: demo.length,
      cursor: null,
      fromCache: false,
      durationMs: Date.now() - started,
      warnings: [
        `Partner sync failed (${res.error ?? res.status}); demonstration inventory served.`,
      ],
      syncedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, result, 60);
    return result;
  }

  const rows = pickArray(res.body);
  const journeys = rows.map((r) => normaliseJourney(cfg, r));
  const known = new Set(demo.map((j) => j.code));
  const result: PartnerSyncResult = {
    partnerId: cfg.id,
    partnerName: cfg.name,
    mode: "live",
    journeys,
    received: rows.length,
    created: journeys.filter((j) => !known.has(j.code)).length,
    updated: journeys.filter((j) => known.has(j.code)).length,
    unchanged: 0,
    cursor:
      (res.body &&
      typeof res.body === "object" &&
      typeof (res.body as Record<string, unknown>).cursor === "string"
        ? ((res.body as Record<string, unknown>).cursor as string)
        : null) ?? new Date().toISOString(),
    fromCache: false,
    durationMs: Date.now() - started,
    warnings: journeys.length ? [] : ["Partner returned zero journeys"],
    syncedAt: new Date().toISOString(),
  };
  cacheSet(cacheKey, result, cfg.cacheTtlSeconds);
  return result;
}

export async function syncAll(): Promise<PartnerSyncResult[]> {
  const catalogPartners = PARTNER_CONNECTORS.filter((c) => c.capabilities.includes("catalog"));
  return Promise.all(catalogPartners.map((c) => syncCatalogue(c.id)));
}

/** Accept pushed feed records (already field-mapped), normalise and cache them
 *  so the catalogue serves partner data on the next read. */
export function ingestFeedRecords(
  cfg: PartnerConnectorConfig,
  records: Record<string, unknown>[],
): { received: number; accepted: number; syncedAt: string } {
  const journeys = records.map((r) => normaliseJourney(cfg, r)).filter((j) => j.title && j.code);
  const syncedAt = new Date().toISOString();
  const result: PartnerSyncResult = {
    partnerId: cfg.id,
    partnerName: cfg.name,
    mode: "live",
    journeys,
    received: records.length,
    created: journeys.length,
    updated: 0,
    unchanged: 0,
    cursor: syncedAt,
    fromCache: false,
    durationMs: 0,
    warnings: [],
    syncedAt,
  };
  invalidatePartnerCache(cfg.id);
  cacheSet(`${cfg.id}:catalog:full`, result, cfg.cacheTtlSeconds);
  log({
    at: syncedAt,
    partnerId: cfg.id,
    operation: "feed-push",
    status: "ok",
    durationMs: 0,
    detail: `${journeys.length}/${records.length} accepted`,
  });
  return { received: records.length, accepted: journeys.length, syncedAt };
}
