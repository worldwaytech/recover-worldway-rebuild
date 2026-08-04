// Server-only helpers for wwl.functions.ts.
// Kept in a separate module so the TanStack server-fn code splitter
// (tss-serverfn-split) doesn't strip handler-referenced siblings.
// See knowledge: tanstack-serverfn-splitting.

import {
  toPartnerHotelPayload,
  toPartnerFlightPayload,
  toPartnerPrivateJetPayload,
  toPartnerTransferPayload,
} from "./wwl-adapters";

export {
  toPartnerHotelPayload,
  toPartnerFlightPayload,
  toPartnerPrivateJetPayload,
  toPartnerTransferPayload,
};

export const BASE = "https://worldwayluxe.com/api/public/partner";

export const ENDPOINTS = {
  flights: "/flights/search",
  hotels: "/hotels/search",
  activities: "/activities/search",
  transfers: "/transfers/search",
  tripBuilder: "/trip-builder/build",
  buses: "/buses/search",
  privateJets: "/private-jets/quote",
  concierge: "/concierge/chat",
  walletBalance: "/wallet/balance",
  walletTransactions: "/wallet/transactions",
  topupRazorpay: "/wallet/topup/razorpay/create",
  topupPaypal: "/wallet/topup/paypal/create",
  topupVerify: "/wallet/topup/verify",
} as const;

export type EndpointKey = keyof typeof ENDPOINTS;

type Json = null | string | number | boolean | Json[] | { [k: string]: Json };
export type PartnerResult = {
  ok: boolean;
  status: number;
  error?: string;
  data?: Json;
};

export type PartnerLookupRow = {
  type?: "airport" | "city";
  iata?: string;
  icao?: string;
  airport_name?: string;
  city?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
};

export type PartnerLookupResult = {
  ok: boolean;
  status: number;
  error?: string;
  reason?: string;
  count?: number;
  results?: PartnerLookupRow[];
};

type ManifestEndpoint = {
  vertical?: string;
  product?: string;
  capability?: string;
  path: string;
  methods?: string[];
};
type Manifest = { version?: string; endpoints: ManifestEndpoint[] };

const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;
let manifestCache: {
  at: number;
  version?: string;
  map: Partial<Record<EndpointKey, string>>;
  raw: Manifest;
} | null = null;

const MANIFEST_MATCHERS: Record<EndpointKey, (e: ManifestEndpoint) => boolean> = {
  flights: (e) =>
    (e.product ?? e.vertical) === "flights" && (e.capability ?? "search") === "search",
  hotels: (e) => (e.product ?? e.vertical) === "hotels" && (e.capability ?? "search") === "search",
  activities: (e) =>
    (e.product ?? e.vertical) === "activities" && (e.capability ?? "search") === "search",
  transfers: (e) =>
    (e.product ?? e.vertical) === "transfers" && (e.capability ?? "search") === "search",
  buses: (e) => (e.product ?? e.vertical) === "buses" && (e.capability ?? "search") === "search",
  privateJets: (e) =>
    (e.product ?? e.vertical) === "private-jets" && (e.capability ?? "quote") === "quote",
  tripBuilder: (e) => (e.product ?? e.vertical) === "trip-builder",
  concierge: (e) => (e.product ?? e.vertical) === "concierge",
  walletBalance: (e) => e.product === "wallet" && e.capability === "balance",
  walletTransactions: (e) => e.product === "wallet" && e.capability === "transactions",
  topupRazorpay: (e) => e.product === "wallet" && e.capability === "topup.razorpay.create",
  topupPaypal: (e) => e.product === "wallet" && e.capability === "topup.paypal.create",
  topupVerify: (e) => e.product === "wallet" && e.capability === "topup.verify",
};

function normalizePartnerPath(path: string): string {
  return path.replace(/^\/api\/public\/partner(?=\/)/, "");
}

export function partnerHeaders(): Record<string, string> | null {
  const apiKey = process.env.WWL_PARTNER_API_KEY || process.env.WORLDWAY_PARTNER_API_KEY;
  if (!apiKey) return null;
  const env = process.env.WORLDWAY_PARTNER_ENV ?? "production";
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": apiKey,
    "X-Api-Environment": env,
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function fetchManifest(): Promise<Manifest | null> {
  const headers = partnerHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${BASE}/manifest`, { method: "GET", headers });
    if (!res.ok) return null;
    const json = (await res.json()) as Manifest;
    if (!json || !Array.isArray(json.endpoints)) return null;
    const map: Partial<Record<EndpointKey, string>> = {};
    for (const k of Object.keys(MANIFEST_MATCHERS) as EndpointKey[]) {
      const hit = json.endpoints.find((e) => MANIFEST_MATCHERS[k](e));
      if (hit?.path) map[k] = normalizePartnerPath(hit.path);
    }
    manifestCache = { at: Date.now(), version: json.version, map, raw: json };
    return json;
  } catch {
    return null;
  }
}

function asJsonRecord(value: Json | undefined): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function pickArray(record: Record<string, Json> | null, keys: string[]): Json[] | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

function normalizePartnerData(key: EndpointKey, data: Json, payload: unknown): Json {
  if (Array.isArray(data)) {
    return { ok: true, vertical: key.replace(/s$/, ""), [key]: data };
  }

  const top = asJsonRecord(data);
  if (top && Array.isArray(top.data)) {
    return { ok: true, vertical: key.replace(/s$/, ""), [key]: top.data };
  }

  const nested = asJsonRecord(top?.data);
  const source = nested ?? top;
  if (!top && !nested) return data;

  if (key === "flights") {
    const flights =
      pickArray(top, ["flights", "results", "items", "search_results"]) ??
      pickArray(nested, ["flights", "results", "items", "search_results"]);
    return flights ? { ...(source ?? {}), ok: true, vertical: "flight", flights } : data;
  }

  if (key === "hotels") {
    const hotels =
      pickArray(top, ["hotels", "properties", "results", "items"]) ??
      pickArray(nested, ["hotels", "properties", "results", "items"]);
    return hotels ? { ...(source ?? {}), ok: true, vertical: "hotel", hotels } : data;
  }

  if (key === "buses") {
    const buses =
      pickArray(top, ["buses", "services", "results", "items"]) ??
      pickArray(nested, ["buses", "services", "results", "items"]);
    return buses ? { ...(source ?? {}), ok: true, vertical: "bus", buses } : data;
  }

  if (key === "concierge") {
    const reply =
      top?.reply ??
      top?.message ??
      top?.content ??
      top?.answer ??
      nested?.reply ??
      nested?.message ??
      nested?.content ??
      nested?.answer;
    if (typeof reply === "string" && reply.trim()) return { ok: true, reply };
    const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const message = typeof rec.message === "string" ? rec.message : "your request";
    return source
      ? { ...source, reply: JSON.stringify(source) }
      : { ok: true, reply: `I received your request: ${message}` };
  }

  return data;
}

export async function ensureManifest(): Promise<void> {
  if (manifestCache && Date.now() - manifestCache.at < MANIFEST_TTL_MS) return;
  await fetchManifest();
}

export function getManifestCache() {
  return manifestCache;
}

export async function callPartner(key: EndpointKey, payload: unknown): Promise<PartnerResult> {
  const headers = partnerHeaders();
  if (!headers) {
    console.error("Missing partner API key configuration");
    return { ok: false, status: 500, error: "Partner API key is not configured" };
  }
  await ensureManifest();
  const path = normalizePartnerPath(manifestCache?.map[key] ?? ENDPOINTS[key]);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload ?? {}),
    });
    const text = await res.text();
    let data: Json = null;
    try {
      data = text ? (JSON.parse(text) as Json) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const record =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, Json>)
          : null;
      const msg =
        typeof record?.error === "string"
          ? record.error
          : typeof record?.message === "string"
            ? record.message
            : `Request failed (${res.status})`;
      console.error("Partner API request failed", { key, path, status: res.status, message: msg });
      return { ok: false, status: res.status, error: msg, data };
    }
    const normalized = normalizePartnerData(key, data, payload);
    return { ok: true, status: res.status, data: normalized };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    console.error("Partner API network error", { key, path, message });
    return { ok: false, status: 0, error: message };
  }
}

export async function callPartnerLookup(
  kind: "airports" | "cities" | "locations",
  query: string,
  limit?: number,
): Promise<PartnerLookupResult> {
  const headers = partnerHeaders();
  if (!headers) return { ok: false, status: 500, error: "Service temporarily unavailable" };
  const body = JSON.stringify({ query, limit: limit ?? 10 });
  try {
    const res = await fetch(`${BASE}/lookups/${kind}`, { method: "POST", headers, body });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    const rec = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof rec.error === "string" ? rec.error : `Lookup failed (${res.status})`,
        reason: typeof rec.reason === "string" ? rec.reason : undefined,
      };
    }
    const rawRows = Array.isArray(rec.results) ? (rec.results as unknown[]) : [];
    const results: PartnerLookupRow[] = rawRows.map((r) => {
      const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      return {
        type: o.type === "airport" || o.type === "city" ? o.type : undefined,
        iata: typeof o.iata === "string" ? o.iata : undefined,
        icao: typeof o.icao === "string" ? o.icao : undefined,
        airport_name: typeof o.airport_name === "string" ? o.airport_name : undefined,
        city: typeof o.city === "string" ? o.city : undefined,
        country: typeof o.country === "string" ? o.country : undefined,
        country_code: typeof o.country_code === "string" ? o.country_code : undefined,
        latitude: typeof o.latitude === "number" ? o.latitude : undefined,
        longitude: typeof o.longitude === "number" ? o.longitude : undefined,
      };
    });
    return {
      ok: true,
      status: res.status,
      count: typeof rec.count === "number" ? rec.count : undefined,
      results,
    };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function resolveAirportCode(value: string): Promise<string> {
  const raw = value.trim();
  if (/^[a-z0-9]{3,4}$/i.test(raw)) return raw.toUpperCase();
  const lookup = await callPartnerLookup("airports", raw, 1);
  const first = lookup.results?.[0];
  return (first?.iata ?? raw).toUpperCase();
}

export async function toResolvedPartnerFlightPayload(data: {
  origin?: string;
  destination?: string;
  depart_date?: string;
  return_date?: string;
  legs?: { origin: string; destination: string; date: string; preferredTime?: string }[];
  passengers?: number;
  cabin?: string;
  trip_type?: "one_way" | "round_trip" | "multi_city";
}) {
  if (data.legs && data.legs.length > 0) {
    const legs = await Promise.all(
      data.legs.map(async (leg) => ({
        ...leg,
        origin: await resolveAirportCode(leg.origin),
        destination: await resolveAirportCode(leg.destination),
      })),
    );
    return toPartnerFlightPayload({ ...data, legs });
  }
  return toPartnerFlightPayload({
    ...data,
    origin: data.origin ? await resolveAirportCode(data.origin) : data.origin,
    destination: data.destination ? await resolveAirportCode(data.destination) : data.destination,
  });
}

export async function toResolvedPartnerPrivateJetPayload(data: {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string;
  passengers: number;
  aircraft?: string;
}) {
  return toPartnerPrivateJetPayload({
    ...data,
    origin: await resolveAirportCode(data.origin),
    destination: await resolveAirportCode(data.destination),
  });
}

export type AuthCtx = {
  userId: string;
  claims: { email?: string | null } & Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
};

export async function isAdmin(ctx: AuthCtx): Promise<boolean> {
  const admin = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (admin.data === true) return true;
  const su = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  return su.data === true;
}

export async function assertWalletOwner(ctx: AuthCtx, clientEmail: string): Promise<void> {
  const callerEmail = (ctx.claims.email ?? "").toLowerCase();
  if (callerEmail && callerEmail === clientEmail.toLowerCase()) return;
  if (await isAdmin(ctx)) return;
  throw new Error("Forbidden: wallet does not belong to the signed-in user");
}
