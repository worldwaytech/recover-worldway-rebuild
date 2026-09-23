/**
 * Server-only Viator post-booking operations: cancellation, amendment and the
 * booking-event (modified-since) feed.
 *
 * Every function is a thin, honest wrapper: it reports exactly what Viator
 * returned. Nothing here fabricates a refund, a quote or a status. These
 * endpoints require "Full Access + Booking" entitlement; when the key lacks it
 * Viator answers 403 and we surface that plainly instead of pretending.
 */

import {
  VIATOR_BOOKING_ACCESS_MESSAGE,
  VIATOR_BOOKING_TIMEOUT_MS,
  isViatorEndpointDenied,
  viatorFetch,
} from "@/lib/viator.server";

function err(status: number, error?: string): string | undefined {
  if (isViatorEndpointDenied(status, error)) return VIATOR_BOOKING_ACCESS_MESSAGE;
  return error;
}

// ------------------------------------------------------------- cancel reasons

export type CancellationReason = { code: string; text: string };

/** `type` is CUSTOMER (traveller-initiated) or SUPPLIER. */
export async function viatorCancelReasons(
  type: "CUSTOMER" | "SUPPLIER" = "CUSTOMER",
): Promise<{ ok: boolean; error?: string; reasons: CancellationReason[] }> {
  const res = await viatorFetch<{
    reasons?: { cancellationReasonCode?: string; cancellationReasonText?: string }[];
  }>(`/bookings/cancel-reasons?type=${type}`, { method: "GET" });
  if (!res.ok) {
    const error = err(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), reasons: [] };
  }
  return {
    ok: true,
    reasons: (res.data?.reasons ?? [])
      .filter((r) => r.cancellationReasonCode)
      .map((r) => ({
        code: r.cancellationReasonCode as string,
        text: r.cancellationReasonText?.trim() || (r.cancellationReasonCode as string),
      })),
  };
}

// --------------------------------------------------------------- cancel quote

export type CancelQuote = {
  ok: boolean;
  error?: string;
  bookingId: string | null;
  status: string | null;
  refund: {
    refundEligibility: unknown;
    itemPrice: number | null;
    refundAmount: number | null;
    currency: string | null;
  } | null;
};

/** What the traveller would actually get back — Viator's own figures only. */
export async function viatorCancelQuote(bookingRef: string): Promise<CancelQuote> {
  const res = await viatorFetch<{
    bookingId?: string;
    status?: string;
    refundDetails?: {
      itemPrice?: number;
      refundAmount?: number;
      currencyCode?: string;
      currency?: string;
      refundEligibility?: unknown;
    };
  }>(`/bookings/${encodeURIComponent(bookingRef)}/cancel-quote`, { method: "GET" });
  if (!res.ok || !res.data) {
    const error = err(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), bookingId: null, status: null, refund: null };
  }
  const d = res.data;
  return {
    ok: true,
    bookingId: d.bookingId ?? bookingRef,
    status: d.status ?? null,
    refund: d.refundDetails
      ? {
          refundEligibility: d.refundDetails.refundEligibility ?? null,
          itemPrice: d.refundDetails.itemPrice ?? null,
          refundAmount: d.refundDetails.refundAmount ?? null,
          currency: d.refundDetails.currencyCode ?? d.refundDetails.currency ?? null,
        }
      : null,
  };
}

// --------------------------------------------------------------------- cancel

export type CancelResult = {
  ok: boolean;
  error?: string;
  status: string | null;
  refund: { refundAmount: number | null; currency: string | null } | null;
};

/** `reasonCode` MUST come from /bookings/cancel-reasons — never invented. */
export async function viatorCancelBooking(
  bookingRef: string,
  reasonCode: string,
): Promise<CancelResult> {
  if (!reasonCode.trim()) {
    return { ok: false, error: "A cancellation reason is required.", status: null, refund: null };
  }
  const res = await viatorFetch<{
    status?: string;
    refundDetails?: { refundAmount?: number; currencyCode?: string; currency?: string };
  }>(`/bookings/${encodeURIComponent(bookingRef)}/cancel`, {
    method: "POST",
    body: { reasonCode },
    timeoutMs: VIATOR_BOOKING_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) {
    const error = err(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), status: null, refund: null };
  }
  return {
    ok: true,
    status: res.data.status ?? null,
    refund: res.data.refundDetails
      ? {
          refundAmount: res.data.refundDetails.refundAmount ?? null,
          currency:
            res.data.refundDetails.currencyCode ?? res.data.refundDetails.currency ?? null,
        }
      : null,
  };
}

// ------------------------------------------------------------------ amendment

export type AmendmentCheck = {
  ok: boolean;
  error?: string;
  isAmendable: boolean;
  /** BOOKING_DETAILS | UPDATE_PAX_MIX | PER_TRAVELER_QUESTIONS | PER_BOOKING_QUESTIONS */
  amendmentTypes: string[];
};

export async function viatorAmendmentCheck(bookingRef: string): Promise<AmendmentCheck> {
  const res = await viatorFetch<{ isAmendable?: boolean; amendmentTypes?: string[] }>(
    `/amendment/check/${encodeURIComponent(bookingRef)}`,
    { method: "GET" },
  );
  if (!res.ok || !res.data) {
    const error = err(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), isAmendable: false, amendmentTypes: [] };
  }
  return {
    ok: true,
    isAmendable: res.data.isAmendable === true,
    amendmentTypes: res.data.amendmentTypes ?? [],
  };
}

/** Only one amendment type may be changed per request (Viator rule). */
export type AmendmentQuoteRequest = {
  bookingRef: string;
  bookingDetails?: {
    travelDate?: string;
    startTime?: string;
    productOptionCode?: string;
    languageGuide?: { type: string; language: string };
  };
  updatePaxMix?: {
    addPaxMix?: { ageBand: string; numberOfTravelers: number }[];
    removePaxMix?: { travelerNum: number }[];
  };
  perBookingQuestions?: { question: string; answer: string; unit?: string }[];
  perTravelerQuestions?: { question: string; answer: string; travelerNum: number; unit?: string }[];
};

export type AmendmentQuote = {
  ok: boolean;
  error?: string;
  quoteRef: string | null;
  priceChanged: boolean;
  amountDue: number | null;
  currency: string | null;
};

export async function viatorAmendmentQuote(
  req: AmendmentQuoteRequest,
): Promise<AmendmentQuote> {
  const changes = [
    req.bookingDetails && { bookingDetails: req.bookingDetails },
    req.updatePaxMix && { updatePaxMix: req.updatePaxMix },
    req.perBookingQuestions && { perBookingQuestions: req.perBookingQuestions },
    req.perTravelerQuestions && { perTravelerQuestions: req.perTravelerQuestions },
  ].filter(Boolean);
  if (changes.length !== 1) {
    return {
      ok: false,
      error: "Exactly one amendment type can be requested at a time.",
      quoteRef: null,
      priceChanged: false,
      amountDue: null,
      currency: null,
    };
  }
  const res = await viatorFetch<{
    quoteRef?: string;
    priceDifference?: { amount?: number; currency?: string };
    totalPrice?: { price?: { recommendedRetailPrice?: number }; currency?: string };
  }>("/amendment/quote", {
    method: "POST",
    body: { bookingRef: req.bookingRef, ...changes[0] },
    timeoutMs: VIATOR_BOOKING_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) {
    const error = err(res.status, res.error);
    return {
      ok: false,
      ...(error ? { error } : {}),
      quoteRef: null,
      priceChanged: false,
      amountDue: null,
      currency: null,
    };
  }
  const amountDue = res.data.priceDifference?.amount ?? null;
  return {
    ok: true,
    quoteRef: res.data.quoteRef ?? null,
    priceChanged: amountDue != null && amountDue !== 0,
    amountDue,
    currency: res.data.priceDifference?.currency ?? res.data.totalPrice?.currency ?? null,
  };
}

export async function viatorAmendmentAmend(quoteRef: string): Promise<{
  ok: boolean;
  error?: string;
  status: string | null;
  voucherUrl: string | null;
}> {
  const res = await viatorFetch<{ status?: string; voucherInfo?: { url?: string } }>(
    `/amendment/amend/${encodeURIComponent(quoteRef)}`,
    { method: "POST", timeoutMs: VIATOR_BOOKING_TIMEOUT_MS },
  );
  if (!res.ok || !res.data) {
    const error = err(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), status: null, voucherUrl: null };
  }
  return {
    ok: true,
    status: res.data.status ?? null,
    voucherUrl: res.data.voucherInfo?.url ?? null,
  };
}

// ------------------------------------------------------------ modified-since

export type BookingEvent = {
  transactionRef: string;
  eventType: string;
  bookingRef: string;
  partnerBookingRef: string | null;
  acknowledgeBy: string | null;
  lastUpdated: string | null;
};

/**
 * Booking-event feed. Viator's guidance: poll hourly, and every 5 minutes while
 * handling supplier cancellations. Events MUST be acknowledged before
 * `acknowledgeBy`, otherwise Viator emails the traveller itself.
 */
export async function viatorBookingsModifiedSince(params: {
  cursor?: string;
  modifiedSince?: string;
  count?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  events: BookingEvent[];
  nextCursor: string | null;
}> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set("cursor", params.cursor);
  else if (params.modifiedSince) qs.set("modified-since", params.modifiedSince);
  qs.set("count", String(Math.min(Math.max(params.count ?? 100, 1), 500)));

  const res = await viatorFetch<{
    bookings?: {
      transactionRef?: string;
      eventType?: string;
      bookingRef?: string;
      partnerBookingRef?: string;
      acknowledgeBy?: string;
      lastUpdated?: string;
    }[];
    nextCursor?: string;
  }>(`/bookings/modified-since?${qs.toString()}`, { method: "GET" });
  if (!res.ok || !res.data) {
    const error = err(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}), events: [], nextCursor: null };
  }
  return {
    ok: true,
    events: (res.data.bookings ?? [])
      .filter((b) => b.transactionRef && b.bookingRef)
      .map((b) => ({
        transactionRef: b.transactionRef as string,
        eventType: b.eventType ?? "",
        bookingRef: b.bookingRef as string,
        partnerBookingRef: b.partnerBookingRef ?? null,
        acknowledgeBy: b.acknowledgeBy ?? null,
        lastUpdated: b.lastUpdated ?? null,
      })),
    nextCursor: res.data.nextCursor ?? null,
  };
}

/** Acknowledges processed events so Viator stops its own notifications. */
export async function viatorAcknowledgeBookingEvents(
  transactionRefs: readonly string[],
): Promise<{ ok: boolean; error?: string }> {
  const refs = transactionRefs.filter(Boolean);
  if (!refs.length) return { ok: true };
  const res = await viatorFetch<unknown>("/bookings/modified-since/acknowledge", {
    method: "POST",
    body: { transactionRefs: refs },
  });
  if (!res.ok) {
    const error = err(res.status, res.error);
    return { ok: false, ...(error ? { error } : {}) };
  }
  return { ok: true };
}
