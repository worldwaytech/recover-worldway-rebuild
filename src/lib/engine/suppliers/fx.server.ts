// Approved FX provider: Open Exchange Rates (server-only).
// Rates come ONLY from the provider — never from AI or constants. Without a key,
// on error, or when stale, only the identity rate is returned, so mixed-currency
// pricing fails safely in pricePackage/convert.
import type { FxTable } from "../pricing";

export interface FxAudit {
  provider: "open-exchange-rates" | null;
  target: string;
  /** Provider timestamp of the rates (ISO). */
  ratesAt: string | null;
  /** currency -> rate into target, exactly as used. */
  rates: FxTable;
  error: string | null;
}

export type FxProvider = (target: string, sources?: string[]) => Promise<{ table: FxTable; source: string | null; audit: FxAudit }>;

const TTL_MS = 60 * 60 * 1000; // cache 1h
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // provider rates older than 6h are stale → fail safely
let cache: { at: number; ts: number; base: string; rates: Record<string, number> } | null = null;

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

export function isStale(providerTsSec: number, now = Date.now()) {
  return now - providerTsSec * 1000 > MAX_AGE_MS;
}

export const approvedFx: FxProvider = async (target, sources = []) => {
  const identity = { [target]: 1 };
  const fail = (error: string) => ({ table: identity, source: null, audit: { provider: null, target, ratesAt: null, rates: identity, error } satisfies FxAudit });
  const need = sources.filter((s) => s !== target);
  if (!need.length) return { table: identity, source: null, audit: { provider: null, target, ratesAt: null, rates: identity, error: null } };
  const appId = process.env["OPEN_EXCHANGE_RATES_APP_ID"];
  if (!appId) return fail("FX provider not configured");
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      const r = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return fail(`FX provider HTTP ${r.status}`);
      const j = (await r.json()) as { timestamp?: number; base?: string; rates?: Record<string, number> };
      if (!j.timestamp || !j.rates || j.base !== "USD") return fail("FX provider returned an invalid payload");
      cache = { at: Date.now(), ts: j.timestamp, base: j.base, rates: j.rates };
    }
    if (isStale(cache.ts)) return fail("FX rates are stale");
    const table = crossRates(cache.rates, target, need);
    const missing = need.filter((s) => !table[s]);
    if (missing.length) return fail(`No FX rate for ${missing.join(", ")}`);
    return { table, source: "open-exchange-rates", audit: { provider: "open-exchange-rates", target, ratesAt: new Date(cache.ts * 1000).toISOString(), rates: table, error: null } };
  } catch {
    return fail("FX provider unavailable");
  }
};
