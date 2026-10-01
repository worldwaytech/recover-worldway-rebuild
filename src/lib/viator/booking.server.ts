// Server-only Viator Partner API v2 booking chain (hold -> hosted payment -> book -> status).
// The API key never leaves the server; the browser only ever receives the
// short-lived paymentSessionToken required by Viator's hosted payment iFrame.

import {
  VIATOR_BOOKING_ACCESS_MESSAGE,
  VIATOR_BOOKING_TIMEOUT_MS,
  isViatorEndpointDenied,
  viatorFetch,
} from "@/lib/viator.server";

/** Maps the supplier's entitlement 403 to a customer-safe explanation. */
function bookingError(status: number, error?: string): string | undefined {
  if (isViatorEndpointDenied(status, error)) return VIATOR_BOOKING_ACCESS_MESSAGE;
  return error;
}
import {
  resolveHostingOrigin,
  type HoldRequestInput,
  type BookerInput,
  type FraudPreventionDetails,
  type PaxMix,
} from "@/lib/viator/checkout-contract";

/**
 * Origin the payment iFrame will be hosted on. Derived from the requesting
 * page's own origin (allowlisted: www + apex production domains, published and
 * preview hosts), falling back to VIATOR_HOSTING_URL, then the canonical www
 * origin. Reads request headers when called inside a server function.
 */
export async function viatorHostingOrigin(): Promise<string> {
  let originHeader: string | undefined;
  let refererHeader: string | undefined;
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    originHeader = getRequestHeader("origin");
    refererHeader = getRequestHeader("referer");
  } catch {
    /* no request context (tests / scripts) */
  }
  return resolveHostingOrigin({
    originHeader,
    refererHeader,
    configuredUrl: process.env["VIATOR_HOSTING_URL"] ?? process.env["PUBLIC_SITE_URL"],
  });
}

function pick<T>(obj: unknown, keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k] as T;
  }
  return undefined;
}

// ---------------------------------------------------------------- availability

export type AvailabilityCheck = {
  ok: boolean;
  error?: string;
  available: boolean;
  currency: string;
  /** Total price for the requested pax mix, in major units. */
  total: number | null;
  productOptionCode: string | null;
  startTime: string | null;
};

export async function viatorCheckAvailability(
  input: HoldRequestInput,
): Promise<AvailabilityCheck> {
  const body = {
    productCode: input.productCode,
    travelDate: input.travelDate,
    currency: input.currency,
    paxMix: input.paxMix.map((p) => ({ ageBand: p.ageBand, numberOfTravelers: p.count })),
    ...(input.productOptionCode ? { productOptionCode: input.productOptionCode } : {}),
    ...(input.startTime ? { startTime: input.startTime } : {}),
  };
  const res = await viatorFetch<unknown>("/availability/check", { method: "POST", body });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      ...(res.error ? { error: res.error } : {}),
      available: false,
      currency: input.currency,
      total: null,
      productOptionCode: input.productOptionCode ?? null,
      startTime: input.startTime ?? null,
    };
  }
  const data = res.data as Record<string, unknown>;
  // Viator lists every slot; only items with available !== false can be held.
  const bookable = (pick<Record<string, unknown>[]>(data, ["bookableItems"]) ?? []).filter(
    (i) => i["available"] !== false,
  );
  const first = bookable[0];
  const lineItems = pick<Record<string, unknown>[]>(first, ["lineItems"]) ?? [];
  const priceObj =
    pick<Record<string, unknown>>(first, ["totalPrice", "price"]) ??
    pick<Record<string, unknown>>(data, ["totalPrice"]);
  const priceLeaf = pick<Record<string, unknown>>(priceObj, ["price"]) ?? priceObj;
  const total =
    pick<number>(priceLeaf, ["recommendedRetailPrice", "partnerTotalPrice", "total", "amount"]) ??
    null;
  const startTime =
    pick<string>(first, ["startTime"]) ??
    pick<string>(lineItems[0], ["startTime"]) ??
    input.startTime ??
    null;

  return {
    ok: true,
    available: Boolean(bookable.length),
    currency: pick<string>(data, ["currency"]) ?? input.currency,
    total,
    productOptionCode:
      pick<string>(first, ["productOptionCode"]) ?? input.productOptionCode ?? null,
    startTime,
  };
}

// -------------------------------------------------------------------- cart/hold

export type CartHold = {
  ok: boolean;
  error?: string;
  cartRef: string;
  /** Token consumed by window.Payment.init() in the browser. */
  paymentSessionToken: string;
  sessionExpiresAt: string | null;
  holdExpiresAt: string | null;
  currency: string;
  total: number | null;
  /** Viator returns one bookable (or rejected) item per requested item. */
  items: {
    partnerBookingRef: string;
    bookingRef: string | null;
    status: string;
    rejectionReason: string | null;
  }[];
  /** Origin sent to Viator as `hostingUrl` (for audit/diagnostics). */
  hostingUrl: string;
  /** Worldway's cost for the held cart (partnerTotalPrice), when returned. */
  cost: number | null;
};

export async function viatorCartHold(input: {
  hold: HoldRequestInput;
  partnerCartRef: string;
  /** Our own unique booking reference — reused on retry so no duplicate is created. */
  partnerBookingRef: string;
  booker: BookerInput;
  /**
   * VIATOR_FORM = Viator's hosted card form (merchant accounts).
   * NONE = Worldway collects payment itself (Affiliate Full + Booking); Viator
   * rejects any payment submission mode on those accounts.
   */
  paymentSubmission?: "VIATOR_FORM" | "NONE";
}): Promise<CartHold> {
  const { hold } = input;
  const viatorForm = (input.paymentSubmission ?? "VIATOR_FORM") === "VIATOR_FORM";
  const hostingUrl = viatorForm ? await viatorHostingOrigin() : "";
  const body = {
    currency: hold.currency,
    partnerCartRef: input.partnerCartRef,
    ...(viatorForm ? { hostingUrl, paymentDataSubmissionMode: "VIATOR_FORM" } : {}),
    bookerInfo: {
      firstName: input.booker.firstName,
      lastName: input.booker.lastName,
    },
    communication: {
      email: input.booker.email,
      ...(input.booker.phone ? { phone: input.booker.phone } : {}),
    },
    items: [
      {
        partnerBookingRef: input.partnerBookingRef,
        productCode: hold.productCode,
        travelDate: hold.travelDate,
        paxMix: hold.paxMix.map((p) => ({ ageBand: p.ageBand, numberOfTravelers: p.count })),
        ...(hold.productOptionCode ? { productOptionCode: hold.productOptionCode } : {}),
        ...(hold.startTime ? { startTime: hold.startTime } : {}),
        ...(hold.languageGuide ? { languageGuide: hold.languageGuide } : {}),
      },
    ],
  };

  const res = await viatorFetch<unknown>("/bookings/cart/hold", {
    method: "POST",
    body,
    timeoutMs: VIATOR_BOOKING_TIMEOUT_MS,
  });
  const empty: CartHold = {
    ok: false,
    cartRef: "",
    paymentSessionToken: "",
    sessionExpiresAt: null,
    holdExpiresAt: null,
    currency: hold.currency,
    total: null,
    items: [],
    hostingUrl,
    cost: null,
  };
  if (!res.ok || !res.data) {
    const error = bookingError(res.status, res.error);
    return { ...empty, ...(error ? { error } : {}) };
  }

  const data = res.data as Record<string, unknown>;
  const paymentSession =
    pick<Record<string, unknown>>(data, ["paymentSessionDetails", "paymentSession"]) ?? data;
  const token =
    pick<string>(paymentSession, [
      "paymentSessionToken",
      "paymentToken",
      "sessionToken",
      "token",
    ]) ?? "";
  const cartRef = pick<string>(data, ["cartRef", "cartReference"]) ?? "";
  const rawItems = pick<Record<string, unknown>[]>(data, ["items", "bookings"]) ?? [];
  const priceObj = pick<Record<string, unknown>>(data, [
    "totalHeldPrice",
    "totalPrice",
    "cartPrice",
  ]);
  const priceLeaf = pick<Record<string, unknown>>(priceObj, ["price"]) ?? priceObj;

  if (!cartRef || (viatorForm && !token)) {
    return { ...empty, error: "Viator did not return a payment session for this cart." };
  }

  const items = rawItems.map((i) => {
    const holdInfo = pick<Record<string, unknown>>(i, ["bookingHoldInfo"]);
    const pricingHold = pick<Record<string, unknown>>(holdInfo, ["pricing"]);
    return {
      partnerBookingRef:
        pick<string>(i, ["partnerBookingRef", "partnerItemRef", "itemRef"]) ??
        input.partnerBookingRef,
      bookingRef: pick<string>(i, ["bookingRef", "bookingReference"]) ?? null,
      status: pick<string>(i, ["status"]) ?? "",
      rejectionReason: pick<string>(i, ["rejectionReason", "reason"]) ?? null,
      holdExpiry:
        pick<string>(holdInfo, ["availabilityHoldExpiry", "expiry", "expiresAt"]) ??
        pick<string>(i, ["holdExpiryTime", "expiresAt"]) ??
        pick<string>(pricingHold, ["validUntil"]) ??
        null,
    };
  });

  const rejected = items.filter((i) => i.status.toUpperCase() === "REJECTED");
  if (items.length && rejected.length === items.length) {
    return {
      ...empty,
      items: items.map(({ holdExpiry: _h, ...rest }) => rest),
      error:
        rejected[0]?.rejectionReason ??
        "This experience is no longer available for the selected date and travellers.",
    };
  }

  return {
    ok: true,
    cartRef,
    paymentSessionToken: token,
    sessionExpiresAt:
      pick<string>(paymentSession, ["expiresAt", "sessionExpiryTime", "expiryTime"]) ?? null,
    holdExpiresAt:
      pick<string>(data, ["holdExpiryTime", "expiresAt", "cartExpiryTime"]) ??
      items.find((i) => i.holdExpiry)?.holdExpiry ??
      null,
    currency: pick<string>(data, ["currency"]) ?? hold.currency,
    total:
      pick<number>(priceLeaf, [
        "recommendedRetailPrice",
        "partnerTotalPrice",
        "total",
        "amount",
      ]) ?? null,
    items: items.map(({ holdExpiry: _h, ...rest }) => rest),
    hostingUrl,
    cost: pick<number>(priceLeaf, ["partnerTotalPrice"]) ?? null,
  };
}

// -------------------------------------------------------------------- cart/book

export type ViatorVoucherInfo = {
  url: string | null;
  format: string | null;
  type: string | null;
  /** true → Viator flagged the transaction; the voucher must be delivered securely. */
  isVoucherRestrictionRequired: boolean;
};

export type CartBook = {
  ok: boolean;
  error?: string;
  /** True when the call timed out / 5xx'd — the booking may still exist. */
  indeterminate?: boolean;
  statuses: string[];
  bookingRef: string | null;
  itineraryRef: string | null;
  voucherInfo: ViatorVoucherInfo | null;
  raw: unknown;
};

function readVoucherInfo(source: unknown): ViatorVoucherInfo | null {
  const v = pick<Record<string, unknown>>(source, ["voucherInfo"]);
  if (!v) return null;
  return {
    url: pick<string>(v, ["url"]) ?? null,
    format: pick<string>(v, ["format"]) ?? null,
    type: pick<string>(v, ["type"]) ?? null,
    isVoucherRestrictionRequired: pick<boolean>(v, ["isVoucherRestrictionRequired"]) === true,
  };
}

export async function viatorCartBook(input: {
  cartRef: string;
  /** Omitted for Worldway-collected payment (Affiliate Full + Booking). */
  paymentToken?: string;
  booker: Required<BookerInput>;
  items: {
    /** Viator-generated bookingRef from cart/hold. */
    bookingRef: string;
    languageGuide?: { type: string; language: string } | undefined;
    bookingQuestionAnswers?: {
      question: string;
      answer: string;
      travelerNum?: number;
      unit?: string;
    }[];
  }[];
  fraudPreventionDetails?: FraudPreventionDetails | undefined;
}): Promise<CartBook> {
  const body = {
    cartRef: input.cartRef,
    ...(input.paymentToken ? { paymentToken: input.paymentToken } : {}),
    bookerInfo: { firstName: input.booker.firstName, lastName: input.booker.lastName },
    communication: {
      email: input.booker.email,
      phone: input.booker.phone,
    },
    ...(input.fraudPreventionDetails &&
    Object.keys(input.fraudPreventionDetails).length
      ? { additionalBookingDetails: { fraudPreventionDetails: input.fraudPreventionDetails } }
      : {}),
    items: input.items.map((item) => ({
      bookingRef: item.bookingRef,
      ...(item.languageGuide ? { languageGuide: item.languageGuide } : {}),
      bookingQuestionAnswers: item.bookingQuestionAnswers ?? [],
    })),
  };

  const res = await viatorFetch<unknown>("/bookings/cart/book", {
    method: "POST",
    body,
    timeoutMs: VIATOR_BOOKING_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) {
    const error = bookingError(res.status, res.error);
    /**
     * Viator: a timeout or 5xx does NOT mean the booking failed. The caller must
     * resolve the real outcome via /bookings/status using the same reference and
     * must never blindly retry the booking.
     */
    const indeterminate = res.timedOut === true || res.status >= 500;
    return {
      ok: false,
      ...(error ? { error } : {}),
      ...(indeterminate ? { indeterminate: true } : {}),
      statuses: [],
      bookingRef: null,
      itineraryRef: null,
      voucherInfo: null,
      raw: null,
    };
  }
  const data = res.data as Record<string, unknown>;
  const items = pick<Record<string, unknown>[]>(data, ["items", "bookings"]) ?? [];
  const statuses = items
    .map((i) => pick<string>(i, ["status", "bookingStatus"]) ?? "")
    .filter(Boolean);
  return {
    ok: true,
    statuses: statuses.length ? statuses : [pick<string>(data, ["status"]) ?? "PENDING"],
    bookingRef: pick<string>(items[0], ["bookingRef", "bookingReference"]) ?? null,
    itineraryRef:
      pick<string>(data, ["itineraryRef", "itineraryReference"]) ??
      pick<string>(items[0], ["itineraryRef"]) ??
      null,
    voucherInfo: readVoucherInfo(data) ?? readVoucherInfo(items[0]),
    raw: data,
  };
}

// -------------------------------------------------------------------- status

export type ViatorBookingStatus = {
  ok: boolean;
  error?: string;
  statuses: string[];
  /** Viator's hint for when to poll again for a non-final status. */
  nextPollAt: string | null;
  voucherInfo: ViatorVoucherInfo | null;
};

/**
 * Authoritative booking outcome. `/bookings/status` takes ONE reference —
 * either Viator's `bookingRef` or our own `partnerBookingRef` (which lets us
 * resolve a booking even when the book call timed out before returning a ref).
 */
export async function viatorBookingStatus(
  ref: string | { bookingRef?: string; partnerBookingRef?: string },
): Promise<ViatorBookingStatus> {
  const body =
    typeof ref === "string"
      ? { bookingRef: ref }
      : ref.bookingRef
        ? { bookingRef: ref.bookingRef }
        : { partnerBookingRef: ref.partnerBookingRef };
  if (!body.bookingRef && !body.partnerBookingRef) {
    return { ok: false, error: "A booking reference is required.", statuses: [], nextPollAt: null, voucherInfo: null };
  }
  const res = await viatorFetch<unknown>("/bookings/status", {
    method: "POST",
    body,
    timeoutMs: VIATOR_BOOKING_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) {
    const error = bookingError(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), statuses: [], nextPollAt: null, voucherInfo: null };
  }
  const data = res.data as Record<string, unknown>;
  const items = pick<Record<string, unknown>[]>(data, ["bookings", "items"]) ?? [];
  const statuses = items.length
    ? items.map((i) => pick<string>(i, ["status", "bookingStatus"]) ?? "").filter(Boolean)
    : [pick<string>(data, ["status"]) ?? ""].filter(Boolean);
  return {
    ok: true,
    statuses,
    nextPollAt: pick<string>(data, ["nextPollAt"]) ?? pick<string>(items[0], ["nextPollAt"]) ?? null,
    voucherInfo: readVoucherInfo(data) ?? readVoucherInfo(items[0]),
  };
}

/** Builds a traveller list for the pax mix, padding names from the booker. */
export function travellersFromPaxMix(
  paxMix: PaxMix,
  booker: BookerInput,
  provided: { firstName: string; lastName: string; ageBand?: string }[] = [],
): { bandId?: string; firstName: string; lastName: string }[] {
  const out: { bandId?: string; firstName: string; lastName: string }[] = [];
  let idx = 0;
  for (const band of paxMix) {
    for (let i = 0; i < band.count; i += 1) {
      const p = provided[idx];
      out.push({
        bandId: band.ageBand,
        firstName: p?.firstName?.trim() || booker.firstName,
        lastName: p?.lastName?.trim() || booker.lastName,
      });
      idx += 1;
    }
  }
  return out;
}
