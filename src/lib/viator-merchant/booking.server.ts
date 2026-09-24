/**
 * Merchant sandbox booking chain: hold -> book -> status -> cancel.
 *
 * Merchant model specifics (verified against the live sandbox):
 *  - cart/hold takes NO paymentDataSubmissionMode / payment session fields;
 *  - cart/hold requires the confirmed productOptionCode + startTime from
 *    /availability/check;
 *  - cart/book may require a languageGuide — the supplier rejects the call with
 *    a clear message when one is needed, and we surface that requirement;
 *  - a timeout/5xx on cart/book is NOT a failure — /bookings/status with our
 *    own partnerBookingRef is authoritative; never blindly retry.
 */
import {
  MERCHANT_BOOKING_TIMEOUT_MS,
  merchantFetch,
  pick,
} from "@/lib/viator-merchant/client.server";

export type MerchantBooker = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type MerchantHoldInput = {
  productCode: string;
  productOptionCode: string;
  startTime?: string | undefined;
  travelDate: string;
  currency: string;
  paxMix: { ageBand: string; count: number }[];
  languageGuide?: { type: string; language: string } | undefined;
};

// --------------------------------------------------------- pure body builders

/** cart/hold body — NO payment fields (sandbox rejects them in merchant mode). */
export function buildMerchantHoldBody(input: {
  hold: MerchantHoldInput;
  partnerCartRef: string;
  partnerBookingRef: string;
  booker: MerchantBooker;
  hostingUrl: string;
}): Record<string, unknown> {
  const { hold } = input;
  return {
    currency: hold.currency,
    partnerCartRef: input.partnerCartRef,
    hostingUrl: input.hostingUrl,
    bookerInfo: { firstName: input.booker.firstName, lastName: input.booker.lastName },
    communication: { email: input.booker.email, phone: input.booker.phone },
    items: [
      {
        partnerBookingRef: input.partnerBookingRef,
        productCode: hold.productCode,
        productOptionCode: hold.productOptionCode,
        ...(hold.startTime ? { startTime: hold.startTime } : {}),
        travelDate: hold.travelDate,
        paxMix: hold.paxMix.map((p) => ({ ageBand: p.ageBand, numberOfTravelers: p.count })),
        ...(hold.languageGuide ? { languageGuide: hold.languageGuide } : {}),
      },
    ],
  };
}

export function buildMerchantBookBody(input: {
  cartRef: string;
  booker: MerchantBooker;
  items: {
    bookingRef: string;
    languageGuide?: { type: string; language: string } | undefined;
    bookingQuestionAnswers?: { question: string; answer: string; travelerNum?: number }[];
  }[];
}): Record<string, unknown> {
  return {
    cartRef: input.cartRef,
    bookerInfo: { firstName: input.booker.firstName, lastName: input.booker.lastName },
    communication: { email: input.booker.email, phone: input.booker.phone },
    items: input.items.map((item) => ({
      bookingRef: item.bookingRef,
      ...(item.languageGuide ? { languageGuide: item.languageGuide } : {}),
      bookingQuestionAnswers: item.bookingQuestionAnswers ?? [],
    })),
  };
}

export type MerchantBookingState =
  | "held"
  | "confirmed"
  | "pending"
  | "cancelled"
  | "rejected"
  | "failed";

/** Maps raw supplier statuses to our lifecycle; transient states stay pending. */
export function mapMerchantStatuses(statuses: readonly string[]): MerchantBookingState {
  const upper = statuses.map((s) => (s ?? "").trim().toUpperCase()).filter(Boolean);
  if (!upper.length) return "pending";
  if (upper.some((s) => s === "FAILED" || s === "ERROR")) return "failed";
  if (upper.some((s) => s === "CANCELLED" || s === "CANCELED")) return "cancelled";
  if (upper.some((s) => s === "REJECTED" || s === "DECLINED")) return "rejected";
  if (upper.every((s) => s === "CONFIRMED" || s === "AMENDED")) return "confirmed";
  return "pending";
}

// ------------------------------------------------------------------ hold

export type MerchantHold = {
  ok: boolean;
  error?: string;
  cartRef: string;
  bookingRef: string | null;
  holdExpiresAt: string | null;
  currency: string;
  retailTotal: number | null;
};

export async function merchantCartHold(input: {
  hold: MerchantHoldInput;
  partnerCartRef: string;
  partnerBookingRef: string;
  booker: MerchantBooker;
  hostingUrl: string;
}): Promise<MerchantHold> {
  const body = buildMerchantHoldBody(input);
  const res = await merchantFetch<Record<string, unknown>>("/bookings/cart/hold", {
    method: "POST",
    body,
    timeoutMs: MERCHANT_BOOKING_TIMEOUT_MS,
  });
  const empty: MerchantHold = {
    ok: false,
    cartRef: "",
    bookingRef: null,
    holdExpiresAt: null,
    currency: input.hold.currency,
    retailTotal: null,
  };
  if (!res.ok || !res.data) {
    return { ...empty, ...(res.error ? { error: res.error } : {}) };
  }
  const items = pick<Record<string, unknown>[]>(res.data, ["items"]) ?? [];
  const first = items[0];
  const holdInfo = pick<Record<string, unknown>>(first, ["bookingHoldInfo"]);
  const pricing = pick<Record<string, unknown>>(holdInfo, ["pricing"]);
  const price = pick<Record<string, unknown>>(
    pick<Record<string, unknown>>(res.data, ["totalHeldPrice"]),
    ["price"],
  );
  return {
    ok: true,
    cartRef: pick<string>(res.data, ["cartRef"]) ?? "",
    bookingRef: pick<string>(first, ["bookingRef"]) ?? null,
    holdExpiresAt: pick<string>(pricing, ["validUntil"]) ?? null,
    currency: pick<string>(res.data, ["currency"]) ?? input.hold.currency,
    retailTotal: pick<number>(price, ["recommendedRetailPrice"]) ?? null,
  };
}

// ------------------------------------------------------------------ book

export type MerchantBook = {
  ok: boolean;
  error?: string;
  /** timeout/5xx — the booking may still exist; resolve via status. */
  indeterminate?: boolean;
  state: MerchantBookingState;
  statuses: string[];
  bookingRef: string | null;
  voucherUrl: string | null;
  retailTotal: number | null;
  currency: string;
  cancellationPolicy: unknown;
};

export async function merchantCartBook(input: {
  cartRef: string;
  booker: MerchantBooker;
  items: {
    bookingRef: string;
    languageGuide?: { type: string; language: string } | undefined;
    bookingQuestionAnswers?: { question: string; answer: string; travelerNum?: number }[];
  }[];
}): Promise<MerchantBook> {
  const res = await merchantFetch<Record<string, unknown>>("/bookings/cart/book", {
    method: "POST",
    body: buildMerchantBookBody(input),
    timeoutMs: MERCHANT_BOOKING_TIMEOUT_MS,
  });
  const empty: MerchantBook = {
    ok: false,
    state: "failed",
    statuses: [],
    bookingRef: null,
    voucherUrl: null,
    retailTotal: null,
    currency: "USD",
    cancellationPolicy: null,
  };
  if (!res.ok || !res.data) {
    const indeterminate = res.timedOut === true || res.status >= 500;
    return {
      ...empty,
      ...(res.error ? { error: res.error } : {}),
      ...(indeterminate ? { indeterminate: true } : {}),
    };
  }
  const items = pick<Record<string, unknown>[]>(res.data, ["items"]) ?? [];
  const statuses = items
    .map((i) => pick<string>(i, ["status"]) ?? "")
    .filter(Boolean);
  const voucher = pick<Record<string, unknown>>(res.data, ["voucherInfo"]) ??
    pick<Record<string, unknown>>(items[0], ["voucherInfo"]);
  const price = pick<Record<string, unknown>>(
    pick<Record<string, unknown>>(res.data, ["totalConfirmedPrice"]),
    ["price"],
  );
  return {
    ok: true,
    state: mapMerchantStatuses(statuses),
    statuses,
    bookingRef: pick<string>(items[0], ["bookingRef"]) ?? null,
    voucherUrl: pick<string>(voucher, ["url"]) ?? null,
    retailTotal: pick<number>(price, ["recommendedRetailPrice"]) ?? null,
    currency: pick<string>(res.data, ["currency"]) ?? "USD",
    cancellationPolicy: pick<unknown>(items[0], ["cancellationPolicy"]) ?? null,
  };
}

// ------------------------------------------------------------------ status

export type MerchantStatus = {
  ok: boolean;
  error?: string;
  state: MerchantBookingState;
  status: string | null;
  voucherUrl: string | null;
};

/** Authoritative outcome; accepts either our partnerBookingRef or the bookingRef. */
export async function merchantBookingStatus(ref: {
  bookingRef?: string;
  partnerBookingRef?: string;
}): Promise<MerchantStatus> {
  const body = ref.bookingRef
    ? { bookingRef: ref.bookingRef }
    : { partnerBookingRef: ref.partnerBookingRef ?? "" };
  if (!body.bookingRef && !body.partnerBookingRef) {
    return { ok: false, error: "A booking reference is required.", state: "failed", status: null, voucherUrl: null };
  }
  const res = await merchantFetch<Record<string, unknown>>("/bookings/status", {
    method: "POST",
    body,
    timeoutMs: MERCHANT_BOOKING_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      ...(res.error ? { error: res.error } : {}),
      state: "failed",
      status: null,
      voucherUrl: null,
    };
  }
  const status = pick<string>(res.data, ["status"]) ?? null;
  const voucher = pick<Record<string, unknown>>(res.data, ["voucherInfo"]);
  return {
    ok: true,
    state: mapMerchantStatuses(status ? [status] : []),
    status,
    voucherUrl: pick<string>(voucher, ["url"]) ?? null,
  };
}

// ------------------------------------------------------------------ cancel

export type MerchantCancelQuote = {
  ok: boolean;
  error?: string;
  status: string | null;
  refundAmount: number | null;
  refundPercentage: number | null;
  currency: string | null;
};

export async function merchantCancelQuote(bookingRef: string): Promise<MerchantCancelQuote> {
  const res = await merchantFetch<Record<string, unknown>>(
    `/bookings/${encodeURIComponent(bookingRef)}/cancel-quote`,
    { method: "GET" },
  );
  if (!res.ok || !res.data) {
    return {
      ok: false,
      ...(res.error ? { error: res.error } : {}),
      status: null,
      refundAmount: null,
      refundPercentage: null,
      currency: null,
    };
  }
  const refund = pick<Record<string, unknown>>(res.data, ["refundDetails"]);
  return {
    ok: true,
    status: pick<string>(res.data, ["status"]) ?? null,
    refundAmount: pick<number>(refund, ["refundAmount"]) ?? null,
    refundPercentage: pick<number>(refund, ["refundPercentage"]) ?? null,
    currency: pick<string>(refund, ["currencyCode"]) ?? null,
  };
}

export async function merchantCancelReasons(): Promise<
  { ok: boolean; error?: string; reasons: { code: string; text: string }[] }
> {
  const res = await merchantFetch<Record<string, unknown>>(
    "/bookings/cancel-reasons?type=CUSTOMER",
    { method: "GET" },
  );
  if (!res.ok || !res.data) {
    return { ok: false, ...(res.error ? { error: res.error } : {}), reasons: [] };
  }
  const reasons = (pick<Record<string, unknown>[]>(res.data, ["reasons"]) ?? [])
    .map((r) => ({
      code: pick<string>(r, ["cancellationReasonCode"]) ?? "",
      text: pick<string>(r, ["cancellationReasonText"]) ?? "",
    }))
    .filter((r) => r.code);
  return { ok: true, reasons };
}

export async function merchantCancelBooking(input: {
  bookingRef: string;
  reasonCode: string;
}): Promise<{ ok: boolean; error?: string; status: string | null }> {
  const res = await merchantFetch<Record<string, unknown>>(
    `/bookings/${encodeURIComponent(input.bookingRef)}/cancel`,
    { method: "POST", body: { reasonCode: input.reasonCode }, timeoutMs: MERCHANT_BOOKING_TIMEOUT_MS },
  );
  if (!res.ok || !res.data) {
    return { ok: false, ...(res.error ? { error: res.error } : {}), status: null };
  }
  return { ok: true, status: pick<string>(res.data, ["status"]) ?? null };
}
