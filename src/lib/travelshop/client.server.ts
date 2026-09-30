// TravelShop Booking HTTP client — SERVER ONLY. The API key is read from
// process.env inside each call and never leaves the server.
//
// Rate limits (documented): 240 requests/minute, 20,000/day. We space calls
// to <= 3 per second and back off exponentially on 429 / 5xx / network errors.

export const TRAVELSHOP_BASE = "https://apiv3.travelshopbooking.com/b2b/api";

export const TRAVELSHOP_PATHS = {
  search: "/apiv2/b2c/tours/search",
  detail: (slug: string) => `/apiv2/b2c/tours/detail/${encodeURIComponent(slug)}`,
  availability: (slug: string) => `/apiv2/b2c/availability/${encodeURIComponent(slug)}`,
  prices: (type: string) => `/apiv2/b2c/prices/${encodeURIComponent(type)}`,
  newBooking: "/apiv1/bookings/new-booking",
  booking: (ref: string) => `/apiv1/bookings/${encodeURIComponent(ref)}`,
  paymentRequest: (ref: string) => `/apiv1/bookings/${encodeURIComponent(ref)}/payment-request`,
} as const;

export class TravelShopError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
  }
}

const MIN_GAP_MS = 340; // ~176 req/min, comfortably under 240/min
let lastCall = 0;
let requestCount = 0;
let retryCount = 0;
export function requestStats() {
  return { requestCount, retryCount };
}
export function resetRequestStats() {
  requestCount = 0;
  retryCount = 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiKey(): string {
  const k = (process.env["TRAVELSHOP_API_KEY"] ?? "").trim();
  if (!k) throw new TravelShopError("Tour supplier key not configured", 0, false);
  return k;
}

export async function travelshopRequest<T>(
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string | number | undefined>; maxRetries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const url = new URL(TRAVELSHOP_BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const maxRetries = opts.maxRetries ?? 4;
  let attempt = 0;
  for (;;) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    requestCount++;
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          "X-API-Key": apiKey(),
          Accept: "application/json",
          "User-Agent": "WorldwayServer/1.0",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
      });
    } catch (e) {
      if (attempt < maxRetries) {
        attempt++; retryCount++;
        await sleep(Math.min(30_000, 1000 * 2 ** attempt));
        continue;
      }
      throw new TravelShopError(`Network error: ${e instanceof Error ? e.message : "unknown"}`, 0, true);
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt < maxRetries) {
        attempt++; retryCount++;
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60_000, 1000 * 2 ** attempt));
        continue;
      }
      throw new TravelShopError(`Supplier HTTP ${res.status}`, res.status, true);
    }
    const text = await res.text();
    // The supplier's edge occasionally answers with a bot-check page (HTTP 403
    // HTML). It clears on retry, so treat it like a transient error.
    if (res.status === 403 && /Just a moment|cf_chl|challenge-platform/i.test(text)) {
      if (attempt < maxRetries) {
        attempt++; retryCount++;
        await sleep(Math.min(20_000, 1500 * 2 ** attempt));
        continue;
      }
      throw new TravelShopError("Supplier edge challenge", 403, true);
    }
    if (!res.ok) throw new TravelShopError(`Supplier HTTP ${res.status}: ${text.slice(0, 200)}`, res.status, false);
    try {
      return JSON.parse(text) as T;
    } catch {
      // Edge challenge page or non-JSON — treat as retryable.
      if (attempt < maxRetries) {
        attempt++; retryCount++;
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new TravelShopError("Supplier returned a non-JSON response", res.status, true);
    }
  }
}
