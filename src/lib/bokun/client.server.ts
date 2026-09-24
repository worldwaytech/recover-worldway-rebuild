// Server-only Bókun REST client (HMAC-SHA1 signed) + OCTO bearer client.
// Credentials never leave the server: this module is the only place that
// reads BOKUN_ACCESS_KEY / BOKUN_SECRET_KEY / BOKUN_OCTO_TOKEN.

import { createHmac } from "node:crypto";
import {
  BOKUN_ENV_FLAG,
  BOKUN_HOSTS,
  BOKUN_LIMITS,
  BOKUN_SECRETS,
  type BokunEnvironment,
} from "./config";

export class BokunError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly environment: BokunEnvironment,
    public readonly path: string,
  ) {
    super(message);
    this.name = "BokunError";
  }
}

/** UTC date header in Bókun's required format: yyyy-MM-dd HH:mm:ss. */
export function bokunDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/**
 * Bókun request signature per the official docs:
 * Base64( HMAC-SHA1( secretKey, date + accessKey + method + path ) )
 * where `path` includes the query string. Exported for unit tests.
 */
export function bokunSignature(
  secretKey: string,
  accessKey: string,
  date: string,
  method: string,
  path: string,
): string {
  return createHmac("sha1", secretKey)
    .update(date + accessKey + method.toUpperCase() + path)
    .digest("base64");
}

function credentials(): { accessKey: string; secretKey: string } {
  const accessKey = process.env[BOKUN_SECRETS.accessKey];
  const secretKey = process.env[BOKUN_SECRETS.secretKey];
  if (!accessKey || !secretKey) {
    throw new BokunError("Bókun credentials are not configured on the server.", 500, "test", "");
  }
  return { accessKey, secretKey };
}

/** Which host to call. Defaults to test until the environment probe says otherwise. */
export function activeEnvironment(): BokunEnvironment {
  const env = (process.env[BOKUN_ENV_FLAG] ?? "").trim().toLowerCase();
  return env === "live" ? "live" : "test";
}

function sanitizeMessage(status: number): string {
  // Never echo upstream bodies (they can contain account detail). Map by class.
  if (status === 401 || status === 403) return "Supplier authentication failed.";
  if (status === 404) return "Not found at the supplier.";
  if (status === 429) return "Supplier rate limit reached; please retry.";
  if (status >= 500) return "Supplier service error.";
  return "Supplier request failed.";
}

export interface BokunFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  environment?: BokunEnvironment;
  timeoutMs?: number;
  /** Set false for one-shot writes (bookings/cancellations must never auto-retry). */
  retry?: boolean;
}

export async function bokunFetch<T = unknown>(
  path: string,
  opts: BokunFetchOptions = {},
): Promise<T> {
  const environment = opts.environment ?? activeEnvironment();
  const method = opts.method ?? "GET";
  const base = BOKUN_HOSTS[environment];
  const { accessKey, secretKey } = credentials();
  const date = bokunDate();
  const signature = bokunSignature(secretKey, accessKey, date, method, path);
  const url = `${base}${path}`;
  const timeoutMs = opts.timeoutMs ?? BOKUN_LIMITS.timeoutMs;
  const retry = opts.retry ?? method === "GET";
  const maxAttempts = retry ? BOKUN_LIMITS.maxRetries + 1 : 1;

  let lastError: BokunError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "X-Bokun-Date": date,
          "X-Bokun-AccessKey": accessKey,
          "X-Bokun-Signature": signature,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        // Retry only on transient statuses.
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        throw new BokunError(sanitizeMessage(res.status), res.status, environment, path);
      }
      return (text ? JSON.parse(text) : null) as T;
    } catch (err) {
      if (err instanceof BokunError) throw err;
      lastError = new BokunError(
        "Supplier request timed out or the network failed.",
        0,
        environment,
        path,
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new BokunError("Supplier request failed.", 0, environment, path);
}

// ---------------------------------------------------------------- OCTO layer

export async function octoFetch<T = unknown>(
  path: string,
  opts: BokunFetchOptions = {},
): Promise<T> {
  const environment = opts.environment ?? activeEnvironment();
  const token = process.env[BOKUN_SECRETS.octoToken];
  if (!token) {
    throw new BokunError("OCTO token is not configured on the server.", 500, environment, path);
  }
  const base = BOKUN_HOSTS[environment];
  const method = opts.method ?? "GET";
  const timeoutMs = opts.timeoutMs ?? BOKUN_LIMITS.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BokunError(sanitizeMessage(res.status), res.status, environment, path);
    }
    return (text ? JSON.parse(text) : null) as T;
  } catch (err) {
    if (err instanceof BokunError) throw err;
    throw new BokunError("Supplier request timed out or the network failed.", 0, environment, path);
  } finally {
    clearTimeout(timer);
  }
}
