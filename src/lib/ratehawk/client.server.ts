// RateHawk (ETG v3) — server-only HTTP client.
//
// Credentials are read from process.env INSIDE each call and never returned to
// a caller, logged, or serialized into a response. Authentication is HTTP Basic
// with `<KEY_ID>:<API_KEY>` exactly as documented by ETG.
//
// Isolation: this module talks to no other supplier and shares no state with
// HBX, TTC, Crystal, Cruisea or Viator.
import {
  RATEHAWK_ENV_VAR,
  RATEHAWK_FEATURE_FLAG,
  RATEHAWK_HOSTS,
  RATEHAWK_LIMITS,
  RATEHAWK_SECRET_NAMES,
  RATEHAWK_TIMEOUTS_MS,
  ratehawkEndpointUrl,
  type RatehawkEnvironment,
  type RatehawkOperation,
} from "./config";
import type { RatehawkError, RatehawkResult } from "./types";

export function ratehawkEnvironment(): RatehawkEnvironment {
  const raw = (process.env[RATEHAWK_ENV_VAR] ?? "sandbox").toLowerCase();
  if (raw === "production") return "production";
  if (raw === "test") return "test";
  return "sandbox";
}

export function ratehawkHost(): string {
  return RATEHAWK_HOSTS[ratehawkEnvironment()];
}

export function ratehawkEnabled(): boolean {
  const value = process.env[RATEHAWK_FEATURE_FLAG];
  if (value == null || value === "") return true; // default-on once credentials exist
  return !["false", "0", "off", "no"].includes(value.toLowerCase());
}

/** Presence-only credential view. Values are never included. */
export function ratehawkCredentialStatus(): { configured: boolean; missing: string[] } {
  const missing = RATEHAWK_SECRET_NAMES.filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing: [...missing] };
}

// -------------------------------------------------------------- rate limiting
let lastCallAt = 0;

async function throttle(): Promise<void> {
  const minGap = 1000 / RATEHAWK_LIMITS.rateLimitPerSecond;
  const wait = lastCallAt + minGap - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function backoffMs(attempt: number): number {
  return Math.min(4_000, 400 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

/**
 * Never book, cancel or finish a booking twice on a retry: only idempotent
 * reads and the explicitly idempotent status/info calls are retried.
 */
const IDEMPOTENT: RatehawkOperation[] = [
  "contract",
  "multicomplete",
  "searchRegion",
  "searchHotels",
  "hotelPage",
  "hotelInfo",
  "bookingStatus",
  "orderInfo",
];

function errorFrom(code: string, message: string, origin: RatehawkError["origin"], retryable = false): RatehawkError {
  return { code, message, origin, retryable };
}

type EtgEnvelope = { status?: string; error?: string | null; data?: unknown; debug?: unknown };

/**
 * Single entry point for every RateHawk call. Handles auth, timeouts, bounded
 * retries with backoff, rate limiting, ETG's envelope (`{status,error,data}`)
 * and structured logging into the universal integration log.
 */
export async function ratehawkCall<T>(
  operation: RatehawkOperation,
  body: Record<string, unknown>,
): Promise<RatehawkResult<T>> {
  const environment = ratehawkEnvironment();
  const startedAt = Date.now();
  const meta = { operation, environment, httpStatus: null as number | null, latencyMs: 0, attempts: 0 };

  if (!ratehawkEnabled()) {
    meta.latencyMs = Date.now() - startedAt;
    return {
      ok: false,
      meta,
      error: errorFrom("disabled", "The RateHawk connector is disabled by feature flag.", "disabled"),
    };
  }

  const keyId = process.env[RATEHAWK_SECRET_NAMES[0]];
  const apiKey = process.env[RATEHAWK_SECRET_NAMES[1]];
  if (!keyId || !apiKey) {
    meta.latencyMs = Date.now() - startedAt;
    return {
      ok: false,
      meta,
      error: errorFrom(
        "credentials_missing",
        `RateHawk is NOT CONNECTED — missing ${ratehawkCredentialStatus().missing.join(" and ")}.`,
        "credentials",
      ),
    };
  }

  const url = ratehawkEndpointUrl(RATEHAWK_HOSTS[environment], operation);
  const timeoutMs = RATEHAWK_TIMEOUTS_MS[operation];
  const maxAttempts = IDEMPOTENT.includes(operation) ? RATEHAWK_LIMITS.maxRetries + 1 : 1;
  const authorization = `Basic ${Buffer.from(`${keyId}:${apiKey}`).toString("base64")}`;

  let lastError: RatehawkError = errorFrom("unknown", "RateHawk call did not complete.", "network", true);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    meta.attempts = attempt + 1;
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt - 1)));
    await throttle();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      meta.httpStatus = response.status;
      const text = await response.text();
      let envelope: EtgEnvelope = {};
      try {
        envelope = text ? (JSON.parse(text) as EtgEnvelope) : {};
      } catch {
        envelope = {};
      }

      if (response.status === 401 || response.status === 403) {
        lastError = errorFrom(
          envelope.error ?? "unauthorized",
          "RateHawk rejected the credentials for this environment.",
          "credentials",
        );
        break;
      }

      if (!response.ok) {
        const retryable = RETRYABLE_STATUS.has(response.status);
        lastError = errorFrom(
          envelope.error ?? `http_${response.status}`,
          `RateHawk returned HTTP ${response.status}${envelope.error ? ` (${envelope.error})` : ""}.`,
          retryable ? "supplier" : "request",
          retryable,
        );
        if (!retryable) break;
        continue;
      }

      // ETG answers HTTP 200 with `status: "error"` for business failures.
      if (envelope.status && envelope.status !== "ok") {
        lastError = errorFrom(
          envelope.error ?? "supplier_error",
          `RateHawk reported "${envelope.error ?? envelope.status}".`,
          "supplier",
        );
        break;
      }

      meta.latencyMs = Date.now() - startedAt;
      void logRatehawk(operation, "success", meta, null);
      return { ok: true, data: (envelope.data ?? null) as T, meta };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = errorFrom(
        aborted ? "timeout" : "network_error",
        aborted ? `RateHawk did not respond within ${timeoutMs}ms.` : "RateHawk could not be reached.",
        "network",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  meta.latencyMs = Date.now() - startedAt;
  void logRatehawk(operation, "error", meta, lastError);
  return { ok: false, error: lastError, meta };
}

/** Structured log into the universal integration log. Never carries secrets. */
async function logRatehawk(
  operation: RatehawkOperation,
  status: "success" | "error",
  meta: { httpStatus: number | null; latencyMs: number; attempts: number },
  error: RatehawkError | null,
): Promise<void> {
  try {
    const { logIntegration } = await import("@/lib/integrations/engine.server");
    await logIntegration({
      providerKey: "ratehawk",
      operation,
      status,
      level: status === "error" ? "error" : "info",
      httpStatus: meta.httpStatus,
      latencyMs: meta.latencyMs,
      attempts: meta.attempts,
      message: error ? `${error.code}: ${error.message}` : null,
      detail: error ? { code: error.code, origin: error.origin, retryable: error.retryable } : {},
    });
  } catch {
    // Logging must never break a supplier call.
  }
}

/** Cheapest authenticated read — used for Test Connection and API Health. */
export async function ratehawkProbe(): Promise<{ ok: boolean; status: number | null; detail: string }> {
  const result = await ratehawkCall<unknown>("contract", {});
  if (result.ok)
    return {
      ok: true,
      status: result.meta.httpStatus,
      detail: `Authenticated against the RateHawk ${result.meta.environment} environment in ${result.meta.latencyMs}ms.`,
    };
  return { ok: false, status: result.meta.httpStatus, detail: result.error.message };
}
