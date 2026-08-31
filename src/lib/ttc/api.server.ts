// Official TTC API V4 client — SERVER ONLY.
//
// Endpoints and headers follow the published specification at
// https://api.ttc.com/api-spec (spec.yaml, OpenAPI 3.0.3). Nothing is invented:
// when credentials or entitlement are missing every call fails closed with a
// descriptive error instead of fabricating supplier data.

import { TTC_API, TTC_FEATURE_FLAGS, type TtcBrand, type TtcRegion } from "./config";

export interface TtcApiStatus {
  configured: boolean;
  enabled: boolean;
  authMode: "basic-token" | "bearer-jwt" | "none";
  hasToken: boolean;
  hasClientId: boolean;
  hasAgentId: boolean;
  bookingEnabled: boolean;
  baseUrl: string;
  acceptHeader: string;
  missing: string[];
}

function env(name: string): string | undefined {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length > 0 ? value : undefined;
}

function flag(name: string): boolean {
  const value = env(name)?.toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/** Non-secret status snapshot; never exposes credential values. */
export function ttcApiStatus(): TtcApiStatus {
  const token = env("TTC_API_TOKEN");
  const clientId = env("TTC_CLIENT_ID");
  const agentId = env("TTC_AGENT_ID");
  const authMode = token ? "basic-token" : clientId && agentId ? "bearer-jwt" : "none";
  const missing: string[] = [];
  if (!token && !clientId) missing.push("TTC_API_TOKEN (or TTC_CLIENT_ID + TTC_AGENT_ID)");
  if (!token && clientId && !agentId) missing.push("TTC_AGENT_ID");
  if (!flag(TTC_FEATURE_FLAGS.api)) missing.push(TTC_FEATURE_FLAGS.api);
  return {
    configured: authMode !== "none",
    enabled: authMode !== "none" && flag(TTC_FEATURE_FLAGS.api),
    authMode,
    hasToken: Boolean(token),
    hasClientId: Boolean(clientId),
    hasAgentId: Boolean(agentId),
    bookingEnabled: flag(TTC_FEATURE_FLAGS.booking),
    baseUrl: TTC_API.baseUrl,
    acceptHeader: TTC_API.acceptHeader,
    missing,
  };
}

export class TtcApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "TtcApiError";
  }
}

export class TtcNotAuthorisedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtcNotAuthorisedError";
  }
}

function authHeaders(): Record<string, string> {
  const token = env("TTC_API_TOKEN");
  if (token) {
    const basic = Buffer.from(`${TTC_API.basicUsername}:${token}`).toString("base64");
    return { Authorization: `Basic ${basic}` };
  }
  const clientId = env("TTC_CLIENT_ID");
  const agentId = env("TTC_AGENT_ID");
  if (clientId && agentId) {
    // The documented JWT flow is negotiated by the gateway from these identifiers.
    return { "X-Client-Id": clientId, "X-Agent-Id": agentId };
  }
  throw new TtcNotAuthorisedError(
    "TTC API credentials are not configured. Live pricing, availability and booking stay disabled until TTC provides authorised API access.",
  );
}

export interface TtcRateLimitSnapshot {
  limit: number | null;
  remaining: number | null;
  observedAt: string;
}

let lastRateLimit: TtcRateLimitSnapshot | null = null;
export function ttcRateLimit(): TtcRateLimitSnapshot | null {
  return lastRateLimit;
}

function path(template: string, params: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    const token = `{${key}}`;
    if (!out.includes(token)) {
      throw new Error(`TTC endpoint ${template} has no path parameter ${token}`);
    }
    out = out.replace(token, encodeURIComponent(String(value)));
  }
  const leftover = out.match(/\{[^}]+\}/);
  if (leftover) throw new Error(`TTC endpoint ${template} is missing parameter ${leftover[0]}`);
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(
  endpoint: string,
  options: {
    pathParams?: Record<string, string | number>;
    query?: Record<string, string | number | undefined>;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    region?: TtcRegion;
    requireEnabled?: boolean;
  } = {},
): Promise<T> {
  const status = ttcApiStatus();
  if (!status.configured) {
    throw new TtcNotAuthorisedError(
      "TTC API credentials are not configured. Catalogue content is served from the approved TTC content source until API access is granted.",
    );
  }
  if (options.requireEnabled !== false && !status.enabled) {
    throw new TtcNotAuthorisedError(
      `The TTC live API is disabled. Set ${TTC_FEATURE_FLAGS.api}=true once TTC confirms our API entitlement.`,
    );
  }

  const url = new URL(path(endpoint, options.pathParams ?? {}), TTC_API.baseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Accept: TTC_API.acceptHeader,
    ...authHeaders(),
  };
  if (options.region) headers["X-Region"] = options.region;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let attempt = 0;
  let lastError: unknown;
  while (attempt <= TTC_API.maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TTC_API.timeoutMs);
    try {
      const response = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });

      const limit = response.headers.get("X-RateLimit-Limit");
      const remaining = response.headers.get("X-RateLimit-Remaining");
      if (limit || remaining) {
        lastRateLimit = {
          limit: limit ? Number(limit) : null,
          remaining: remaining ? Number(remaining) : null,
          observedAt: new Date().toISOString(),
        };
      }

      if (response.status === 429) {
        // TTC documents Retry-After in MILLISECONDS.
        const retryAfterMs = Number(response.headers.get("Retry-After") ?? "1000") || 1000;
        if (attempt <= TTC_API.maxRetries) {
          await sleep(Math.min(retryAfterMs, 60000));
          continue;
        }
        throw new TtcApiError("TTC rate limit exceeded", 429, undefined, retryAfterMs);
      }

      if (response.status === 401 || response.status === 403) {
        const body = await response.text();
        throw new TtcNotAuthorisedError(
          `TTC rejected the request [${response.status}]: ${body.slice(0, 500)}`,
        );
      }

      if (response.status >= 500 && attempt <= TTC_API.maxRetries) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new TtcApiError(
          `TTC request failed [${response.status}] ${url.pathname}: ${body.slice(0, 500)}`,
          response.status,
          body,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof TtcNotAuthorisedError || error instanceof TtcApiError) throw error;
      lastError = error;
      if (attempt > TTC_API.maxRetries) break;
      await sleep(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new TtcApiError(
    `TTC request failed after ${TTC_API.maxRetries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
    0,
  );
}

// ------------------------------------------------------------- read surface

export function fetchTtcBrandIndex(brand: TtcBrand, region?: TtcRegion) {
  return request<unknown>(TTC_API.endpoints.brandIndex, {
    pathParams: { brand },
    ...(region ? { region } : {}),
  });
}

export function fetchTtcBrandTours(
  brand: TtcBrand,
  query: { page?: number; pageSize?: number; updatedSince?: string; region?: TtcRegion } = {},
) {
  const { region, ...rest } = query;
  return request<unknown>(TTC_API.endpoints.brandTours, {
    pathParams: { brand },
    query: rest,
    ...(region ? { region } : {}),
  });
}

export function fetchTtcTour(brand: TtcBrand, tourId: string, region?: TtcRegion) {
  return request<unknown>(TTC_API.endpoints.tour, {
    pathParams: { brand, tourId },
    ...(region ? { region } : {}),
  });
}

export function fetchTtcTourOption(brand: TtcBrand, tourId: string, optionId: string) {
  return request<unknown>(TTC_API.endpoints.tourOption, {
    pathParams: { brand, tourId, optionId },
  });
}

export function fetchTtcOptionAvailability(brand: TtcBrand, tourId: string, optionId: string) {
  return request<unknown>(TTC_API.endpoints.optionAvailability, {
    pathParams: { brand, tourId, optionId },
  });
}

export function fetchTtcDepartureAvailability(
  brand: TtcBrand,
  tourId: string,
  optionId: string,
  departureId: string,
) {
  return request<unknown>(TTC_API.endpoints.departureAvailability, {
    pathParams: { brand, tourId, optionId, departureId },
  });
}

/**
 * Non-mutating entitlement probe. Returns the supplier's own status/body so a
 * 401/403 is reported verbatim rather than masked.
 */
export async function probeTtcApi(): Promise<{
  ok: boolean;
  status: number | null;
  detail: string;
  rateLimit: TtcRateLimitSnapshot | null;
}> {
  const status = ttcApiStatus();
  if (!status.configured) {
    return { ok: false, status: null, detail: "No TTC credentials configured.", rateLimit: null };
  }
  try {
    await request<unknown>(TTC_API.endpoints.brandIndex, {
      pathParams: { brand: "trafalgar" },
      query: { pageSize: 1 },
      requireEnabled: false,
    });
    return { ok: true, status: 200, detail: "TTC API reachable and authorised.", rateLimit: lastRateLimit };
  } catch (error) {
    if (error instanceof TtcApiError) {
      return { ok: false, status: error.status, detail: error.message, rateLimit: lastRateLimit };
    }
    return {
      ok: false,
      status: null,
      detail: error instanceof Error ? error.message : "Unknown TTC probe failure",
      rateLimit: lastRateLimit,
    };
  }
}

// ------------------------------------------------------- write surface (closed)

function assertBookingEnabled(): never {
  throw new TtcNotAuthorisedError(
    `TTC booking is not authorised yet. Once TTC grants booking API access, configure credentials and set ${TTC_FEATURE_FLAGS.booking}=true; quotes and bookings remain disabled until then.`,
  );
}

export async function quoteTtcDeparture(_input: {
  brand: TtcBrand;
  tourId: string;
  optionId: string;
  departureId: string;
  passengers: unknown;
}): Promise<never> {
  const status = ttcApiStatus();
  if (!status.enabled || !status.bookingEnabled) assertBookingEnabled();
  return request<never>(TTC_API.endpoints.departureQuote, {
    method: "POST",
    pathParams: {
      brand: _input.brand,
      tourId: _input.tourId,
      optionId: _input.optionId,
      departureId: _input.departureId,
    },
    body: { passengers: _input.passengers },
  });
}

export async function bookTtcDeparture(_input: {
  brand: TtcBrand;
  tourId: string;
  optionId: string;
  departureId: string;
  payload: unknown;
}): Promise<never> {
  const status = ttcApiStatus();
  if (!status.enabled || !status.bookingEnabled) assertBookingEnabled();
  return request<never>(TTC_API.endpoints.departureBook, {
    method: "POST",
    pathParams: {
      brand: _input.brand,
      tourId: _input.tourId,
      optionId: _input.optionId,
      departureId: _input.departureId,
    },
    body: _input.payload,
  });
}
