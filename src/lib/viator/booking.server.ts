// Server-only Viator Partner API v2 booking chain (hold -> hosted payment -> book -> status).
// The API key never leaves the server; the browser only ever receives the
// short-lived paymentSessionToken required by Viator's hosted payment iFrame.

import {
  VIATOR_BOOKING_ACCESS_MESSAGE,
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
  const bookable = pick<Record<string, unknown>[]>(data, ["bookableItems"]) ?? [];
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
  items: { itemRef: string; bookingRef: string | null }[];
  /** Origin sent to Viator as `hostingUrl` (for audit/diagnostics). */
  hostingUrl: string;
};

export async function viatorCartHold(input: {
  hold: HoldRequestInput;
  partnerCartRef: string;
  partnerItemRef: string;
  booker: BookerInput;
}): Promise<CartHold> {
  const { hold } = input;
  const hostingUrl = await viatorHostingOrigin();
  const body = {
    currency: hold.currency,
    partnerCartRef: input.partnerCartRef,
    hostingUrl,
    paymentDataSubmissionMode: "VIATOR_FORM",
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
        partnerItemRef: input.partnerItemRef,
        productCode: hold.productCode,
        travelDate: hold.travelDate,
        currency: hold.currency,
        paxMix: hold.paxMix.map((p) => ({ ageBand: p.ageBand, numberOfTravelers: p.count })),
        ...(hold.productOptionCode ? { productOptionCode: hold.productOptionCode } : {}),
        ...(hold.startTime ? { startTime: hold.startTime } : {}),
        ...(hold.languageGuide ? { languageGuide: hold.languageGuide } : {}),
      },
    ],
  };

  const res = await viatorFetch<unknown>("/bookings/cart/hold", { method: "POST", body });
  const empty: CartHold = {
    ok: false,
    cartRef: "",
    paymentSessionToken: "",
    sessionExpiresAt: null,
    holdExpiresAt: null,
    currency: hold.currency,
    total: null,
    items: [],
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
  const priceObj = pick<Record<string, unknown>>(data, ["totalPrice", "cartPrice"]);
  const priceLeaf = pick<Record<string, unknown>>(priceObj, ["price"]) ?? priceObj;

  if (!cartRef || !token) {
    return { ...empty, error: "Viator did not return a payment session for this cart." };
  }

  return {
    ok: true,
    cartRef,
    paymentSessionToken: token,
    sessionExpiresAt:
      pick<string>(paymentSession, ["expiresAt", "sessionExpiryTime", "expiryTime"]) ?? null,
    holdExpiresAt:
      pick<string>(data, ["holdExpiryTime", "expiresAt", "cartExpiryTime"]) ??
      pick<string>(rawItems[0], ["holdExpiryTime", "expiresAt"]) ??
      null,
    currency: pick<string>(data, ["currency"]) ?? hold.currency,
    total:
      pick<number>(priceLeaf, [
        "recommendedRetailPrice",
        "partnerTotalPrice",
        "total",
        "amount",
      ]) ?? null,
    items: rawItems.map((i) => ({
      itemRef: pick<string>(i, ["partnerItemRef", "itemRef"]) ?? input.partnerItemRef,
      bookingRef: pick<string>(i, ["bookingRef", "bookingReference"]) ?? null,
    })),
  };
}

// -------------------------------------------------------------------- cart/book

export type CartBook = {
  ok: boolean;
  error?: string;
  statuses: string[];
  bookingRef: string | null;
  itineraryRef: string | null;
  raw: unknown;
};

export async function viatorCartBook(input: {
  cartRef: string;
  paymentToken: string;
  booker: Required<BookerInput>;
  items: {
    partnerItemRef: string;
    travellers: { bandId?: string | undefined; firstName: string; lastName: string }[];
    bookingQuestionAnswers?: { question: string; answer: string; travelerNum?: number }[];
  }[];
}): Promise<CartBook> {
  const body = {
    cartRef: input.cartRef,
    paymentToken: input.paymentToken,
    bookerInfo: { firstName: input.booker.firstName, lastName: input.booker.lastName },
    communication: {
      email: input.booker.email,
      ...(input.booker.phone ? { phone: input.booker.phone } : {}),
    },
    items: input.items.map((item) => ({
      partnerItemRef: item.partnerItemRef,
      travelerInfo: item.travellers.map((t) => ({
        ...(t.bandId ? { bandId: t.bandId } : {}),
        firstName: t.firstName,
        lastName: t.lastName,
      })),
      bookingQuestionAnswers: item.bookingQuestionAnswers ?? [],
    })),
  };

  const res = await viatorFetch<unknown>("/bookings/cart/book", { method: "POST", body });
  if (!res.ok || !res.data) {
    const error = bookingError(res.status, res.error);
    return {
      ok: false,
      ...(error ? { error } : {}),
      statuses: [],
      bookingRef: null,
      itineraryRef: null,
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
    raw: data,
  };
}

// -------------------------------------------------------------------- status

export async function viatorBookingStatus(bookingRef: string): Promise<{
  ok: boolean;
  error?: string;
  statuses: string[];
}> {
  const res = await viatorFetch<unknown>("/bookings/status", {
    method: "POST",
    body: { bookingRefs: [bookingRef] },
  });
  if (!res.ok || !res.data) {
    const error = bookingError(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), statuses: [] };
  }
  const data = res.data as Record<string, unknown>;
  const items = pick<Record<string, unknown>[]>(data, ["bookings", "items"]) ?? [];
  return {
    ok: true,
    statuses: items.map((i) => pick<string>(i, ["status", "bookingStatus"]) ?? "").filter(Boolean),
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
