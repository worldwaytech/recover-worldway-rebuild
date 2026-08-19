// HBX Group (Hotelbeds) — server-only signed HTTP client.
//
// Security: credentials are read from process.env INSIDE each call, one pair per
// product suite, and never returned to the caller. Authentication uses HBX's
// documented scheme: `Api-key` plus `X-Signature` = SHA256(apiKey + secret +
// unix-seconds), regenerated per request.
//
// Production concerns handled here once for every suite: environment switching,
// feature flags, timeouts, bounded retries with exponential backoff, 429
// handling with client-side rate limiting, in-memory response caching for
// static content, structured logging and normalised errors.
import { createHash } from "crypto";
import {
  HBX_HOSTS,
  HBX_MASTER_FEATURE_FLAG,
  HBX_SUITE_CONFIG,
  type HbxEnvironment,
  type HbxSuite,
} from "./config";
import { backoffDelayMs, isRetryableStatus, normaliseHttpError } from "./normalize";
import type { HbxError, HbxResult } from "./types";

export function hbxEnvironment(): HbxEnvironment {
  return (process.env["HBX_ENVIRONMENT"] ?? "test").toLowerCase() === "live" ? "live" : "test";
}

function flagEnabled(name: string): boolean {
  const value = process.env[name];
  if (value == null || value === "") return true; // default-on once credentials exist
  return !["false", "0", "off", "no"].includes(value.toLowerCase());
}

export function hbxSuiteEnabled(suite: HbxSuite): boolean {
  return flagEnabled(HBX_MASTER_FEATURE_FLAG) && flagEnabled(HBX_SUITE_CONFIG[suite].featureFlag);
}

/** Presence-only credential view — values are never included. */
export function hbxCredentialStatus(suite: HbxSuite): {
  configured: boolean;
  missing: string[];
} {
  const cfg = HBX_SUITE_CONFIG[suite];
  const missing = [cfg.apiKeySecret, cfg.apiSecretSecret].filter((n) => !process.env[n]);
  return { configured: missing.length === 0, missing };
}

export function hbxSignature(apiKey: string, secret: string, nowSeconds: number): string {
  return createHash("sha256").update(`${apiKey}${secret}${nowSeconds}`).digest("hex");
}

function authHeaders(suite: HbxSuite): Record<string, string> | null {
  const cfg = HBX_SUITE_CONFIG[suite];
  const apiKey = process.env[cfg.apiKeySecret];
  const secret = process.env[cfg.apiSecretSecret];
  if (!apiKey || !secret) return null;
  return {
    "Api-key": apiKey,
    "X-Signature": hbxSignature(apiKey, secret, Math.floor(Date.now() / 1000)),
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "Content-Type": "application/json",
  };
}

// ------------------------------------------------------- rate limit + cache

const lastCallAt: Record<string, number> = {};

async function throttle(suite: HbxSuite): Promise<void> {
  const minGap = 1000 / HBX_SUITE_CONFIG[suite].rateLimitPerSecond;
  const previous = lastCallAt[suite] ?? 0;
  const wait = previous + minGap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt[suite] = Date.now();
}

type CacheEntry = { at: number; ttlMs: number; value: unknown };
const cache = new Map<string, CacheEntry>();

export function hbxCacheStats(): { entries: number; keys: string[] } {
  return { entries: cache.size, keys: Array.from(cache.keys()).slice(0, 50) };
}

export function hbxCacheInvalidate(prefix?: string): number {
  if (!prefix) {
    const size = cache.size;
    cache.clear();
    return size;
  }
  let removed = 0;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

// ------------------------------------------------------------ observability

export interface HbxLogEntry {
  at: string;
  requestId: string;
  suite: HbxSuite;
  environment: HbxEnvironment;
  operation: string;
  status: number;
  outcome: "ok" | "cache-hit" | "retry" | "error" | "skipped";
  attempts: number;
  durationMs: number;
  detail?: string;
}

const LOG: HbxLogEntry[] = [];
const LOG_LIMIT = 300;

function log(entry: HbxLogEntry): void {
  LOG.unshift(entry);
  if (LOG.length > LOG_LIMIT) LOG.length = LOG_LIMIT;
  const line = {
    scope: "hbx",
    ...entry,
  };
  if (entry.outcome === "error") console.error(JSON.stringify(line));
  else console.info(JSON.stringify(line));
}

export function hbxLog(limit = 60): HbxLogEntry[] {
  return LOG.slice(0, limit);
}

// ---------------------------------------------------------------- transport

export interface HbxCallOptions {
  suite: HbxSuite;
  /** Endpoint key from the suite config, or an absolute path starting with `/`. */
  path: string;
  api?: "content" | "booking";
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Cache lifetime override in seconds. 0 disables caching for this call. */
  cacheTtlSeconds?: number;
  operation?: string;
}

function buildUrl(opts: HbxCallOptions, environment: HbxEnvironment): string {
  const cfg = HBX_SUITE_CONFIG[opts.suite];
  const base = opts.api === "booking" ? cfg.bookingBasePath : cfg.contentBasePath;
  const url = new URL(`${HBX_HOSTS[environment]}${base}${opts.path}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function fail<T>(
  error: HbxError,
  opts: HbxCallOptions,
  environment: HbxEnvironment,
  requestId: string,
  startedAt: number,
  attempts: number,
): HbxResult<T> {
  log({
    at: new Date().toISOString(),
    requestId,
    suite: opts.suite,
    environment,
    operation: opts.operation ?? opts.path,
    status: error.status,
    outcome: error.code === "disabled" || error.code === "not-configured" ? "skipped" : "error",
    attempts,
    durationMs: Date.now() - startedAt,
    detail: error.code,
  });
  return {
    ok: false,
    status: error.status,
    error,
    meta: {
      suite: opts.suite,
      environment,
      attempts,
      durationMs: Date.now() - startedAt,
      fromCache: false,
      requestId,
    },
  };
}

/** Performs a signed, retried, cached HBX call and returns a normalised result. */
export async function hbxCall<T>(opts: HbxCallOptions): Promise<HbxResult<T>> {
  const cfg = HBX_SUITE_CONFIG[opts.suite];
  const environment = hbxEnvironment();
  const requestId = `hbx_${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = Date.now();
  const operation = opts.operation ?? `${opts.suite}${opts.path}`;

  if (!hbxSuiteEnabled(opts.suite)) {
    return fail<T>(
      {
        code: "disabled",
        message: `The HBX ${cfg.label} suite is disabled by feature flag.`,
        status: 503,
        retryable: false,
      },
      opts,
      environment,
      requestId,
      startedAt,
      0,
    );
  }

  const headers = authHeaders(opts.suite);
  if (!headers) {
    const { missing } = hbxCredentialStatus(opts.suite);
    return fail<T>(
      {
        code: "not-configured",
        message: `HBX ${cfg.label} credentials are not configured (${missing.join(", ")}).`,
        status: 503,
        retryable: false,
      },
      opts,
      environment,
      requestId,
      startedAt,
      0,
    );
  }

  const method = opts.method ?? "GET";
  const url = buildUrl(opts, environment);
  const ttlMs = (opts.cacheTtlSeconds ?? cfg.cacheTtlSeconds) * 1000;
  const cacheKey = `${opts.suite}:${environment}:${method}:${url}:${
    opts.body ? JSON.stringify(opts.body) : ""
  }`;

  if (method === "GET" && ttlMs > 0) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < hit.ttlMs) {
      log({
        at: new Date().toISOString(),
        requestId,
        suite: opts.suite,
        environment,
        operation,
        status: 200,
        outcome: "cache-hit",
        attempts: 0,
        durationMs: Date.now() - startedAt,
      });
      return {
        ok: true,
        status: 200,
        data: hit.value as T,
        meta: {
          suite: opts.suite,
          environment,
          attempts: 0,
          durationMs: Date.now() - startedAt,
          fromCache: true,
          requestId,
        },
      };
    }
  }

  let attempts = 0;
  let lastStatus = 0;
  let lastMessage: string | undefined;

  while (attempts < Math.max(1, cfg.maxRetries)) {
    attempts += 1;
    await throttle(opts.suite);
    try {
      const res = await fetch(url, {
        method,
        headers: authHeaders(opts.suite) ?? headers,
        body: method === "POST" && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      lastStatus = res.status;
      const raw = await res.text();

      if (!res.ok) {
        lastMessage = raw.slice(0, 400);
        console.error(
          JSON.stringify({
            scope: "hbx",
            requestId,
            suite: opts.suite,
            operation,
            status: res.status,
            supplierMessage: lastMessage,
          }),
        );
        if (isRetryableStatus(res.status) && attempts < cfg.maxRetries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 10000)
            : backoffDelayMs(attempts);
          log({
            at: new Date().toISOString(),
            requestId,
            suite: opts.suite,
            environment,
            operation,
            status: res.status,
            outcome: "retry",
            attempts,
            durationMs: Date.now() - startedAt,
          });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return fail<T>(
          normaliseHttpError(res.status, lastMessage),
          opts,
          environment,
          requestId,
          startedAt,
          attempts,
        );
      }

      let parsed: unknown = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        return fail<T>(
          {
            code: "invalid-response",
            message: "HBX returned a response we could not read.",
            status: 502,
            retryable: false,
          },
          opts,
          environment,
          requestId,
          startedAt,
          attempts,
        );
      }

      if (method === "GET" && ttlMs > 0) cache.set(cacheKey, { at: Date.now(), ttlMs, value: parsed });

      log({
        at: new Date().toISOString(),
        requestId,
        suite: opts.suite,
        environment,
        operation,
        status: res.status,
        outcome: "ok",
        attempts,
        durationMs: Date.now() - startedAt,
      });
      return {
        ok: true,
        status: res.status,
        data: parsed as T,
        meta: {
          suite: opts.suite,
          environment,
          attempts,
          durationMs: Date.now() - startedAt,
          fromCache: false,
          requestId,
        },
      };
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      lastMessage = e instanceof Error ? e.message : "network error";
      if (attempts < cfg.maxRetries) {
        await new Promise((r) => setTimeout(r, backoffDelayMs(attempts)));
        continue;
      }
      return fail<T>(
        aborted
          ? { code: "timeout", message: "HBX did not respond in time.", status: 504, retryable: true }
          : {
              code: "network",
              message: "We could not reach HBX.",
              status: 0,
              retryable: true,
            },
        opts,
        environment,
        requestId,
        startedAt,
        attempts,
      );
    }
  }

  return fail<T>(
    normaliseHttpError(lastStatus || 502, lastMessage),
    opts,
    environment,
    requestId,
    startedAt,
    attempts,
  );
}

/** Non-sensitive health snapshot for the admin console. */
export interface HbxSuiteHealth {
  suite: HbxSuite;
  label: string;
  environment: HbxEnvironment;
  enabled: boolean;
  configured: boolean;
  missingSecrets: string[];
  reachable: boolean | null;
  status: number | null;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
}

export async function hbxSuiteHealth(suite: HbxSuite): Promise<HbxSuiteHealth> {
  const cfg = HBX_SUITE_CONFIG[suite];
  const environment = hbxEnvironment();
  const enabled = hbxSuiteEnabled(suite);
  const { configured, missing } = hbxCredentialStatus(suite);
  const base: HbxSuiteHealth = {
    suite,
    label: cfg.label,
    environment,
    enabled,
    configured,
    missingSecrets: missing,
    reachable: null,
    status: null,
    latencyMs: null,
    message: !enabled
      ? "Disabled by feature flag."
      : configured
        ? "Credentials present."
        : `Awaiting credentials: ${missing.join(", ")}.`,
    checkedAt: new Date().toISOString(),
  };
  if (!enabled || !configured) return base;

  // Cheapest documented static call per suite doubles as the health probe.
  const probe: Record<HbxSuite, HbxCallOptions> = {
    hotels: {
      suite: "hotels",
      path: cfg.contentEndpoints["countries"]!,
      query: { fields: "code", language: "ENG", from: 1, to: 1 },
      cacheTtlSeconds: 0,
      operation: "health",
    },
    activities: {
      suite: "activities",
      path: cfg.contentEndpoints["countries"]!,
      query: { language: "en" },
      cacheTtlSeconds: 0,
      operation: "health",
    },
    transfers: {
      suite: "transfers",
      path: cfg.contentEndpoints["countries"]!,
      query: { language: "en" },
      cacheTtlSeconds: 0,
      operation: "health",
    },
  };

  const res = await hbxCall<unknown>(probe[suite]);
  return {
    ...base,
    reachable: res.ok,
    status: res.status,
    latencyMs: res.meta.durationMs,
    message: res.ok ? "Live and reachable." : (res.error?.message ?? "Unreachable."),
    checkedAt: new Date().toISOString(),
  };
}
