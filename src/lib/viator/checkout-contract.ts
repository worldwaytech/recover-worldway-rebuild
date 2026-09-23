/**
 * Pure, client-safe contract helpers for the Viator hosted payment iFrame flow.
 * Everything here is deterministic so it can be unit tested without network or
 * database access, and reused by both the browser component and the server
 * functions (single source of truth for validation).
 */

export const VIATOR_PAYMENT_SCRIPT_URL =
  "https://checkout-assets.payments.tamg.cloud/stable/v2/payment.js";

/** Viator requires `hostingUrl` to be the *origin* only — it is matched against window.location.origin. */
export function normaliseHostingUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("hostingUrl must be https");
  }
  return url.origin;
}

/** Canonical production origin used when the request origin cannot be trusted. */
export const CANONICAL_HOSTING_ORIGIN = "https://www.worldwaytravelsgroup.com";

/**
 * Origins that may host the Viator payment iFrame. Both www and apex are
 * allowed because Viator compares `hostingUrl` with the page's exact
 * `window.location.origin` — a guest on the apex domain must not be sent a
 * session bound to the www origin (or vice versa).
 */
export const HOSTING_ORIGIN_ALLOWLIST: readonly string[] = [
  CANONICAL_HOSTING_ORIGIN,
  "https://worldwaytravelsgroup.com",
  "https://recover-worldway-rebuild.lovable.app",
];

/** Lovable preview / stable project hosts (https only). */
const PREVIEW_HOST_RE =
  /^(id-preview--|project--)[a-z0-9-]+(-dev)?\.lovable\.app$/i;

function isAllowedOrigin(origin: string, extra: readonly string[]): boolean {
  if (extra.includes(origin) || HOSTING_ORIGIN_ALLOWLIST.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return PREVIEW_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolves the `hostingUrl` for a cart hold.
 * Priority: the requesting page's own origin (Origin, else Referer) when it is
 * on the allowlist → the configured VIATOR_HOSTING_URL → canonical www origin.
 * Never echoes an arbitrary caller-supplied origin back to the supplier.
 */
export function resolveHostingOrigin(input: {
  originHeader?: string | null | undefined;
  refererHeader?: string | null | undefined;
  configuredUrl?: string | null | undefined;
}): string {
  const extra: string[] = [];
  let configured: string | null = null;
  if (input.configuredUrl) {
    try {
      configured = normaliseHostingUrl(input.configuredUrl);
      extra.push(configured);
    } catch {
      configured = null;
    }
  }
  for (const raw of [input.originHeader, input.refererHeader]) {
    if (!raw || raw === "null") continue;
    try {
      const origin = normaliseHostingUrl(raw);
      if (isAllowedOrigin(origin, extra)) return origin;
    } catch {
      /* ignore malformed header */
    }
  }
  return configured ?? CANONICAL_HOSTING_ORIGIN;
}

export type PaxMix = { ageBand: "ADULT" | "CHILD" | "INFANT" | "SENIOR" | "YOUTH"; count: number }[];

export type HoldRequestInput = {
  productCode: string;
  travelDate: string;
  currency: string;
  paxMix: PaxMix;
  productOptionCode?: string | undefined;
  startTime?: string | undefined;
  languageGuide?: { type: string; language: string } | undefined;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const PRODUCT_CODE_RE = /^[A-Za-z0-9_-]{3,40}$/;

export function validateHoldInput(input: HoldRequestInput): HoldRequestInput {
  if (!PRODUCT_CODE_RE.test(input.productCode)) throw new Error("Invalid product code.");
  if (!DATE_RE.test(input.travelDate)) throw new Error("Travel date must be YYYY-MM-DD.");
  const currency = input.currency.trim().toUpperCase();
  if (!CURRENCY_RE.test(currency)) throw new Error("Currency must be a 3-letter ISO code.");

  const paxMix = input.paxMix
    .map((p) => ({ ageBand: p.ageBand, count: Math.trunc(p.count) }))
    .filter((p) => p.count > 0);
  const travellers = paxMix.reduce((sum, p) => sum + p.count, 0);
  if (travellers < 1) throw new Error("At least one traveller is required.");
  if (travellers > 30) throw new Error("Maximum 30 travellers per booking.");
  if (!paxMix.some((p) => p.ageBand === "ADULT" || p.ageBand === "SENIOR")) {
    throw new Error("At least one adult traveller is required.");
  }

  return {
    productCode: input.productCode,
    travelDate: input.travelDate,
    currency,
    paxMix,
    ...(input.productOptionCode ? { productOptionCode: input.productOptionCode } : {}),
    ...(input.startTime ? { startTime: input.startTime } : {}),
    ...(input.languageGuide ? { languageGuide: input.languageGuide } : {}),
  };
}

export type BillingDetails = {
  /** ISO 3166-1 alpha-2 */
  country: string;
  postalCode: string;
};

const COUNTRY_RE = /^[A-Z]{2}$/;
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}$/;

export function validateBillingDetails(input: BillingDetails): BillingDetails {
  const country = input.country.trim().toUpperCase();
  if (!COUNTRY_RE.test(country)) throw new Error("Billing country must be a 2-letter ISO code.");
  const postalCode = input.postalCode.trim();
  if (!POSTAL_RE.test(postalCode)) throw new Error("Billing postal code is invalid.");
  return { country, postalCode };
}

export type BookerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | undefined;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Viator requires `communication.phone` in international format, starting with
 * `+` followed by the country code (E.164). Anything else is rejected by the
 * supplier at booking time, so we reject it before the call.
 */
const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Normalises user input to E.164, keeping only `+` and digits. */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s().-]/g, "");
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${plus ? "+" : ""}${digits}` : "";
}

export function isValidInternationalPhone(raw: string): boolean {
  return E164_RE.test(normalisePhone(raw));
}

export function validateBooker(input: BookerInput): Required<BookerInput> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalisePhone(input.phone ?? "");
  if (firstName.length < 1 || lastName.length < 1) throw new Error("Booker name is required.");
  if (!EMAIL_RE.test(email)) throw new Error("A valid booker email is required.");
  if (!phone) {
    throw new Error("A contact phone number in international format (e.g. +971501234567) is required.");
  }
  if (!E164_RE.test(phone)) {
    throw new Error("Phone number must start with + and the country code (e.g. +971501234567).");
  }
  return { firstName, lastName, email, phone };
}

/**
 * Viator `fraudPreventionDetails` — the officially supported fields only.
 * Values come from configuration/account data, never invented per booking.
 */
export type FraudPreventionDetails = {
  subChannelId?: string;
  agencyId?: string;
  agentId?: string;
  /** How the voucher reaches the traveller. */
  voucherDeliveryType?: "EMAIL" | "TEXT" | "PRINTED" | "OTHER";
  /** ISO date the customer's account was created, when known. */
  customerMemberSince?: string;
};

/** UI/persistence state for an activity booking. */
export type ActivityBookingState =
  | "held"
  | "hold_expired"
  | "paid_pending_confirmation"
  | "confirmed"
  | "rejected"
  | "failed";

/**
 * Maps Viator statuses to our internal state.
 *
 * Official values (BookingBookStatus / BookingStatusResponse.status):
 * CONFIRMED, PENDING, REJECTED, CANCELED, IN_PROGRESS, ON_HOLD, FAILED.
 * PENDING / IN_PROGRESS / ON_HOLD are *not* final — they must be resolved by
 * polling /bookings/status, never treated as a failure.
 */
export function mapViatorBookingStatus(statuses: readonly string[]): ActivityBookingState {
  const upper = statuses.map((s) => (s ?? "").trim().toUpperCase()).filter(Boolean);
  if (!upper.length) return "failed";
  if (upper.some((s) => s === "FAILED" || s === "ERROR")) return "failed";
  if (upper.some((s) => s === "REJECTED" || s === "DECLINED" || s === "CANCELLED" || s === "CANCELED")) {
    return "rejected";
  }
  if (upper.every((s) => s === "CONFIRMED" || s === "AMENDED")) return "confirmed";
  return "paid_pending_confirmation";
}

/** True while Viator has not reached a final outcome for the booking. */
export function isTransientViatorStatus(status: string): boolean {
  const s = (status ?? "").trim().toUpperCase();
  return s === "PENDING" || s === "IN_PROGRESS" || s === "ON_HOLD" || s === "";
}

/** A hold is usable while it has not expired (with a small safety margin). */
export function isHoldUsable(
  expiresAtIso: string | null | undefined,
  now: Date = new Date(),
  safetyMarginMs = 20_000,
): boolean {
  if (!expiresAtIso) return true;
  const expiry = Date.parse(expiresAtIso);
  if (Number.isNaN(expiry)) return true;
  return expiry - safetyMarginMs > now.getTime();
}

/** Terminal states may never be re-booked or transitioned backwards. */
export function isTerminalState(state: ActivityBookingState): boolean {
  return state === "confirmed" || state === "rejected" || state === "hold_expired";
}

/**
 * Decides whether a `cart/book` call may proceed for a stored record.
 * Fails closed: anything already paid/confirmed is never charged twice.
 */
export function canSubmitBooking(record: {
  state: ActivityBookingState;
  holdExpiresAt?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (record.state === "confirmed") return { ok: false, reason: "This booking is already confirmed." };
  if (record.state === "rejected") return { ok: false, reason: "This booking was rejected by the supplier." };
  if (record.state === "paid_pending_confirmation") {
    return { ok: false, reason: "This booking is already submitted and awaiting confirmation." };
  }
  if (record.state === "hold_expired" || !isHoldUsable(record.holdExpiresAt)) {
    return { ok: false, reason: "The availability hold expired — please search again." };
  }
  return { ok: true };
}

/** Cent-safe money comparison for verifying the amount Viator quoted vs. what we show. */
export function sameAmount(a: number, b: number, toleranceMinorUnits = 1): boolean {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= toleranceMinorUnits;
}
