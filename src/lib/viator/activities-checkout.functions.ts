/**
 * Server functions for the Viator Activities hosted-payment checkout.
 *
 * Routing rule (enforced server-side, not just in the UI):
 *   cart contains ONLY Viator Activities -> Viator hosted payment iFrame
 *   anything else                        -> existing Razorpay orchestrator
 */
import { createServerFn } from "@tanstack/react-start";
import { resolvePaymentRoute, type CheckoutLine } from "@/lib/payments/routing";
import {
  canSubmitBooking,
  mapViatorBookingStatus,
  validateBillingDetails,
  validateBooker,
  validateHoldInput,
  isHoldUsable,
  VIATOR_PAYMENT_SCRIPT_URL,
  type ActivityBookingState,
  type PaxMix,
} from "@/lib/viator/checkout-contract";

type HoldInputPayload = {
  productCode: string;
  productTitle?: string;
  travelDate: string;
  currency: string;
  paxMix: PaxMix;
  productOptionCode?: string;
  startTime?: string;
  booker: { firstName: string; lastName: string; email: string; phone?: string };
  lines?: CheckoutLine[];
};

export const resolveCheckoutRoute = createServerFn({ method: "POST" })
  .inputValidator((data: { lines: CheckoutLine[] }) => data)
  .handler(async ({ data }) => {
    const decision = resolvePaymentRoute(data.lines ?? []);
    return {
      ...decision,
      paymentScriptUrl:
        decision.route === "VIATOR_HOSTED_IFRAME" ? VIATOR_PAYMENT_SCRIPT_URL : null,
    };
  });

/**
 * Step 1 — availability + cart hold. Returns the short-lived
 * paymentSessionToken the browser hands to window.Payment.init().
 */
export const holdViatorActivityCart = createServerFn({ method: "POST" })
  .inputValidator((data: HoldInputPayload) => data)
  .handler(async ({ data }) => {
    const lines: CheckoutLine[] = data.lines?.length
      ? data.lines
      : [{ supplier: "viator", productKind: "activity" }];
    const decision = resolvePaymentRoute(lines);
    if (decision.route !== "VIATOR_HOSTED_IFRAME") {
      return {
        ok: false as const,
        route: decision.route,
        error: "This cart must be paid through the standard Worldway checkout.",
      };
    }

    try {
      const hold = validateHoldInput({
        productCode: data.productCode,
        travelDate: data.travelDate,
        currency: data.currency,
        paxMix: data.paxMix,
        ...(data.productOptionCode ? { productOptionCode: data.productOptionCode } : {}),
        ...(data.startTime ? { startTime: data.startTime } : {}),
      });
      const booker = validateBooker(data.booker);

      const { viatorCartHold, viatorCheckAvailability } = await import(
        "@/lib/viator/booking.server"
      );
      const availability = await viatorCheckAvailability(hold);
      if (!availability.ok || !availability.available) {
        return {
          ok: false as const,
          route: decision.route,
          error:
            availability.error ??
            "This experience is not available for the selected date and party.",
        };
      }

      const resolvedHold = {
        ...hold,
        ...(availability.productOptionCode
          ? { productOptionCode: availability.productOptionCode }
          : {}),
        ...(availability.startTime ? { startTime: availability.startTime } : {}),
      };

      const partnerCartRef = `WW-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
      const partnerItemRef = `${partnerCartRef}-1`;
      const held = await viatorCartHold({
        hold: resolvedHold,
        partnerCartRef,
        partnerItemRef,
        booker,
      });
      if (!held.ok) {
        return {
          ok: false as const,
          route: decision.route,
          error: held.error ?? "Could not hold this experience with the supplier.",
        };
      }

      const travellers = hold.paxMix.reduce((sum, p) => sum + p.count, 0);
      const amount = held.total ?? availability.total ?? 0;
      const { insertActivityHold } = await import("@/lib/viator/activity-bookings.server");
      const { optionalUserId } = await import("@/lib/payments/payments.server");
      await insertActivityHold({
        user_id: await optionalUserId(),
        cart_reference: held.cartRef,
        product_code: hold.productCode,
        product_title: data.productTitle?.slice(0, 300) ?? null,
        travel_date: hold.travelDate,
        traveller_count: travellers,
        amount_minor: Math.round(amount * 100),
        currency: held.currency,
        hold_expires_at: held.holdExpiresAt,
        session_expires_at: held.sessionExpiresAt,
        customer_email: booker.email,
        customer_phone: booker.phone || null,
        audit: {
          partnerCartRef,
          partnerItemRef,
          items: held.items,
          paxMix: hold.paxMix,
          startTime: resolvedHold.startTime ?? null,
          productOptionCode: resolvedHold.productOptionCode ?? null,
        },
      });

      return {
        ok: true as const,
        route: decision.route,
        cartRef: held.cartRef,
        paymentSessionToken: held.paymentSessionToken,
        paymentScriptUrl: VIATOR_PAYMENT_SCRIPT_URL,
        currency: held.currency,
        total: amount,
        holdExpiresAt: held.holdExpiresAt,
        sessionExpiresAt: held.sessionExpiresAt,
      };
    } catch (err) {
      return {
        ok: false as const,
        route: "VIATOR_HOSTED_IFRAME" as const,
        error: err instanceof Error ? err.message : "Could not start this reservation.",
      };
    }
  });

/**
 * Step 2 — the browser tokenised the card inside Viator's iFrame and returns a
 * paymentToken. We re-validate the hold server-side, claim it atomically, then
 * call bookings/cart/book. The paymentToken is never trusted for pricing.
 */
export const bookViatorActivityCart = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      cartRef: string;
      paymentToken: string;
      billing: { country: string; postalCode: string };
      booker: { firstName: string; lastName: string; email: string; phone?: string };
      travellers?: { firstName: string; lastName: string }[];
      bookingQuestionAnswers?: { question: string; answer: string; travelerNum?: number }[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const { getActivityBooking, claimHoldForBooking, finaliseActivityBooking, releaseHoldClaim } =
      await import("@/lib/viator/activity-bookings.server");

    if (!data.cartRef?.trim() || !data.paymentToken?.trim()) {
      return { ok: false as const, error: "Missing payment session — please restart checkout." };
    }

    let billing: { country: string; postalCode: string };
    let booker: Required<{ firstName: string; lastName: string; email: string; phone: string }>;
    try {
      billing = validateBillingDetails(data.billing);
      booker = validateBooker(data.booker);
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Invalid billing details.",
      };
    }

    const record = await getActivityBooking(data.cartRef.trim());
    if (!record) return { ok: false as const, error: "Reservation not found." };

    const gate = canSubmitBooking({
      state: record.status as ActivityBookingState,
      holdExpiresAt: record.hold_expires_at,
    });
    if (!gate.ok) {
      return {
        ok: false as const,
        error: gate.reason,
        state: record.status,
        bookingReference: record.booking_reference,
      };
    }
    if (!isHoldUsable(record.session_expires_at)) {
      await finaliseActivityBooking({
        cartRef: record.cart_reference,
        status: "hold_expired",
        paymentStatus: "expired",
        failureReason: "Payment session expired before submission.",
      });
      return { ok: false as const, error: "The payment session expired — please try again." };
    }

    const claimed = await claimHoldForBooking({
      cartRef: record.cart_reference,
      billingCountry: billing.country,
      billingPostalCode: billing.postalCode,
    });
    if (!claimed) {
      return {
        ok: false as const,
        error: "This reservation is already being processed.",
        state: record.status,
      };
    }

    const audit = (record.audit ?? {}) as {
      partnerItemRef?: string;
      paxMix?: PaxMix;
    };
    const paxMix: PaxMix = audit.paxMix?.length
      ? audit.paxMix
      : [{ ageBand: "ADULT", count: record.traveller_count }];

    try {
      const { viatorCartBook, travellersFromPaxMix, viatorBookingStatus } = await import(
        "@/lib/viator/booking.server"
      );
      const result = await viatorCartBook({
        cartRef: record.cart_reference,
        paymentToken: data.paymentToken.trim(),
        booker,
        items: [
          {
            partnerItemRef: audit.partnerItemRef ?? `${record.cart_reference}-1`,
            travellers: travellersFromPaxMix(paxMix, booker, data.travellers ?? []),
            bookingQuestionAnswers: data.bookingQuestionAnswers ?? [],
          },
        ],
      });

      if (!result.ok) {
        await releaseHoldClaim(
          record.cart_reference,
          result.error ?? "Supplier booking call failed.",
        );
        return {
          ok: false as const,
          error: result.error ?? "The supplier could not complete this booking.",
        };
      }

      let state = mapViatorBookingStatus(result.statuses);
      // Pending bookings get one immediate status re-read so guests usually see
      // the final answer without waiting.
      if (state === "paid_pending_confirmation" && result.bookingRef) {
        const status = await viatorBookingStatus(result.bookingRef);
        if (status.ok && status.statuses.length) state = mapViatorBookingStatus(status.statuses);
      }

      await finaliseActivityBooking({
        cartRef: record.cart_reference,
        status: state,
        paymentStatus: state === "failed" || state === "rejected" ? "failed" : "paid",
        bookingReference: result.bookingRef,
        itineraryReference: result.itineraryRef,
        failureReason: state === "confirmed" ? null : `Supplier status: ${result.statuses.join(",")}`,
        audit: { ...(audit as Record<string, unknown>), statuses: result.statuses },
      });

      return {
        ok: state !== "failed" && state !== "rejected",
        state,
        bookingReference: result.bookingRef,
        itineraryReference: result.itineraryRef,
        ...(state === "failed" || state === "rejected"
          ? { error: "The supplier declined this booking. No ticket was issued." }
          : {}),
      };
    } catch (err) {
      await releaseHoldClaim(
        record.cart_reference,
        err instanceof Error ? err.message : "Unexpected booking error.",
      );
      return { ok: false as const, error: "Could not complete the booking. Please try again." };
    }
  });

/** Poll endpoint for pending supplier confirmations. */
export const viatorActivityBookingStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { cartRef: string }) => data)
  .handler(async ({ data }) => {
    const { getActivityBooking, finaliseActivityBooking } = await import(
      "@/lib/viator/activity-bookings.server"
    );
    const record = await getActivityBooking(data.cartRef);
    if (!record) return { ok: false as const, error: "Reservation not found." };
    if (record.status !== "paid_pending_confirmation" || !record.booking_reference) {
      return {
        ok: true as const,
        state: record.status,
        bookingReference: record.booking_reference,
      };
    }
    const { viatorBookingStatus } = await import("@/lib/viator/booking.server");
    const status = await viatorBookingStatus(record.booking_reference);
    if (!status.ok || !status.statuses.length) {
      return { ok: true as const, state: record.status, bookingReference: record.booking_reference };
    }
    const state = mapViatorBookingStatus(status.statuses);
    if (state !== record.status) {
      await finaliseActivityBooking({
        cartRef: record.cart_reference,
        status: state,
        paymentStatus: state === "failed" || state === "rejected" ? "failed" : "paid",
      });
    }
    return { ok: true as const, state, bookingReference: record.booking_reference };
  });
