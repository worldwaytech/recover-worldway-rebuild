// AIR iQ pre-purchased (series) fares — server-only client.
//
// Source of truth: AIR iQ Postman documentation (collection 2sB2qcE1pR).
// The documentation publishes the base URL only as the `{{url}}` variable, so
// the base URL is configuration (AIRIQ_BASE_URL) supplied with the credentials.
// The login web portal is NOT assumed to be the API host.
//
// Documented endpoints (all JSON, headers `api-key` + `Authorization`):
//   POST /login            {Username, Password} → {token:"Bearer …", expiration}
//   GET  /sectors          → available origin/destination pairs
//   POST /availability     {origin, destination} → dates "DD-Mon-YYYY"
//   POST /search           {origin, destination, departure_date YYYY/MM/DD, adult, child, infant, airline_code?}
//   POST /book             {ticket_id, total_pax, adult, child, infant, adult_info[], child_info[], infant_info[]}
//   GET  /ticket?booking_id=…  → PNR, sector, passengers, total_amount
// No revalidation, cancellation or refund endpoint is documented: revalidation
// is a fresh /search for the same ticket_id, and cancellations are handled
// offline by the flight desk.

const SEARCH_TIMEOUT_MS = 20_000;
const BOOK_TIMEOUT_MS = 90_000;

export class AirIqError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

export function airiqConfig() {
  const baseUrl = (process.env["AIRIQ_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env["AIRIQ_API_KEY"] ?? "").trim();
  const username = (process.env["AIRIQ_USERNAME"] ?? "").trim();
  const password = (process.env["AIRIQ_PASSWORD"] ?? "").trim();
  const missing = [
    !baseUrl && "AIRIQ_BASE_URL",
    !apiKey && "AIRIQ_API_KEY",
    !username && "AIRIQ_USERNAME",
    !password && "AIRIQ_PASSWORD",
  ].filter(Boolean) as string[];
  return {
    baseUrl,
    apiKey,
    username,
    password,
    missing,
    configured: missing.length === 0,
    // Ticketing deducts real agency balance — it stays off until explicitly authorised.
    bookingEnabled: (process.env["AIRIQ_BOOKING_ENABLED"] ?? "").trim().toLowerCase() === "true",
  };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function rawCall(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; token?: string; timeoutMs: number },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const cfg = airiqConfig();
  if (!cfg.configured) throw new AirIqError(`Not configured: missing ${cfg.missing.join(", ")}`, null, false);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": cfg.apiKey,
        ...(init.token ? { Authorization: init.token } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = { message: text.slice(0, 300) };
    }
    return { status: res.status, json };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new AirIqError(aborted ? "Supplier timed out" : "Supplier unreachable", null, true);
  } finally {
    clearTimeout(t);
  }
}

async function login(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const cfg = airiqConfig();
  const { status, json } = await rawCall("/login", {
    method: "POST",
    body: { Username: cfg.username, Password: cfg.password },
    timeoutMs: SEARCH_TIMEOUT_MS,
  });
  const token = typeof json["token"] === "string" ? (json["token"] as string) : "";
  if (status !== 200 || !token) {
    throw new AirIqError(`Login failed (HTTP ${status})`, status, status >= 500);
  }
  const ttl = Number(json["expiration"] ?? 3599);
  cachedToken = { value: token.startsWith("Bearer ") ? token : `Bearer ${token}`, expiresAt: Date.now() + ttl * 1000 };
  return cachedToken.value;
}

/** Authenticated call. Idempotent reads retry on timeouts/5xx; bookings never retry blindly. */
async function call(
  path: string,
  opts: { method: "GET" | "POST"; body?: unknown; idempotent: boolean; timeoutMs?: number },
) {
  const attempts = opts.idempotent ? 3 : 1;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      let token = await login();
      let r = await rawCall(path, { ...opts, token, timeoutMs: opts.timeoutMs ?? SEARCH_TIMEOUT_MS });
      if (r.status === 401) {
        token = await login(true);
        r = await rawCall(path, { ...opts, token, timeoutMs: opts.timeoutMs ?? SEARCH_TIMEOUT_MS });
      }
      if (r.status >= 500) throw new AirIqError(`Supplier HTTP ${r.status}`, r.status, true);
      const code = String(r.json["code"] ?? r.status);
      if (r.status !== 200 || (code !== "200" && r.json["status"] !== "success")) {
        const msg = typeof r.json["message"] === "string" ? (r.json["message"] as string) : `HTTP ${r.status}`;
        throw new AirIqError(msg, r.status, false);
      }
      return r.json;
    } catch (e) {
      last = e;
      if (!(e instanceof AirIqError) || !e.retriable || i === attempts - 1) break;
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new AirIqError("Supplier error", null, false);
}

export type AirIqFare = {
  ticketId: string;
  origin: string;
  destination: string;
  airline: string;
  flightNumber: string;
  route: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  seats: number;
  price: number;
  infantPrice: number;
  cabinBaggage: string | null;
  handLuggage: string | null;
  international: boolean;
};

function toFare(r: Record<string, unknown>): AirIqFare {
  return {
    ticketId: String(r["ticket_id"] ?? ""),
    origin: String(r["origin"] ?? ""),
    destination: String(r["destination"] ?? ""),
    airline: String(r["airline"] ?? ""),
    flightNumber: String(r["flight_number"] ?? ""),
    route: String(r["flight_route"] ?? ""),
    departureDate: String(r["departure_date"] ?? ""),
    departureTime: String(r["departure_time"] ?? ""),
    arrivalDate: String(r["arival_date"] ?? r["arrival_date"] ?? ""),
    arrivalTime: String(r["arival_time"] ?? r["arrival_time"] ?? ""),
    seats: Number(r["pax"] ?? 0),
    price: Number(r["price"] ?? 0),
    infantPrice: Number(r["infant_price"] ?? 0),
    cabinBaggage: r["cabin_baggage"] ? String(r["cabin_baggage"]) : null,
    handLuggage: r["hand_luggage"] ? String(r["hand_luggage"]) : null,
    international: r["isinternational"] === true,
  };
}

export async function airiqSectors() {
  const j = await call("/sectors", { method: "GET", idempotent: true });
  const rows = Array.isArray(j["data"]) ? (j["data"] as Record<string, unknown>[]) : [];
  return rows.map((r) => ({ label: String(r["Sector"] ?? ""), origin: String(r["Origin"] ?? ""), destination: String(r["Destination"] ?? "") }));
}

export async function airiqAvailability(origin: string, destination: string) {
  const j = await call("/availability", { method: "POST", body: { origin, destination }, idempotent: true });
  return Array.isArray(j["data"]) ? (j["data"] as unknown[]).map(String) : [];
}

export type AirIqPax = { adult: number; child: number; infant: number };

export async function airiqSearch(q: { origin: string; destination: string; date: string } & AirIqPax) {
  const j = await call("/search", {
    method: "POST",
    idempotent: true,
    body: {
      origin: q.origin,
      destination: q.destination,
      departure_date: q.date.replace(/-/g, "/"),
      adult: q.adult,
      child: q.child,
      infant: q.infant,
    },
  });
  const rows = Array.isArray(j["data"]) ? (j["data"] as Record<string, unknown>[]) : [];
  return rows.map(toFare).filter((f) => f.ticketId && f.price > 0);
}

export function fareTotal(f: Pick<AirIqFare, "price" | "infantPrice">, p: AirIqPax) {
  return f.price * (p.adult + p.child) + f.infantPrice * p.infant;
}

/** Worldway B2C markup, applied server-side only (never from the browser). */
export const WORLDWAY_MARKUP_PERCENT = 5;
/** Customer price in INR: supplier fare + 5% markup, rounded up to the rupee. */
export function customerTotal(f: Pick<AirIqFare, "price" | "infantPrice">, p: AirIqPax) {
  return Math.ceil(fareTotal(f, p) * (1 + WORLDWAY_MARKUP_PERCENT / 100));
}

export type AirIqPassenger = {
  title: string;
  first_name: string;
  last_name: string;
  dob?: string;
  passport_number?: string;
  passport_expirydate?: string;
  passport_issuing_country_code?: string;
  nationality?: string;
  travel_with?: string;
};

/** Issues the ticket (deducts agency balance). Never retried; gated by AIRIQ_BOOKING_ENABLED. */
export async function airiqBook(input: {
  ticketId: string;
  pax: AirIqPax;
  adults: AirIqPassenger[];
  children: AirIqPassenger[];
  infants: AirIqPassenger[];
}) {
  if (!airiqConfig().bookingEnabled) {
    throw new AirIqError("Ticketing is not authorised (AIRIQ_BOOKING_ENABLED is off).", null, false);
  }
  const j = await call("/book", {
    method: "POST",
    idempotent: false,
    timeoutMs: BOOK_TIMEOUT_MS,
    body: {
      ticket_id: input.ticketId,
      total_pax: String(input.pax.adult + input.pax.child + input.pax.infant),
      adult: String(input.pax.adult),
      child: String(input.pax.child),
      infant: String(input.pax.infant),
      adult_info: input.adults,
      child_info: input.children,
      infant_info: input.infants,
    },
  });
  return { bookingId: String(j["booking_id"] ?? ""), airlineCode: String(j["airline_code"] ?? "") };
}

export async function airiqTicket(bookingId: string) {
  const j = await call(`/ticket?booking_id=${encodeURIComponent(bookingId)}`, { method: "GET", idempotent: true });
  return (j["data"] ?? {}) as Record<string, unknown>;
}

/** Read-only health probe: login + sectors. Never books. */
export async function airiqHealth() {
  const cfg = airiqConfig();
  const started = Date.now();
  if (!cfg.configured) {
    return { ok: false, configured: false, bookingEnabled: cfg.bookingEnabled, missing: cfg.missing, detail: `Not connected — missing ${cfg.missing.join(", ")}.`, ms: 0, sectors: 0 };
  }
  try {
    cachedToken = null;
    const sectors = await airiqSectors();
    return { ok: true, configured: true, bookingEnabled: cfg.bookingEnabled, missing: [], detail: `Login OK, ${sectors.length} sectors available.`, ms: Date.now() - started, sectors: sectors.length };
  } catch (e) {
    return { ok: false, configured: true, bookingEnabled: cfg.bookingEnabled, missing: [], detail: e instanceof Error ? e.message : "Probe failed", ms: Date.now() - started, sectors: 0 };
  }
}
