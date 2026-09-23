/**
 * Server functions for the Viator Activities hosted-payment checkout.
 *
 * Routing rule (enforced server-side, not just in the UI):
 *   cart contains ONLY Viator Activities -> Viator hosted payment iFrame
 *   anything else                        -> existing Razorpay orchestrator
 *
 * Contract notes (Viator Partner API v2):
 *  - cart/hold items are keyed by `partnerBookingRef`; the response returns
 *    Viator's `bookingRef`, which is what cart/book must send back.
 *  - traveller names and all pickup / arrival / departure details are
 *    *booking questions*, validated against the product's own question set.
 *  - a timeout or 5xx on cart/book is NOT a failure: /bookings/status is
 *    authoritative, and the same partnerBookingRef prevents duplicates.
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
  type FraudPreventionDetails,
  type PaxMix,
} from "@/lib/viator/checkout-contract";
import {
  travellerNameAnswers,
  validateBookingQuestionAnswers,
  type BookingQuestionAnswer,
} from "@/lib/viator/booking-questions";
import { validatePaxMixAgainstBands } from "@/lib/viator/age-bands";
import { buildActivityVoucher } from "@/lib/viator/voucher";

type HoldInputPayload = {
  productCode: string;
  productTitle?: string;
  travelDate: string;
  currency: string;
  paxMix: PaxMix;
  productOptionCode?: string;
  startTime?: string;
  languageGuide?: { type: string; language: string };
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
        ...(data.languageGuide ? { languageGuide: data.languageGuide } : {}),
      });
      const booker = validateBooker(data.booker);

      // The supplier's own age bands and booking limits decide who may travel.
      const { viatorProductFull } = await import("@/lib/viator.server");
      const productRes = await viatorProductFull(hold.productCode, hold.currency);
      const product = productRes.ok ? productRes.product : null;
      if (product) {
        const paxCheck = validatePaxMixAgainstBands(hold.paxMix, product.ageBands, {
          minTravelersPerBooking: product.bookingLimits.minTravelersPerBooking,
          maxTravelersPerBooking: product.bookingLimits.maxTravelersPerBooking,
        });
        if (!paxCheck.ok) {
          return { ok: false as const, route: decision.route, error: paxCheck.reason };
        }
      }

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
      // Stable, unique per reservation: reused on any retry so Viator can never
      // create a duplicate booking for the same traveller intent.
      const partnerBookingRef = `${partnerCartRef}-1`;
      const held = await viatorCartHold({
        hold: resolvedHold,
        partnerCartRef,
        partnerBookingRef,
        booker,
      });
      if (!held.ok) {
        return {
          ok: false as const,
          route: decision.route,
          error: held.error ?? "Could not hold this experience with the supplier.",
        };
      }

      const heldItem = held.items.find((i) => i.bookingRef) ?? held.items[0];
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
          partnerBookingRef,
          viatorBookingRef: heldItem?.bookingRef ?? null,
          items: held.items,
          paxMix: hold.paxMix,
          startTime: resolvedHold.startTime ?? null,
          productOptionCode: resolvedHold.productOptionCode ?? null,
          languageGuide: resolvedHold.languageGuide ?? null,
          bookingQuestionIds: product?.bookingQuestionIds ?? [],
          cancellationPolicy: product?.cancellationPolicy?.description ?? null,
          meetingPoint: product?.meetingPoint ?? null,
          hostingUrl: held.hostingUrl,
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

type BookAudit = {
  partnerBookingRef?: string;
  /** legacy key from earlier holds */
  partnerItemRef?: string;
  viatorBookingRef?: string | null;
  paxMix?: PaxMix;
  languageGuide?: { type: string; language: string } | null;
  bookingQuestionIds?: string[];
  cancellationPolicy?: string | null;
  meetingPoint?: string | null;
  startTime?: string | null;
  productOptionCode?: string | null;
};

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
      bookingQuestionAnswers?: {
        question: string;
        answer: string;
        travelerNum?: number;
        unit?: string;
      }[];
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

    const audit = (record.audit ?? {}) as BookAudit;
    const paxMix: PaxMix = audit.paxMix?.length
      ? audit.paxMix
      : [{ ageBand: "ADULT", count: record.traveller_count }];
    const travellerCount = paxMix.reduce((sum, p) => sum + p.count, 0);
    const partnerBookingRef =
      audit.partnerBookingRef ?? audit.partnerItemRef ?? `${record.cart_reference}-1`;
    const viatorBookingRef = audit.viatorBookingRef ?? null;

    if (!viatorBookingRef) {
      return {
        ok: false as const,
        error: "This reservation is missing its supplier hold — please restart checkout.",
      };
    }

    // Traveller names and logistics answers are validated against the product's
    // real question set before anything is sent to the supplier.
    let answers: BookingQuestionAnswer[] = [];
    try {
      const { viatorProductBookingQuestions } = await import("@/lib/viator.server");
      const questions = await viatorProductBookingQuestions(audit.bookingQuestionIds ?? []);
      const supplied: BookingQuestionAnswer[] = [
        ...travellerNameAnswers(
          (data.travellers ?? []).map((t) => ({
            firstName: t.firstName || booker.firstName,
            lastName: t.lastName || booker.lastName,
          })),
        ),
        ...(data.bookingQuestionAnswers ?? []),
      ];
      if (questions.length) {
        const validated = validateBookingQuestionAnswers(questions, supplied, travellerCount);
        if (!validated.ok) return { ok: false as const, error: validated.reason };
        answers = validated.answers;
      } else {
        answers = supplied;
      }
    } catch {
      answers = travellerNameAnswers(
        (data.travellers ?? []).map((t) => ({
          firstName: t.firstName || booker.firstName,
          lastName: t.lastName || booker.lastName,
        })),
      );
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

    const fraudPreventionDetails: FraudPreventionDetails = { voucherDeliveryType: "EMAIL" };

    try {
      const { viatorCartBook, viatorBookingStatus } = await import("@/lib/viator/booking.server");
      const result = await viatorCartBook({
        cartRef: record.cart_reference,
        paymentToken: data.paymentToken.trim(),
        booker,
        items: [
          {
            bookingRef: viatorBookingRef,
            ...(audit.languageGuide ? { languageGuide: audit.languageGuide } : {}),
            bookingQuestionAnswers: answers,
          },
        ],
        fraudPreventionDetails,
      });

      let statuses = result.statuses;
      let bookingRef = result.bookingRef ?? viatorBookingRef;
      let voucherInfo = result.voucherInfo;

      if (!result.ok) {
        // A timeout or 5xx does not mean the booking failed — ask the
        // authoritative status endpoint before concluding anything.
        if (result.indeterminate) {
          const resolved = await viatorBookingStatus({
            bookingRef: viatorBookingRef,
            partnerBookingRef,
          });
          if (resolved.ok && resolved.statuses.length) {
            statuses = resolved.statuses;
            voucherInfo = resolved.voucherInfo;
          } else {
            await finaliseActivityBooking({
              cartRef: record.cart_reference,
              status: "paid_pending_confirmation",
              paymentStatus: "paid",
              bookingReference: bookingRef,
              failureReason: "Supplier response not yet available — awaiting confirmation.",
            });
            return {
              ok: true as const,
              state: "paid_pending_confirmation" as ActivityBookingState,
              bookingReference: bookingRef,
              pending: true,
            };
          }
        } else {
          await releaseHoldClaim(
            record.cart_reference,
            result.error ?? "Supplier booking call failed.",
          );
          return {
            ok: false as const,
            error: result.error ?? "The supplier could not complete this booking.",
          };
        }
      }

      let state = mapViatorBookingStatus(statuses);
      // Pending bookings get one immediate status re-read so guests usually see
      // the final answer without waiting.
      if (state === "paid_pending_confirmation") {
        const status = await viatorBookingStatus({ bookingRef, partnerBookingRef });
        if (status.ok && status.statuses.length) {
          statuses = status.statuses;
          state = mapViatorBookingStatus(status.statuses);
          voucherInfo = status.voucherInfo ?? voucherInfo;
        }
      }

      // The Worldway voucher exists only for a confirmed supplier booking.
      const voucherResult = buildActivityVoucher({
        state,
        bookingReference: bookingRef,
        worldwayReference: record.cart_reference,
        itineraryReference: result.itineraryRef,
        productCode: record.product_code,
        productTitle: record.product_title ?? record.product_code,
        travelDate: record.travel_date,
        startTime: audit.startTime ?? null,
        travellers: answers.length
          ? buildVoucherTravellers(answers, paxMix, booker)
          : buildVoucherTravellers([], paxMix, booker),
        paxMix: paxMix.map((p) => ({ ageBand: p.ageBand, count: p.count })),
        currency: record.currency,
        total: record.amount_minor != null ? record.amount_minor / 100 : null,
        cancellationPolicy: audit.cancellationPolicy ?? null,
        meetingPoint: audit.meetingPoint ?? null,
        ...(voucherInfo?.url ? { supplierVoucherUrl: voucherInfo.url } : {}),
        voucherRestrictionRequired: voucherInfo?.isVoucherRestrictionRequired === true,
        customerEmail: booker.email,
        customerPhone: booker.phone,
      });

      await finaliseActivityBooking({
        cartRef: record.cart_reference,
        status: state,
        paymentStatus: state === "failed" || state === "rejected" ? "failed" : "paid",
        bookingReference: bookingRef,
        itineraryReference: result.itineraryRef,
        failureReason:
          state === "confirmed" ? null : `Supplier status: ${statuses.join(",") || "unknown"}`,
        audit: {
          ...(audit as Record<string, unknown>),
          statuses,
          bookingQuestionAnswers: answers,
          voucherInfo,
          ...(voucherResult.issued ? { voucher: voucherResult.voucher } : {}),
        },
      });

      return {
        ok: state !== "failed" && state !== "rejected",
        state,
        bookingReference: bookingRef,
        itineraryReference: result.itineraryRef,
        voucher: voucherResult.issued ? voucherResult.voucher : null,
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

/** Traveller list for the voucher, taken from the answers we actually sent. */
function buildVoucherTravellers(
  answers: readonly BookingQuestionAnswer[],
  paxMix: PaxMix,
  booker: { firstName: string; lastName: string },
): { firstName: string; lastName: string; ageBand: string }[] {
  const bands: string[] = [];
  for (const p of paxMix) for (let i = 0; i < p.count; i += 1) bands.push(p.ageBand);
  return bands.map((ageBand, idx) => {
    const num = idx + 1;
    const first = answers.find(
      (a) => a.question === "FULL_NAMES_FIRST" && (a.travelerNum ?? 1) === num,
    )?.answer;
    const last = answers.find(
      (a) => a.question === "FULL_NAMES_LAST" && (a.travelerNum ?? 1) === num,
    )?.answer;
    return {
      firstName: first || booker.firstName,
      lastName: last || booker.lastName,
      ageBand,
    };
  });
}

/** Poll endpoint for pending supplier confirmations. */
export const viatorActivityBookingStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { cartRef: string }) => data)
  .handler(async ({ data }) => {
    const { getActivityBooking, finaliseActivityBooking } = await import(
      "@/lib/viator/activity-bookings.server"
    );
    const record = await getActivityBooking(data.cartRef);
    if (!record) return { ok: false as const, error: "Reservation not found." };
    const audit = (record.audit ?? {}) as BookAudit;
    const partnerBookingRef =
      audit.partnerBookingRef ?? audit.partnerItemRef ?? `${record.cart_reference}-1`;
    const ref = record.booking_reference ?? audit.viatorBookingRef ?? null;

    if (record.status !== "paid_pending_confirmation") {
      return {
        ok: true as const,
        state: record.status,
        bookingReference: record.booking_reference,
      };
    }

    const { viatorBookingStatus } = await import("@/lib/viator/booking.server");
    const status = await viatorBookingStatus(
      ref ? { bookingRef: ref } : { partnerBookingRef },
    );
    if (!status.ok || !status.statuses.length) {
      return {
        ok: true as const,
        state: record.status,
        bookingReference: record.booking_reference,
        nextPollAt: status.nextPollAt,
      };
    }
    const state = mapViatorBookingStatus(status.statuses);
    if (state !== record.status) {
      await finaliseActivityBooking({
        cartRef: record.cart_reference,
        status: state,
        paymentStatus: state === "failed" || state === "rejected" ? "failed" : "paid",
        ...(ref ? { bookingReference: ref } : {}),
      });
    }
    return {
      ok: true as const,
      state,
      bookingReference: record.booking_reference ?? ref,
      nextPollAt: status.nextPollAt,
    };
  });
