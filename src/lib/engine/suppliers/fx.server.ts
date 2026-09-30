// Live FX (server-only). Rates come ONLY from live providers — never AI or constants.
// Order: Open Exchange Rates (only if a key is configured) → Frankfurter (ECB reference
// rates, keyless) → ExchangeRate-API open access (keyless). Each result records the
// provider, rate timestamp and exact rates used. If every provider fails or is stale,
// only the identity rate is returned, so mixed-currency totals fail safely.
import type { FxTable } from "../pricing";

export type FxProviderId = "open-exchange-rates" | "frankfurter-ecb" | "exchangerate-api";

export interface FxAudit {
  provider: FxProviderId | null;
  target: string;
  /** Provider timestamp of the rates (ISO). */
  ratesAt: string | null;
  /** When Worldway fetched them (ISO). */
  fetchedAt?: string | null;
  /** currency -> rate into target, exactly as used. */
  rates: FxTable;
  error: string | null;
}

export type FxProvider = (target: string, sources?: string[]) => Promise<{ table: FxTable; source: string | null; audit: FxAudit }>;

const TTL_MS = 30 * 60 * 1000; // cache 30 min, then refresh
const HOURLY_MAX_AGE_MS = 6 * 60 * 60 * 1000; // hourly feed older than 6h → stale
const DAILY_MAX_AGE_MS = 96 * 60 * 60 * 1000; // daily reference feeds (weekends/holidays) older than 4 days → stale

type Snapshot = { provider: FxProviderId; at: number; ts: number; maxAge: number; rates: Record<string, number> };
let cache: Snapshot | null = null;

/** Pure: derive rates into `target` from a USD-based table. Exported for tests. */
export function crossRates(usdRates: Record<string, number>, target: string, sources: string[]): FxTable {
  const t = usdRates[target];
  const out: FxTable = { [target]: 1 };
  if (!(t > 0)) return out;
  for (const s of sources) {
    const r = usdRates[s];
    if (s !== target && r > 0) out[s] = t / r;
  }
  return out;
}

export function isStale(providerTsSec: number, now = Date.now(), maxAgeMs = HOURLY_MAX_AGE_MS) {
  return now - providerTsSec * 1000 > maxAgeMs;
}

const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });

async function fetchOxr(): Promise<Snapshot | null> {
  const appId = process.env["OPEN_EXCHANGE_RATES_APP_ID"];
  if (!appId) return null;
  const r = await get(`https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}`);
  if (!r.ok) throw new Error(`open-exchange-rates HTTP ${r.status}`);
  const j = (await r.json()) as { timestamp?: number; base?: string; rates?: Record<string, number> };
  if (!j.timestamp || !j.rates || j.base !== "USD") throw new Error("open-exchange-rates invalid payload");
  return { provider: "open-exchange-rates", at: Date.now(), ts: j.timestamp, maxAge: HOURLY_MAX_AGE_MS, rates: j.rates };
}

async function fetchFrankfurter(): Promise<Snapshot> {
  const r = await get("https://api.frankfurter.dev/v1/latest?base=USD");
  if (!r.ok) throw new Error(`frankfurter HTTP ${r.status}`);
  const j = (await r.json()) as { base?: string; date?: string; rates?: Record<string, number> };
  if (j.base !== "USD" || !j.date || !j.rates) throw new Error("frankfurter invalid payload");
  // ECB reference rates are published ~16:00 CET on the stated date.
  const ts = Math.floor(Date.parse(`${j.date}T14:00:00Z`) / 1000);
  return { provider: "frankfurter-ecb", at: Date.now(), ts, maxAge: DAILY_MAX_AGE_MS, rates: { ...j.rates, USD: 1 } };
}

async function fetchErApi(): Promise<Snapshot> {
  const r = await get("https://open.er-api.com/v6/latest/USD");
  if (!r.ok) throw new Error(`exchangerate-api HTTP ${r.status}`);
  const j = (await r.json()) as { result?: string; base_code?: string; time_last_update_unix?: number; rates?: Record<string, number> };
  if (j.result !== "success" || j.base_code !== "USD" || !j.time_last_update_unix || !j.rates) throw new Error("exchangerate-api invalid payload");
  return { provider: "exchangerate-api", at: Date.now(), ts: j.time_last_update_unix, maxAge: DAILY_MAX_AGE_MS, rates: j.rates };
}

async function snapshot(errors: string[]): Promise<Snapshot | null> {
  if (cache && Date.now() - cache.at <= TTL_MS && !isStale(cache.ts, Date.now(), cache.maxAge)) return cache;
  for (const f of [fetchOxr, fetchFrankfurter, fetchErApi]) {
    try {
      const s = await f();
      if (!s) continue;
      if (isStale(s.ts, Date.now(), s.maxAge)) { errors.push(`${s.provider}: stale`); continue; }
      cache = s;
      return s;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "provider error");
    }
  }
  return null;
}

export const approvedFx: FxProvider = async (target, sources = []) => {
  const identity = { [target]: 1 };
  const need = [...new Set(sources.filter((s) => s !== target))];
  if (!need.length) return { table: identity, source: null, audit: { provider: null, target, ratesAt: null, rates: identity, error: null } };
  const errors: string[] = [];
  const fail = (error: string) => {
    console.warn("[fx] unavailable", JSON.stringify({ target, need, errors }));
    return { table: identity, source: null, audit: { provider: null, target, ratesAt: null, rates: identity, error } satisfies FxAudit };
  };
  const s = await snapshot(errors);
  if (!s) return fail("Live currency rates are unavailable right now");
  const table = crossRates(s.rates, target, need);
  const missing = need.filter((c) => !table[c]);
  if (missing.length) return fail(`No live rate for ${missing.join(", ")}`);
  return {
    table,
    source: s.provider,
    audit: { provider: s.provider, target, ratesAt: new Date(s.ts * 1000).toISOString(), fetchedAt: new Date(s.at).toISOString(), rates: table, error: null },
  };
};

/** Test hook. */
export function __resetFxCache() { cache = null; }
