// Universal API Management & Product Sync Center — server-only engine.
//
// One provider-agnostic implementation performs every operation for every
// supplier: credential resolution, Test Connection, API health, Sync Now /
// Sync All / Auto Sync, full and incremental sync, product-level sync, field
// mapping, deduplication, conflict handling, retries, rate limits, pagination,
// webhooks, logs and audit trails. Supplier behaviour comes from
// `integration_providers` rows, so a new supplier is configuration only.
//
// Credentials are read from the server environment by NAME. Values never leave
// the server and are never returned to the browser. When a credential or the
// supplier's documented endpoint is unavailable the provider is recorded as
// NOT CONNECTED — connection status is never fabricated.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Admin, SupplierRecord } from "./adapters.server";
import { getAdapter, listAdapters } from "./adapters.server";
import type {
  JsonRecord,
  JsonValue,
  IntegrationAuditRow,
  IntegrationConnectionState,
  IntegrationLogRow,
  IntegrationPagination,
  IntegrationProductRow,
  IntegrationProvider,
  IntegrationRunRow,
  IntegrationSettings,
  IntegrationSyncOutcome,
  IntegrationSyncScope,
  IntegrationSyncTrigger,
  IntegrationTestResult,
} from "./types";

// ------------------------------------------------------------------ helpers
type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" ? v : fallback);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const obj = (v: unknown): Record<string, string> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 40);
}

function missingSecretsFor(names: string[]): string[] {
  return names.filter((name) => !(process.env[name] ?? "").trim());
}

// ------------------------------------------------------------------ mapping
function toProvider(row: Row, productCount = 0): IntegrationProvider {
  const secretNames = arr(row["secret_names"]);
  const missing = missingSecretsFor(secretNames);
  const providerKey = str(row["provider_key"]);
  return {
    id: str(row["id"]),
    providerKey,
    name: str(row["name"]),
    category: str(row["category"], "other"),
    summary: str(row["summary"]),
    baseUrl: str(row["base_url"]),
    authKind: str(row["auth_kind"], "none") as IntegrationProvider["authKind"],
    authHeader: (row["auth_header"] as string | null) ?? null,
    tokenPath: (row["token_path"] as string | null) ?? null,
    scope: (row["scope"] as string | null) ?? null,
    secretNames,
    endpoints: obj(row["endpoints"]),
    capabilities: arr(row["capabilities"]),
    collections: arr(row["collections"]),
    rateLimitPerSecond: num(row["rate_limit_per_second"], 5),
    cacheTtlSeconds: num(row["cache_ttl_seconds"], 900),
    maxRetries: num(row["max_retries"], 3),
    timeoutMs: num(row["timeout_ms"], 12000),
    syncStrategy: str(row["sync_strategy"], "full") as IntegrationProvider["syncStrategy"],
    pagination: (row["pagination"] ?? {}) as IntegrationPagination,
    fieldMap: obj(row["field_map"]),
    dedupeKeys: arr(row["dedupe_keys"]),
    conflictPolicy: str(
      row["conflict_policy"],
      "supplier-wins",
    ) as IntegrationProvider["conflictPolicy"],
    recordPath: (row["record_path"] as string | null) ?? null,
    enabled: row["enabled"] !== false,
    autoSyncEnabled: row["auto_sync_enabled"] === true,
    autoSyncIntervalMinutes: num(row["auto_sync_interval_minutes"], 360),
    webhookSecretName: (row["webhook_secret_name"] as string | null) ?? null,
    docsUrl: (row["docs_url"] as string | null) ?? null,
    contractStatus: str(row["contract_status"], "prospective"),
    adapter: (row["adapter"] as string | null) ?? null,
    origin: str(row["origin"], "registry") as IntegrationProvider["origin"],
    connectionState: str(
      row["connection_state"],
      "unknown",
    ) as IntegrationProvider["connectionState"],
    connectionCheckedAt: (row["connection_checked_at"] as string | null) ?? null,
    connectionDetail: (row["connection_detail"] as string | null) ?? null,
    lastSyncAt: (row["last_sync_at"] as string | null) ?? null,
    lastSyncStatus: (row["last_sync_status"] as string | null) ?? null,
    notes: (row["notes"] as string | null) ?? null,
    missingSecrets: missing,
    credentialsConfigured: secretNames.length > 0 && missing.length === 0,
    productCount,
    webhookPath: `/api/public/hooks/integration-webhook/${providerKey}`,
  };
}

// ---------------------------------------------------------------- seeding
/** Supplier records that already have a verified in-project client. */
const ADAPTER_SEEDS: Row[] = [
  {
    provider_key: "crystal-cruises",
    name: "Crystal Cruises (AKTG)",
    category: "cruise-line",
    summary: "Live AKTG Shopping/Booking API voyages plus Crystal's published World Cruises.",
    base_url: "https://api.aktravelgroup.com",
    auth_kind: "api-key-header",
    auth_header: "ApiKey",
    secret_names: ["CRYSTAL_AKTG_API_KEY"],
    endpoints: {
      catalog: "/shoppingapi/d/v1/cruises/products",
      availability: "/bookingapi/d/v1/cruises/availablesuites",
      booking: "/bookingapi/v1/Bookings",
    },
    capabilities: ["catalog", "availability", "pricing", "booking", "cancellation"],
    collections: ["cruises", "world-cruises"],
    sync_strategy: "full",
    contract_status: "signed",
    adapter: "crystal-aktg",
    auto_sync_enabled: true,
    auto_sync_interval_minutes: 180,
  },
  {
    provider_key: "ttc",
    name: "The Travel Corporation",
    category: "luxury-tour-operator",
    summary: "Luxury Gold, Insight, Trafalgar, Costsaver, Contiki and Uniworld catalogues.",
    base_url: "https://api.ttc.com/v4",
    auth_kind: "bearer-token",
    secret_names: ["TTC_API_TOKEN"],
    endpoints: { catalog: "/tours" },
    capabilities: ["catalog", "media", "incremental-sync"],
    collections: ["tours"],
    sync_strategy: "index",
    contract_status: "in-negotiation",
    adapter: "ttc",
  },
  {
    provider_key: "hbx-hotels",
    name: "HBX Group — Hotels",
    category: "bedbank",
    summary: "Hotelbeds hotel content, availability and booking suite.",
    base_url: "https://api.test.hotelbeds.com",
    auth_kind: "signed-session",
    auth_header: "Api-key",
    secret_names: ["HBX_HOTEL_API_KEY", "HBX_HOTEL_SECRET"],
    endpoints: { catalog: "/hotel-content-api/1.0/hotels", health: "/hotel-api/1.0/status" },
    capabilities: ["catalog", "availability", "pricing", "booking", "cancellation"],
    collections: ["hotels"],
    sync_strategy: "index",
    contract_status: "signed",
    adapter: "hbx-hotels",
  },
  {
    provider_key: "hbx-activities",
    name: "HBX Group — Activities",
    category: "experiences",
    summary: "Hotelbeds activity content and booking suite.",
    base_url: "https://api.test.hotelbeds.com",
    auth_kind: "signed-session",
    auth_header: "Api-key",
    secret_names: ["HBX_ACTIVITY_API_KEY", "HBX_ACTIVITY_SECRET"],
    endpoints: { catalog: "/activity-content-api/3.0/activities" },
    capabilities: ["catalog", "availability", "pricing", "booking"],
    collections: ["activities"],
    sync_strategy: "index",
    contract_status: "signed",
    adapter: "hbx-activities",
  },
  {
    provider_key: "hbx-transfers",
    name: "HBX Group — Transfers",
    category: "experiences",
    summary: "Hotelbeds transfer routes; supplier entitlement pending.",
    base_url: "https://api.test.hotelbeds.com",
    auth_kind: "signed-session",
    auth_header: "Api-key",
    secret_names: ["HBX_TRANSFER_API_KEY", "HBX_TRANSFER_SECRET"],
    endpoints: { catalog: "/transfer-cache-api/1.0/routes" },
    capabilities: ["catalog"],
    collections: ["transfers"],
    sync_strategy: "index",
    contract_status: "in-negotiation",
    adapter: "hbx-transfers",
  },
  {
    provider_key: "ratehawk",
    name: "RateHawk (Emerging Travel Group)",
    category: "bedbank",
    summary:
      "ETG API v3 hotels: search, hotelpage rates, prebook, booking, status, order info and cancellation. Sandbox-first; live-search supplier with no static catalogue sync.",
    base_url: "https://api-sandbox.ratehawk.com",
    auth_kind: "basic",
    secret_names: ["RATEHAWK_KEY_ID", "RATEHAWK_API_KEY"],
    endpoints: {
      health: "/api/b2b/v3/general/contract/data/info/",
      catalog: "/api/b2b/v3/search/serp/region/",
      availability: "/api/b2b/v3/search/hp/",
      prebook: "/api/b2b/v3/hotel/prebook/",
      booking: "/api/b2b/v3/hotel/order/booking/finish/",
      cancellation: "/api/b2b/v3/hotel/order/cancel/",
    },
    capabilities: ["availability", "pricing", "prebook", "booking", "cancellation"],
    collections: ["hotels"],
    sync_strategy: "index",
    contract_status: "in-negotiation",
    adapter: "ratehawk",
    docs_url: "https://docs.emergingtravel.com/docs/affiliate-api/",
  },
  {
    provider_key: "g-adventures",
    name: "G Adventures",
    category: "adventure-operator",
    summary: "Live small-group tour catalogue, departures and reservations.",
    base_url: "https://rest.gadventures.com",
    auth_kind: "api-key-header",
    auth_header: "X-Application-Key",
    secret_names: ["TOURS_API_KEY"],
    endpoints: { catalog: "/dossiers/tour", availability: "/departures" },
    capabilities: ["catalog", "availability", "pricing", "booking", "cancellation", "amendment"],
    collections: ["tours", "small-group"],
    sync_strategy: "full",
    contract_status: "signed",
    adapter: "g-adventures",
    auto_sync_enabled: true,
    auto_sync_interval_minutes: 720,
  },
  {
    provider_key: "viator",
    name: "Viator",
    category: "experiences",
    summary: "Activities and excursions with hosted-payment checkout.",
    base_url: "https://api.viator.com/partner",
    auth_kind: "api-key-header",
    auth_header: "exp-api-key",
    secret_names: ["VIATOR_API_KEY"],
    endpoints: { catalog: "/products/search", availability: "/availability/check" },
    capabilities: ["catalog", "availability", "pricing", "booking"],
    collections: ["activities"],
    sync_strategy: "full",
    contract_status: "signed",
    adapter: "viator",
  },
  {
    provider_key: "abercrombie-kent",
    name: "Abercrombie & Kent",
    category: "luxury-tour-operator",
    summary: "All Journeys catalogue — imported source data until API credentials are issued.",
    base_url: "https://api.abercrombiekent.com/v1",
    auth_kind: "oauth2-client-credentials",
    token_path: "/oauth/token",
    secret_names: ["AK_CLIENT_ID", "AK_CLIENT_SECRET"],
    endpoints: { catalog: "/journeys", health: "/status" },
    capabilities: ["catalog", "availability", "pricing", "media"],
    collections: ["journeys", "all-journeys"],
    sync_strategy: "index",
    contract_status: "in-negotiation",
    adapter: "ak-all-journeys",
  },
  {
    provider_key: "cruisea",
    name: "Cruisea",
    category: "cruise-line",
    summary: "Native Worldway cruise inventory with hold, confirm and cancel.",
    base_url: "",
    auth_kind: "none",
    secret_names: [],
    endpoints: {},
    capabilities: ["catalog", "availability", "booking", "cancellation"],
    collections: ["voyages"],
    sync_strategy: "index",
    contract_status: "signed",
    adapter: "cruisea",
    auto_sync_enabled: true,
    auto_sync_interval_minutes: 360,
  },
];

/** Seeds provider rows once. Existing rows are never overwritten. */
export async function ensureProvidersSeeded(): Promise<void> {
  const db = await admin();
  const { data } = await db.from("integration_providers").select("provider_key");
  const known = new Set((data ?? []).map((r) => (r as Row)["provider_key"] as string));

  const { MANIFEST_SEEDS } = await import("./manifest.server");
  const inserts: Row[] = [...ADAPTER_SEEDS, ...MANIFEST_SEEDS].filter(
    (s) => !known.has(s["provider_key"] as string),
  );

  // Registry-configured suppliers that have no bespoke client yet: the generic
  // HTTP engine drives them from their documented configuration.
  const { PARTNER_CONNECTORS } = await import("@/lib/partners/registry");
  for (const cfg of PARTNER_CONNECTORS) {
    if (known.has(cfg.id) || inserts.some((i) => i["provider_key"] === cfg.id)) continue;
    inserts.push({
      provider_key: cfg.id,
      name: cfg.name,
      category: cfg.category,
      summary: cfg.summary,
      base_url: cfg.baseUrl,
      auth_kind: cfg.auth.kind,
      auth_header: cfg.auth.header ?? null,
      token_path: cfg.auth.tokenPath ?? null,
      scope: cfg.auth.scope ?? null,
      secret_names: cfg.auth.secrets,
      endpoints: cfg.endpoints as unknown as Row,
      capabilities: cfg.capabilities,
      collections: cfg.collections,
      rate_limit_per_second: cfg.rateLimitPerSecond,
      cache_ttl_seconds: cfg.cacheTtlSeconds,
      max_retries: cfg.maxRetries,
      timeout_ms: cfg.timeoutMs,
      sync_strategy: cfg.syncStrategy,
      field_map: (cfg.feed?.fieldMap ?? {}) as unknown as Row,
      record_path: cfg.feed?.recordPath ?? null,
      webhook_secret_name: cfg.feed?.webhookSecret ?? null,
      contract_status: cfg.contractStatus,
      docs_url: cfg.docsUrl ?? null,
      origin: "registry",
    });
  }

  if (inserts.length === 0) return;
  const { error } = await db
    .from("integration_providers")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(inserts as any, { onConflict: "provider_key", ignoreDuplicates: true });
  if (error) console.error("[integrations] provider seeding failed:", error.message);
}

// ----------------------------------------------------------------- logging
export async function logIntegration(entry: {
  providerKey: string;
  operation: string;
  status: string;
  level?: string;
  runId?: string | null;
  httpStatus?: number | null;
  latencyMs?: number | null;
  attempts?: number | null;
  message?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const db = await admin();
  await db.from("integration_logs").insert({
    provider_key: entry.providerKey,
    run_id: entry.runId ?? null,
    level: entry.level ?? (entry.status === "error" ? "error" : "info"),
    operation: entry.operation,
    status: entry.status,
    http_status: entry.httpStatus ?? null,
    latency_ms: entry.latencyMs ?? null,
    attempts: entry.attempts ?? null,
    message: entry.message ?? null,
    detail: sanitize(entry.detail ?? {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const SECRET_HINT = /(key|secret|token|password|authorization|apikey|credential)/i;

/** Reduces any supplier value to plain JSON so it is safe to store and return. */
function toJson(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (depth > 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => toJson(v, depth + 1));
  if (typeof value === "object") return sanitize(value, depth);
  return null;
}

/** Strips anything that looks like a credential before it is persisted. */
export function sanitize(value: unknown, depth = 0): JsonRecord {
  if (depth > 4 || !value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: JsonRecord = {};
  for (const [k, v] of Object.entries(value as Row)) {
    if (SECRET_HINT.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = toJson(v, depth + 1);
  }
  return out;
}

export async function recordAudit(entry: {
  actor?: string | null;
  actorEmail?: string | null;
  action: string;
  providerKey?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const db = await admin();
  await db.from("integration_audit").insert({
    actor: entry.actor ?? null,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    provider_key: entry.providerKey ?? null,
    detail: sanitize(entry.detail ?? {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// ------------------------------------------------------------------ reads
export async function getSettings(): Promise<IntegrationSettings> {
  const db = await admin();
  const { data } = await db.from("integration_settings").select("*").eq("id", true).maybeSingle();
  const row = (data ?? {}) as Row;
  return {
    globalEnabled: row["global_enabled"] !== false,
    globalAutoSync: row["global_auto_sync"] === true,
    maintenancePaused: row["maintenance_paused"] === true,
    updatedAt: str(row["updated_at"], new Date().toISOString()),
  };
}

export async function updateSettings(
  patch: Partial<Pick<IntegrationSettings, "globalEnabled" | "globalAutoSync" | "maintenancePaused">>,
  actor: { id?: string | null; email?: string | null },
): Promise<IntegrationSettings> {
  const db = await admin();
  const update: Row = { updated_at: new Date().toISOString(), updated_by: actor.id ?? null };
  if (patch.globalEnabled !== undefined) update["global_enabled"] = patch.globalEnabled;
  if (patch.globalAutoSync !== undefined) update["global_auto_sync"] = patch.globalAutoSync;
  if (patch.maintenancePaused !== undefined) update["maintenance_paused"] = patch.maintenancePaused;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.from("integration_settings").update(update as any).eq("id", true);
  await recordAudit({
    actor: actor.id ?? null,
    actorEmail: actor.email ?? null,
    action: "settings.update",
    detail: patch as Record<string, unknown>,
  });
  return getSettings();
}

export async function listProviders(): Promise<IntegrationProvider[]> {
  await ensureProvidersSeeded();
  const db = await admin();
  const [{ data: rows }, { data: counts }] = await Promise.all([
    db.from("integration_providers").select("*").order("name"),
    db.from("integration_products").select("provider_key"),
  ]);
  const tally = new Map<string, number>();
  for (const c of counts ?? []) {
    const key = (c as Row)["provider_key"] as string;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return (rows ?? []).map((r) => toProvider(r as Row, tally.get((r as Row)["provider_key"] as string) ?? 0));
}

async function productCountFor(providerKey: string): Promise<number> {
  const db = await admin();
  const { count } = await db
    .from("integration_products")
    .select("id", { count: "exact", head: true })
    .eq("provider_key", providerKey);
  return count ?? 0;
}

export async function getProvider(providerKey: string): Promise<IntegrationProvider | null> {
  const db = await admin();
  const { data } = await db
    .from("integration_providers")
    .select("*")
    .eq("provider_key", providerKey)
    .maybeSingle();
  if (!data) return null;
  return toProvider(data as Row, await productCountFor(providerKey));
}

export async function upsertProvider(
  input: Row & { provider_key: string; name: string },
  actor: { id?: string | null; email?: string | null },
): Promise<IntegrationProvider> {
  const db = await admin();
  // Operator-supplied base URLs are validated before they can ever be fetched.
  const baseUrl = typeof input["base_url"] === "string" ? input["base_url"].trim() : "";
  if (baseUrl) assertSafeSupplierUrl(baseUrl);
  const payload: Row = { ...input, created_by: input["created_by"] ?? actor.id ?? null };
  const { data, error } = await db
    .from("integration_providers")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any, { onConflict: "provider_key" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await recordAudit({
    actor: actor.id ?? null,
    actorEmail: actor.email ?? null,
    action: "provider.save",
    providerKey: input.provider_key,
    detail: { name: input.name, origin: input["origin"] ?? "custom" },
  });
  return toProvider(data as Row, await productCountFor(input.provider_key));
}


export async function setProviderFlags(
  providerKey: string,
  flags: { enabled?: boolean; autoSyncEnabled?: boolean; autoSyncIntervalMinutes?: number },
  actor: { id?: string | null; email?: string | null },
): Promise<IntegrationProvider | null> {
  const db = await admin();
  const update: Row = {};
  if (flags.enabled !== undefined) update["enabled"] = flags.enabled;
  if (flags.autoSyncEnabled !== undefined) update["auto_sync_enabled"] = flags.autoSyncEnabled;
  if (flags.autoSyncIntervalMinutes !== undefined)
    update["auto_sync_interval_minutes"] = Math.max(10, flags.autoSyncIntervalMinutes);
  if (Object.keys(update).length === 0) return getProvider(providerKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.from("integration_providers").update(update as any).eq("provider_key", providerKey);
  await recordAudit({
    actor: actor.id ?? null,
    actorEmail: actor.email ?? null,
    action: "provider.flags",
    providerKey,
    detail: flags as Record<string, unknown>,
  });
  return getProvider(providerKey);
}

// ------------------------------------------------------- generic HTTP client
const buckets = new Map<string, { tokens: number; last: number }>();

async function takeToken(provider: IntegrationProvider): Promise<void> {
  const rate = Math.max(1, provider.rateLimitPerSecond);
  const now = Date.now();
  const b = buckets.get(provider.providerKey) ?? { tokens: rate, last: now };
  b.tokens = Math.min(rate, b.tokens + ((now - b.last) / 1000) * rate);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(provider.providerKey, b);
    await new Promise((r) => setTimeout(r, Math.ceil(1000 / rate)));
    return takeToken(provider);
  }
  b.tokens -= 1;
  buckets.set(provider.providerKey, b);
}

const tokenCache = new Map<string, { token: string; expires: number }>();

/**
 * SSRF defence: supplier base URLs and endpoint paths are operator-supplied, so
 * every outbound integration call must resolve to a public HTTPS host. Private,
 * loopback, link-local and metadata addresses are refused before the fetch.
 */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

export function assertSafeSupplierUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Supplier URL is not a valid absolute URL.");
  }
  if (url.protocol !== "https:") throw new Error("Supplier URLs must use HTTPS.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("Supplier host is not publicly routable.");
  }
  // IPv4 literals in private / loopback / link-local / CGNAT ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const priv =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127);
    if (priv) throw new Error("Supplier host resolves to a private address.");
  }
  // IPv6 loopback / unique-local / link-local literals.
  if (host.includes(":") && /^(::1|fc|fd|fe8|fe9|fea|feb)/i.test(host)) {
    throw new Error("Supplier host resolves to a private address.");
  }
  return url;
}

async function oauthToken(provider: IntegrationProvider): Promise<string | null> {
  if (provider.authKind !== "oauth2-client-credentials" || !provider.tokenPath) return null;

  const hit = tokenCache.get(provider.providerKey);
  if (hit && hit.expires > Date.now()) return hit.token;
  const [idName, secretName] = provider.secretNames;
  const clientId = idName ? process.env[idName] : undefined;
  const clientSecret = secretName ? process.env[secretName] : undefined;
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (provider.scope) body.set("scope", provider.scope);
  const tokenUrl = assertSafeSupplierUrl(`${provider.baseUrl}${provider.tokenPath}`);
  const res = await fetch(tokenUrl.toString(), {

    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  tokenCache.set(provider.providerKey, {
    token: json.access_token,
    expires: Date.now() + (json.expires_in ?? 1800) * 1000 - 30_000,
  });
  return json.access_token;
}

function authHeaders(provider: IntegrationProvider): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const [aName, bName] = provider.secretNames;
  const a = aName ? (process.env[aName] ?? "") : "";
  const b = bName ? (process.env[bName] ?? "") : "";
  switch (provider.authKind) {
    case "api-key-header":
    case "signed-session":
      if (provider.authHeader && a) h[provider.authHeader] = a;
      break;
    case "bearer-token":
      if (a) h["Authorization"] = `Bearer ${a}`;
      break;
    case "basic":
      if (a) h["Authorization"] = `Basic ${Buffer.from(`${a}:${b}`).toString("base64")}`;
      break;
    case "header-pair":
      if (a) h["Username"] = a;
      if (b) h["Password"] = b;
      break;
    default:
      break;
  }
  return h;
}

export interface ProviderRequestResult {
  ok: boolean;
  status: number;
  attempts: number;
  latencyMs: number;
  body: unknown;
  error?: string;
}

export async function providerRequest(
  provider: IntegrationProvider,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<ProviderRequestResult> {
  const started = Date.now();
  const attemptsAllowed = Math.max(1, provider.maxRetries);
  let attempts = 0;
  let lastStatus = 0;
  let lastError = "";
  let retryDelayMs: number | null = null;


  let url: URL;
  try {
    url = assertSafeSupplierUrl(path.startsWith("http") ? path : `${provider.baseUrl}${path}`);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      attempts: 0,
      latencyMs: 0,
      body: null,
      error: err instanceof Error ? err.message : "Unsafe supplier URL.",
    };
  }

  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  while (attempts < attemptsAllowed) {
    attempts += 1;
    await takeToken(provider);
    const headers = authHeaders(provider);
    if (provider.authKind === "oauth2-client-credentials") {
      const token = await oauthToken(provider);
      if (!token)
        return {
          ok: false,
          status: 401,
          attempts,
          latencyMs: Date.now() - started,
          body: null,
          error: "OAuth token unavailable",
        };
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: init.method ?? "GET",
        headers,
        signal: controller.signal,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      clearTimeout(timer);
      lastStatus = res.status;
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON supplier response is surfaced verbatim */
      }
      if (res.ok)
        return { ok: true, status: res.status, attempts, latencyMs: Date.now() - started, body };
      // Retry only transient supplier failures.
      if (res.status < 500 && res.status !== 429)
        return {
          ok: false,
          status: res.status,
          attempts,
          latencyMs: Date.now() - started,
          body,
          error: typeof body === "string" ? body.slice(0, 400) : `HTTP ${res.status}`,
        };
      lastError = `HTTP ${res.status}`;
      // Honour the supplier's own throttling instruction when present.
      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        retryDelayMs = Math.min(30_000, Math.ceil(retryAfter * 1000));
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err.message : "request failed";
    }
    // Exponential backoff with jitter so retries never align across providers.
    const backoff = retryDelayMs ?? Math.min(8_000, 250 * 2 ** (attempts - 1));
    retryDelayMs = null;
    await new Promise((r) => setTimeout(r, backoff + Math.floor(Math.random() * 250)));
  }

  return {
    ok: false,
    status: lastStatus,
    attempts,
    latencyMs: Date.now() - started,
    body: null,
    error: lastError || "supplier unreachable",
  };
}

// -------------------------------------------------------- test connection
export async function testConnection(
  providerKey: string,
  actor: { id?: string | null; email?: string | null } = {},
): Promise<IntegrationTestResult> {
  const provider = await getProvider(providerKey);
  const checkedAt = new Date().toISOString();
  if (!provider)
    return {
      providerKey,
      state: "not-connected",
      httpStatus: null,
      latencyMs: null,
      attempts: 0,
      detail: "Unknown supplier.",
      checkedAt,
    };

  let state: IntegrationConnectionState = "not-connected";
  let detail = "";
  let httpStatus: number | null = null;
  let latencyMs: number | null = null;
  let attempts = 0;

  if (provider.missingSecrets.length > 0) {
    state = "credentials-missing";
    detail = `Awaiting credentials: ${provider.missingSecrets.join(", ")}.`;
  } else {
    const adapter = getAdapter(provider.adapter);
    if (adapter) {
      const started = Date.now();
      try {
        const probe = await adapter.probe();
        attempts = 1;
        httpStatus = probe.status;
        latencyMs = Date.now() - started;
        state = probe.ok ? "connected" : "not-connected";
        detail = probe.detail;
      } catch (err) {
        state = "error";
        detail = err instanceof Error ? err.message : "probe failed";
        latencyMs = Date.now() - started;
      }
    } else {
      const path = provider.endpoints["health"] ?? provider.endpoints["catalog"];
      if (!path || !provider.baseUrl) {
        state = "not-connected";
        detail = "No documented health or catalogue endpoint is configured for this supplier.";
      } else {
        const res = await providerRequest(provider, path);
        httpStatus = res.status || null;
        latencyMs = res.latencyMs;
        attempts = res.attempts;
        state = res.ok ? "connected" : res.status >= 400 ? "not-connected" : "error";
        detail = res.ok
          ? `Supplier responded HTTP ${res.status}.`
          : (res.error ?? `Supplier returned HTTP ${res.status}.`);
      }
    }
  }

  const db = await admin();
  await db
    .from("integration_providers")
    .update({
      connection_state: state,
      connection_checked_at: checkedAt,
      connection_detail: detail.slice(0, 500),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("provider_key", providerKey);

  await logIntegration({
    providerKey,
    operation: "test-connection",
    status: state === "connected" ? "ok" : "error",
    httpStatus,
    latencyMs,
    attempts,
    message: detail,
  });
  await recordAudit({
    actor: actor.id ?? null,
    actorEmail: actor.email ?? null,
    action: "provider.test-connection",
    providerKey,
    detail: { state },
  });

  return { providerKey, state, httpStatus, latencyMs, attempts, detail, checkedAt };
}

export async function healthAll(): Promise<IntegrationTestResult[]> {
  const providers = await listProviders();
  const out: IntegrationTestResult[] = [];
  for (const p of providers) {
    if (!p.enabled) {
      out.push({
        providerKey: p.providerKey,
        state: "not-connected",
        httpStatus: null,
        latencyMs: null,
        attempts: 0,
        detail: "Supplier disabled by an administrator.",
        checkedAt: new Date().toISOString(),
      });
      continue;
    }
    out.push(await testConnection(p.providerKey));
  }
  return out;
}

// ----------------------------------------------------- generic catalogue read
function readPath(source: unknown, path: string | null): unknown {
  if (!path) return source;
  let cur: unknown = source;
  for (const part of path.split(".")) {
    if (Array.isArray(cur)) return cur;
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Row)[part];
  }
  return cur;
}

function mapField(row: Row, map: Record<string, string>, target: string): unknown {
  for (const [source, dest] of Object.entries(map)) if (dest === target) return row[source];
  return undefined;
}

/** Generic, configuration-driven catalogue fetch with documented pagination. */
async function fetchGenericCatalogue(
  provider: IntegrationProvider,
  runId: string,
): Promise<{ records: SupplierRecord[]; warnings: string[] }> {
  const path = provider.endpoints["catalog"];
  const warnings: string[] = [];
  if (!path || !provider.baseUrl) {
    return {
      records: [],
      warnings: ["No documented catalogue endpoint configured — connector is ready but idle."],
    };
  }
  const pag = provider.pagination ?? {};
  const mode = pag.mode ?? "none";
  const size = pag.size ?? 100;
  const maxPages = Math.max(1, pag.maxPages ?? 10);
  const records: SupplierRecord[] = [];
  let cursor: string | null = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const query: Record<string, string> = {};
    if (mode === "page") {
      query[pag.pageParam ?? "page"] = String(page);
      query[pag.sizeParam ?? "limit"] = String(size);
    } else if (mode === "offset") {
      query[pag.pageParam ?? "offset"] = String((page - 1) * size);
      query[pag.sizeParam ?? "limit"] = String(size);
    } else if (mode === "cursor" && cursor) {
      query[pag.cursorParam ?? "cursor"] = cursor;
    }
    const res = await providerRequest(provider, path, { query });
    await logIntegration({
      providerKey: provider.providerKey,
      runId,
      operation: `catalog page ${page}`,
      status: res.ok ? "ok" : "error",
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      attempts: res.attempts,
      message: res.error ?? null,
    });
    if (!res.ok) {
      warnings.push(res.error ?? `Supplier returned HTTP ${res.status}.`);
      break;
    }
    const payload = readPath(res.body, provider.recordPath);
    const list = Array.isArray(payload) ? payload : [];
    for (const raw of list) {
      const row = (raw ?? {}) as Row;
      const externalId = String(
        mapField(row, provider.fieldMap, "code") ?? row["id"] ?? row["code"] ?? "",
      );
      if (!externalId) continue;
      records.push({
        externalId,
        title: String(mapField(row, provider.fieldMap, "title") ?? row["name"] ?? externalId),
        slug: externalId,
        productType: provider.collections[0] ?? "product",
        priceFrom: Number(mapField(row, provider.fieldMap, "priceFrom") ?? row["price"] ?? 0) || null,
        currency: (mapField(row, provider.fieldMap, "currency") as string) ?? null,
        availabilityState: null,
        detailPath: null,
        sourceTable: null,
        raw: row,
      });
    }
    if (mode === "none" || list.length === 0) break;
    if (mode === "cursor") {
      const next = readPath(res.body, pag.cursorPath ?? "nextCursor");
      cursor = typeof next === "string" && next ? next : null;
      if (!cursor) break;
    }
  }
  return { records, warnings };
}

// ------------------------------------------------------------------- sync
export async function syncProvider(options: {
  providerKey: string;
  scope?: IntegrationSyncScope;
  trigger?: IntegrationSyncTrigger;
  externalId?: string;
  limit?: number;
  actor?: { id?: string | null; email?: string | null };
  idempotencyKey?: string;
}): Promise<IntegrationSyncOutcome> {
  const scope = options.scope ?? "full";
  const trigger = options.trigger ?? "manual";
  const db = await admin();
  const settings = await getSettings();
  const provider = await getProvider(options.providerKey);

  const skipped = (message: string): IntegrationSyncOutcome => ({
    providerKey: options.providerKey,
    runId: null,
    scope,
    status: "skipped",
    discovered: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    durationMs: 0,
    message,
  });

  if (!provider) return skipped("Unknown supplier.");
  if (!settings.globalEnabled) return skipped("Global integration master switch is off.");
  if (settings.maintenancePaused) return skipped("Sync is paused for maintenance.");
  if (!provider.enabled) return skipped("Supplier is disabled.");

  // Duplicate-run protection: the unique idempotency key rejects replays.
  const idempotencyKey =
    options.idempotencyKey ??
    `${provider.providerKey}:${scope}:${options.externalId ?? "all"}:${Math.floor(Date.now() / 60000)}`;
  const { data: runRow, error: runError } = await db
    .from("integration_sync_runs")
    .insert({
      provider_key: provider.providerKey,
      scope,
      trigger,
      status: "running",
      external_id: options.externalId ?? null,
      idempotency_key: idempotencyKey,
      initiated_by: options.actor?.id ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id")
    .single();
  if (runError || !runRow) return skipped("An identical sync is already in progress.");
  const runId = (runRow as Row)["id"] as string;
  const startedAt = Date.now();

  let discovered = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const warnings: string[] = [];
  let status: IntegrationSyncOutcome["status"] = "success";

  try {
    const adapter = getAdapter(provider.adapter);
    let records: SupplierRecord[] = [];
    if (adapter) {
      if (scope === "product" && options.externalId && adapter.fetchOne) {
        const one = await adapter.fetchOne(db, options.externalId);
        records = one ? [one] : [];
        if (!one) warnings.push("Supplier no longer publishes this product.");
      } else {
        const res = await adapter.fetchAll(db, { limit: options.limit ?? 2000 });
        records = res.records;
        warnings.push(...res.warnings);
        if (scope === "product" && options.externalId)
          records = records.filter((r) => r.externalId === options.externalId);
      }
    } else {
      const res = await fetchGenericCatalogue(provider, runId);
      records = res.records;
      warnings.push(...res.warnings);
      if (scope === "product" && options.externalId)
        records = records.filter((r) => r.externalId === options.externalId);
    }

    // Deduplicate on the configured keys (default: external id).
    const seen = new Set<string>();
    const deduped: SupplierRecord[] = [];
    for (const rec of records) {
      const key = provider.dedupeKeys
        .map((k) =>
          k === "external_id"
            ? rec.externalId
            : String((rec.raw as Row)[k] ?? (rec as unknown as Row)[k] ?? ""),
        )
        .join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(rec);
    }
    discovered = deduped.length;

    const { data: existingRows } = await db
      .from("integration_products")
      .select("external_id, fingerprint")
      .eq("provider_key", provider.providerKey);
    const existing = new Map<string, string | null>(
      (existingRows ?? []).map((r) => [
        (r as Row)["external_id"] as string,
        ((r as Row)["fingerprint"] as string | null) ?? null,
      ]),
    );

    const now = new Date().toISOString();
    const upserts: Row[] = [];
    for (const rec of deduped) {
      const fp = fingerprint(rec.raw);
      const prev = existing.get(rec.externalId);
      if (prev === fp) {
        if (scope === "incremental") {
          unchanged += 1;
          continue;
        }
        unchanged += 1;
      } else if (prev === undefined) created += 1;
      else if (provider.conflictPolicy === "local-wins") {
        unchanged += 1;
        continue;
      } else updated += 1;

      upserts.push({
        provider_key: provider.providerKey,
        external_id: rec.externalId,
        product_type: rec.productType,
        slug: rec.slug ?? null,
        title: rec.title,
        source_table: rec.sourceTable ?? null,
        detail_path: rec.detailPath ?? null,
        sync_status: "synced",
        last_synced_at: now,
        fingerprint: fp,
        price_from: rec.priceFrom ?? null,
        currency: rec.currency ?? null,
        availability_state: rec.availabilityState ?? null,
        conflict_state:
          prev !== undefined && prev !== fp && provider.conflictPolicy === "manual-review"
            ? "review"
            : "none",
        supplier_record: sanitize(rec.raw),
        last_error: null,
      });
    }

    for (let i = 0; i < upserts.length; i += 200) {
      const chunk = upserts.slice(i, i + 200);
      const { error } = await db
        .from("integration_products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(chunk as any, { onConflict: "provider_key,external_id" });
      if (error) {
        failed += chunk.length;
        warnings.push(error.message);
      }
    }

    // A completed full sync flags records the supplier no longer publishes.
    if (scope === "full" && discovered > 0) {
      const live = new Set(deduped.map((r) => r.externalId));
      const stale = [...existing.keys()].filter((id) => !live.has(id));
      for (let i = 0; i < stale.length; i += 200) {
        await db
          .from("integration_products")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ sync_status: "stale" } as any)
          .eq("provider_key", provider.providerKey)
          .in("external_id", stale.slice(i, i + 200));
      }
    }

    if (failed > 0) status = "partial";
    if (discovered === 0 && warnings.length > 0) status = "partial";
  } catch (err) {
    status = "failed";
    warnings.push(err instanceof Error ? err.message : "sync failed");
  }

  const durationMs = Date.now() - startedAt;
  const message = warnings.slice(0, 3).join(" ") || "Sync completed.";
  await db
    .from("integration_sync_runs")
    .update({
      status,
      discovered,
      created_count: created,
      updated_count: updated,
      unchanged_count: unchanged,
      failed_count: failed,
      error: status === "success" ? null : message.slice(0, 800),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("id", runId);
  await db
    .from("integration_providers")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("provider_key", provider.providerKey);
  await logIntegration({
    providerKey: provider.providerKey,
    runId,
    operation: `sync:${scope}`,
    status: status === "success" ? "ok" : status === "failed" ? "error" : "warn",
    latencyMs: durationMs,
    message,
    detail: { discovered, created, updated, unchanged, failed, trigger },
  });
  await recordAudit({
    actor: options.actor?.id ?? null,
    actorEmail: options.actor?.email ?? null,
    action: `sync.${scope}`,
    providerKey: provider.providerKey,
    detail: { status, discovered, created, updated, trigger },
  });

  return {
    providerKey: provider.providerKey,
    runId,
    scope,
    status,
    discovered,
    created,
    updated,
    unchanged,
    failed,
    durationMs,
    message,
  };
}

export async function syncAllProviders(options: {
  trigger?: IntegrationSyncTrigger;
  scope?: IntegrationSyncScope;
  actor?: { id?: string | null; email?: string | null };
  onlyDue?: boolean;
}): Promise<IntegrationSyncOutcome[]> {
  const providers = await listProviders();
  const settings = await getSettings();
  const out: IntegrationSyncOutcome[] = [];
  for (const p of providers) {
    if (!p.enabled) continue;
    if (options.onlyDue) {
      if (!settings.globalAutoSync || !p.autoSyncEnabled) continue;
      const last = p.lastSyncAt ? new Date(p.lastSyncAt).getTime() : 0;
      if (Date.now() - last < p.autoSyncIntervalMinutes * 60_000) continue;
    }
    // Providers are synced sequentially and staggered so a batch never bursts
    // several suppliers' rate limits at the same moment. One supplier failing
    // never aborts the batch.
    if (out.length > 0) await new Promise((r) => setTimeout(r, 750));
    try {
      out.push(
        await syncProvider({
          providerKey: p.providerKey,
          scope: options.scope ?? "incremental",
          ...(options.trigger ? { trigger: options.trigger } : {}),
          ...(options.actor ? { actor: options.actor } : {}),
        }),
      );
    } catch (err) {
      await logIntegration({
        providerKey: p.providerKey,
        operation: "sync",
        status: "error",
        message: err instanceof Error ? err.message.slice(0, 400) : "sync failed",
      });
    }
  }

  return out;
}

// ----------------------------------------------------------------- products
export async function listProducts(filter: {
  providerKey?: string;
  query?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: IntegrationProductRow[]; total: number }> {
  const db = await admin();
  const providers = await listProviders();
  const names = new Map(providers.map((p) => [p.providerKey, p.name]));
  let q = db
    .from("integration_products")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });
  if (filter.providerKey) q = q.eq("provider_key", filter.providerKey);
  if (filter.status) q = q.eq("sync_status", filter.status);
  if (filter.query?.trim()) {
    const term = filter.query.trim().replace(/[%,]/g, " ");
    q = q.or(`title.ilike.%${term}%,external_id.ilike.%${term}%,slug.ilike.%${term}%`);
  }
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
  const offset = Math.max(0, filter.offset ?? 0);
  const { data, count, error } = await q.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return {
    total: count ?? 0,
    rows: (data ?? []).map((r) => {
      const row = r as Row;
      const key = str(row["provider_key"]);
      return {
        id: str(row["id"]),
        providerKey: key,
        providerName: names.get(key) ?? key,
        externalId: str(row["external_id"]),
        productType: str(row["product_type"]),
        slug: (row["slug"] as string | null) ?? null,
        title: str(row["title"]),
        sourceTable: (row["source_table"] as string | null) ?? null,
        detailPath: (row["detail_path"] as string | null) ?? null,
        syncStatus: str(row["sync_status"]),
        lastSyncedAt: (row["last_synced_at"] as string | null) ?? null,
        priceFrom: (row["price_from"] as number | null) ?? null,
        currency: (row["currency"] as string | null) ?? null,
        availabilityState: (row["availability_state"] as string | null) ?? null,
        conflictState: str(row["conflict_state"], "none"),
        lastError: (row["last_error"] as string | null) ?? null,
      };
    }),
  };
}

export async function productApiData(
  providerKey: string,
  externalId: string,
): Promise<{
  product: IntegrationProductRow | null;
  supplierRecord: JsonRecord;
  logs: IntegrationLogRow[];
}> {
  const db = await admin();
  const { data } = await db
    .from("integration_products")
    .select("*")
    .eq("provider_key", providerKey)
    .eq("external_id", externalId)
    .maybeSingle();
  const { rows } = await listProducts({ providerKey, query: externalId, limit: 1 });
  // Prefer log lines that mention this product; fall back to recent provider logs
  // so the dialog is never empty for a product that has not been synced alone.
  const providerLogs = await listLogs({ providerKey, limit: 60 });
  const scoped = providerLogs.filter((l) => JSON.stringify(l).includes(externalId));
  return {
    product: rows[0] ?? null,
    supplierRecord: sanitize(((data ?? {}) as Row)["supplier_record"]),
    logs: (scoped.length > 0 ? scoped : providerLogs).slice(0, 10),
  };
}

/**
 * Manual conflict resolution: a product whose supplier fingerprint changed under
 * a manual-review policy is parked in `conflict_state = "review"`. Staff either
 * accept the supplier record (keep) or request a fresh pull (resync).
 */
export async function resolveProductConflict(
  providerKey: string,
  externalId: string,
  resolution: "accept-supplier" | "resync",
  actor: { id?: string | null; email?: string | null } = {},
): Promise<{ ok: boolean; detail: string }> {
  const db = await admin();
  if (resolution === "resync") {
    const run = await syncProvider({ providerKey, scope: "product", externalId, actor });
    await recordAudit({
      ...actor,
      action: "product.conflict.resync",
      providerKey,
      detail: { externalId, runStatus: run.status },
    });
    return { ok: run.status === "success", detail: `Re-pulled from supplier (${run.status}).` };
  }
  await db
    .from("integration_products")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ conflict_state: "none", last_error: null } as any)
    .eq("provider_key", providerKey)
    .eq("external_id", externalId);
  await recordAudit({
    ...actor,
    action: "product.conflict.accept",
    providerKey,
    detail: { externalId },
  });
  return { ok: true, detail: "Supplier record accepted." };
}

/**
 * Crash recovery: a worker that dies mid-sync leaves its run row in "running"
 * forever. Any run older than the reaper window is closed as failed so health,
 * due-provider logic and the console stop waiting on a run that cannot finish.
 */
export async function reapStaleSyncRuns(maxMinutes = 30): Promise<number> {
  const db = await admin();
  const cutoff = new Date(Date.now() - maxMinutes * 60_000).toISOString();
  const { data } = await db
    .from("integration_sync_runs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: `Run abandoned: no completion within ${maxMinutes} minutes.`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("status", "running")
    .lt("started_at", cutoff)
    .select("id");
  return (data ?? []).length;
}


// --------------------------------------------------------------- log reads
export async function listRuns(filter: {
  providerKey?: string;
  limit?: number;
}): Promise<IntegrationRunRow[]> {
  const db = await admin();
  let q = db
    .from("integration_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(Math.min(200, filter.limit ?? 40));
  if (filter.providerKey) q = q.eq("provider_key", filter.providerKey);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const row = r as Row;
    return {
      id: str(row["id"]),
      providerKey: str(row["provider_key"]),
      scope: str(row["scope"]),
      trigger: str(row["trigger"]),
      status: str(row["status"]),
      externalId: (row["external_id"] as string | null) ?? null,
      discovered: num(row["discovered"]),
      created: num(row["created_count"]),
      updated: num(row["updated_count"]),
      unchanged: num(row["unchanged_count"]),
      failed: num(row["failed_count"]),
      error: (row["error"] as string | null) ?? null,
      startedAt: str(row["started_at"]),
      finishedAt: (row["finished_at"] as string | null) ?? null,
      durationMs: (row["duration_ms"] as number | null) ?? null,
    };
  });
}

export async function listLogs(filter: {
  providerKey?: string;
  limit?: number;
}): Promise<IntegrationLogRow[]> {
  const db = await admin();
  let q = db
    .from("integration_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(200, filter.limit ?? 60));
  if (filter.providerKey) q = q.eq("provider_key", filter.providerKey);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const row = r as Row;
    return {
      id: str(row["id"]),
      providerKey: str(row["provider_key"]),
      level: str(row["level"]),
      operation: str(row["operation"]),
      status: str(row["status"]),
      httpStatus: (row["http_status"] as number | null) ?? null,
      latencyMs: (row["latency_ms"] as number | null) ?? null,
      attempts: (row["attempts"] as number | null) ?? null,
      message: (row["message"] as string | null) ?? null,
      createdAt: str(row["created_at"]),
    };
  });
}

export async function listAudit(limit = 40): Promise<IntegrationAuditRow[]> {
  const db = await admin();
  const { data } = await db
    .from("integration_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(200, limit));
  return (data ?? []).map((r) => {
    const row = r as Row;
    return {
      id: str(row["id"]),
      actorEmail: (row["actor_email"] as string | null) ?? null,
      action: str(row["action"]),
      providerKey: (row["provider_key"] as string | null) ?? null,
      detail: sanitize(row["detail"] ?? {}),
      createdAt: str(row["created_at"]),
    };
  });
}

export function availableAdapters(): { id: string; label: string }[] {
  return listAdapters();
}

// ---------------------------------------------------------------- webhooks
/** Verifies a supplier webhook against the provider's configured shared secret. */
export async function handleWebhook(
  providerKey: string,
  rawBody: string,
  signature: string | null,
  timestampHeader?: string | null,
): Promise<{ accepted: boolean; reason: string }> {
  const db = await admin();
  const provider = await getProvider(providerKey);
  if (!provider) return { accepted: false, reason: "unknown supplier" };

  // A supplier without a configured signing secret cannot be verified, so the
  // payload is never processed — it is recorded and refused.
  const secretName = provider.webhookSecretName;
  const secret = secretName ? (process.env[secretName] ?? "").trim() : "";

  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  let valid = false;
  let algorithm = "none";
  let reason = "";

  if (!secret) {
    reason = "webhook secret not configured";
  } else if (!signature) {
    reason = "missing signature";
  } else {
    // Documented scheme: HMAC-SHA256 over the raw body, optionally prefixed by a
    // timestamp that is also covered by the signature (`t=<unix>,v1=<hex>`).
    const parts = new Map(
      signature
        .split(",")
        .map((p) => p.trim().split("="))
        .filter((p): p is [string, string] => p.length === 2)
        .map(([k, v]) => [k.trim(), v.trim()]),
    );
    const ts = parts.get("t") ?? timestampHeader ?? null;
    const provided = (parts.get("v1") ?? signature).replace(/^sha256=/, "").trim();
    const signedPayload = ts ? `${ts}.${rawBody}` : rawBody;
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
    algorithm = "hmac-sha256";
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    valid = a.length === b.length && timingSafeEqual(a, b);
    if (!valid) reason = "invalid signature";
    // Replay window: a signed timestamp older than five minutes is refused.
    if (valid && ts) {
      const seconds = Number(ts);
      const ms = Number.isFinite(seconds) ? (seconds > 1e12 ? seconds : seconds * 1000) : NaN;
      if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > 5 * 60_000) {
        valid = false;
        reason = "signature timestamp outside the replay window";
      }
    }
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
    if (valid) {
      valid = false;
      reason = "payload is not valid JSON";
    }
  }

  const payloadRow = (payload ?? {}) as Row;
  const eventId =
    typeof payloadRow["id"] === "string"
      ? payloadRow["id"]
      : typeof payloadRow["event_id"] === "string"
        ? (payloadRow["event_id"] as string)
        : null;

  const { data: inserted, error: insertError } = await db
    .from("integration_webhook_events")
    .insert({
      provider_key: providerKey,
      event_type: (payloadRow["event"] as string | null) ?? null,
      event_id: valid ? eventId : null,
      // Only verified deliveries claim the content fingerprint. A rejected
      // delivery must never block the supplier's later, correctly-signed retry
      // of the same event.
      payload_hash: valid ? payloadHash : null,
      signature_algorithm: algorithm,
      signature_valid: valid,
      payload: sanitize(payload ?? {}),
      processed: false,
      attempts: 0,
      error: valid ? null : reason,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id")
    .maybeSingle();

  if (!valid) {
    await logIntegration({
      providerKey,
      operation: "webhook",
      status: "error",
      message: reason || "Signature rejected.",
    });
    return { accepted: false, reason: reason || "invalid signature" };
  }

  // Unique partial indexes on (provider_key, event_id) and (provider_key,
  // payload_hash) make a repeated verified delivery a no-op rather than a second
  // sync. Any other insert failure is a real error, not a duplicate.
  if (insertError) {
    const duplicate =
      (insertError as { code?: string }).code === "23505" ||
      /duplicate key|unique constraint/i.test(insertError.message ?? "");
    await logIntegration({
      providerKey,
      operation: "webhook",
      status: duplicate ? "skipped" : "error",
      message: duplicate
        ? "Duplicate delivery ignored."
        : `Webhook could not be recorded: ${insertError.message}`,
    });
    if (duplicate) return { accepted: true, reason: "duplicate delivery ignored" };
    return { accepted: false, reason: "webhook could not be recorded" };
  }

  const eventRowId = inserted ? (inserted as Row)["id"] : null;
  try {
    await syncProvider({ providerKey, scope: "incremental", trigger: "webhook" });
    if (eventRowId)
      await db
        .from("integration_webhook_events")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ processed: true, attempts: 1, processed_at: new Date().toISOString() } as any)
        .eq("id", eventRowId as string);
    return { accepted: true, reason: "processed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing failed";
    if (eventRowId)
      await db
        .from("integration_webhook_events")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ attempts: 1, error: message.slice(0, 400) } as any)
        .eq("id", eventRowId as string);
    await logIntegration({
      providerKey,
      operation: "webhook",
      status: "error",
      message: message.slice(0, 400),
    });
    return { accepted: false, reason: "processing failed" };
  }
}

