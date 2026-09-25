/**
 * Viator diagnostic trace helpers (pure, client-safe).
 *
 * Everything recorded for Viator Tech Support passes through `sanitizeForTrace`
 * first: API keys, payment/session tokens, card/billing data and personal data
 * (names, email, phone, booking-question answers, addresses) are redacted.
 */

const REDACTED = "[REDACTED]";

/** Keys whose values are always removed, matched case-insensitively. */
const SECRET_KEYS = new Set(
  [
    "exp-api-key",
    "apikey",
    "api_key",
    "authorization",
    "paymenttoken",
    "paymentsessiontoken",
    "sessiontoken",
    "token",
    "accesstoken",
    "firstname",
    "lastname",
    "fullname",
    "name",
    "email",
    "phone",
    "phonenumber",
    "answer",
    "address",
    "postalcode",
    "zip",
    "cardnumber",
    "cvv",
    "cvc",
    "expiry",
    "cardholdername",
    "ipaddress",
    "clientip",
    "useragent",
    "dateofbirth",
    "passport",
    "passportnumber",
  ].map((k) => k.toLowerCase()),
);

/** Sub-objects that are pure PII containers — replaced wholesale. */
const PII_CONTAINERS = new Set(["bookerinfo", "communication", "travelers", "travellers", "fraudpreventiondetails", "billing"]);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

function scrubString(s: string): string {
  return s.replace(EMAIL_RE, "[EMAIL]").replace(CARD_RE, "[NUMBER]");
}

export function sanitizeForTrace(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[TRUNCATED]";
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value).slice(0, 2000);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeForTrace(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (PII_CONTAINERS.has(lk)) {
      out[k] = v == null ? v : REDACTED;
    } else if (SECRET_KEYS.has(lk)) {
      out[k] = v == null || v === "" ? v : REDACTED;
    } else {
      out[k] = sanitizeForTrace(v, depth + 1);
    }
  }
  return out;
}

/** Response headers useful for correlating a call with Viator's own logs. */
export function pickCorrelationHeaders(h: Headers | Record<string, string>): Record<string, string> {
  const entries: [string, string][] =
    h instanceof Headers ? Array.from(h.entries()) : Object.entries(h);
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (/request-?id|trace|correlation|unique-?id|tracking|cf-ray|x-amzn|^date$/i.test(k)) {
      out[k.toLowerCase()] = v.slice(0, 300);
    }
  }
  return out;
}

/** Viator error bodies carry a `trackingId` — pull it out for the support ticket. */
export function extractTrackingId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const t = b["trackingId"] ?? b["tracking_id"] ?? b["requestId"];
  return typeof t === "string" ? t : null;
}

/** Paths in the booking chain that are traced (content search is not). */
export function isTracedViatorPath(path: string): boolean {
  return path.startsWith("/availability/check") || path.startsWith("/bookings/");
}

export type ClientCheckoutEvent =
  | "SCRIPT_LOADED"
  | "SCRIPT_LOAD_FAILED"
  | "IFRAME_INIT"
  | "IFRAME_INIT_FAILED"
  | "FORM_LOADED"
  | "FORM_ERROR"
  | "FORM_OVERDUE"
  | "SUBMIT_STARTED"
  | "SUBMIT_FAILED"
  | "TOKEN_RECEIVED";

export const CLIENT_CHECKOUT_EVENTS: readonly ClientCheckoutEvent[] = [
  "SCRIPT_LOADED",
  "SCRIPT_LOAD_FAILED",
  "IFRAME_INIT",
  "IFRAME_INIT_FAILED",
  "FORM_LOADED",
  "FORM_ERROR",
  "FORM_OVERDUE",
  "SUBMIT_STARTED",
  "SUBMIT_FAILED",
  "TOKEN_RECEIVED",
];
