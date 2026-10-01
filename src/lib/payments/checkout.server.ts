/**
 * Checkout orchestration — server only.
 */
import {
  MEMBERSHIP_PLANS,
  isMembershipPlanId,
  toMinorUnits,
  type PaymentPurpose,
} from "./plans";
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  razorpayIsLive,
  razorpayKeyId,
  verifyCheckoutSignature,
} from "./razorpay.server";
import {
  getPaymentByOrderId,
  insertPaymentRecord,
  markPaymentStatus,
  optionalUserId,
} from "./payments.server";


const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export type OrderInput = {
  purpose: PaymentPurpose;
  amount?: number;
  currency: string;
  planId?: string;
  description?: string;
  email?: string;
  phone?: string;
  reference?: Record<string, string | number | boolean>;
};

/**
 * Resolves the amount that will actually be charged. Every amount is
 * server-owned: memberships from the plan catalogue, flights from a live
 * server-side fare confirmation. Client-supplied amounts are never charged.
 */
export async function resolvePaymentAmount(
  input: OrderInput & { flightFare?: { resultIndex: string; searchTokenId: string; extras?: { baggage?: string[]; meal?: string[]; seat?: string[] }[] }; prePurchasedBookingId?: string; aviationReference?: string; tourBookingId?: string; travelBookingId?: string },
): Promise<{
  amountMinor: number;
  currency: string;
  planId: string | null;
}> {
  if (input.purpose === "membership") {
    const planId = input.planId ?? "";
    if (!isMembershipPlanId(planId)) {
      throw new Error("Unknown membership plan.");
    }
    const plan = MEMBERSHIP_PLANS[planId];
    return { amountMinor: plan.amountMinor, currency: plan.currency, planId };
  }

  if (input.purpose === "private_aviation") {
    if (!input.aviationReference) throw new Error("The private aviation reference is required.");
    const { aviationQuoteAmount } = await import("@/lib/aviation/payment.server");
    const r = await aviationQuoteAmount(input.aviationReference, await optionalUserId());
    return { ...r, planId: null };
  }

  if (input.travelBookingId) {
    const { travelPaymentAmount } = await import("@/lib/up17/booking.server");
    const r = await travelPaymentAmount(input.travelBookingId, await optionalUserId());
    if (r.product !== input.purpose) throw new Error("Payment purpose does not match this booking.");
    return { amountMinor: r.amountMinor, currency: r.currency, planId: null };
  }

  if (input.purpose === "wallet_topup") {
    // Top-up amount is chosen by the customer; signed-in only, INR, bounded.
    if (!(await optionalUserId())) throw new Error("Please sign in to add money to your wallet.");
    if (input.currency !== "INR") throw new Error("Wallet top-ups are in INR.");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 200000) throw new Error("Top up between ₹100 and ₹2,00,000.");
    return { amountMinor: toMinorUnits(amount), currency: "INR", planId: null };
  }

  if (input.purpose === "tour") {
    if (!input.tourBookingId) throw new Error("The tour booking reference is required.");
    const { tourPaymentAmount } = await import("@/lib/travelshop/booking.server");
    return tourPaymentAmount(input.tourBookingId, await optionalUserId());
  }

  if (input.purpose === "flight" && input.prePurchasedBookingId) {
    const { prePurchasedAmount } = await import("@/lib/airiq/payment.server");
    const r = await prePurchasedAmount(input.prePurchasedBookingId, await optionalUserId());
    return { ...r, planId: null };
  }

  if (input.purpose === "flight") {
    if (!input.flightFare) throw new Error("The flight fare reference is required.");
    const { up17ConfirmFare } = await import("@/lib/up17/up17.server");
    const { resultIndex, searchTokenId, extras: selections } = input.flightFare;
    const fare = await up17ConfirmFare({ resultIndex, searchTokenId });
    let extrasTotal = 0;
    if (selections?.length) {
      const { resolveFlightExtras } = await import("@/lib/up17/up17.server");
      const r = await resolveFlightExtras({ resultIndex, searchTokenId, selections });
      if (!r.ok) throw new Error(r.error);
      extrasTotal = r.total;
    }
    const total = fare.data?.total === null || fare.data?.total === undefined ? fare.data?.total : fare.data.total + extrasTotal;
    const currency = fare.data?.currency?.trim().toUpperCase();
    if (!fare.ok || total === null || total === undefined || !currency) {
      throw new Error("The live fare could not be verified. Please search again.");
    }
    const amountMinor = ZERO_DECIMAL_CURRENCIES.has(currency)
      ? Math.round(total)
      : toMinorUnits(total);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) {
      throw new Error("The live fare could not be verified. Please search again.");
    }
    return { amountMinor, currency, planId: null };
  }

  throw new Error("Online payment is not available for this purchase yet.");
}

function receiptFor(purpose: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WWG-${purpose.toUpperCase().slice(0, 6)}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export async function openOrder(
  input: Omit<OrderInput, "planId"> & {
    amountMinor: number;
    currency: string;
    planId: string | null;
  },
) {

  const userId = await optionalUserId();
  const receipt = receiptFor(input.purpose);

  const order = await createRazorpayOrder({
    amountMinor: input.amountMinor,
    currency: input.currency,
    receipt,
    notes: {
      purpose: input.purpose,
      ...(input.planId ? { plan_id: input.planId } : {}),
      ...(userId ? { user_id: userId } : {}),
    },
  });

  await insertPaymentRecord({
    user_id: userId,
    purpose: input.purpose,
    plan_id: input.planId,
    order_id: order.id,
    amount_minor: input.amountMinor,
    currency: input.currency,
    description: input.description ?? null,
    customer_email: input.email ?? null,
    customer_phone: input.phone ?? null,
    reference: input.reference ?? {},
  });

  return {
    ok: true as const,
    orderId: order.id,
    amountMinor: input.amountMinor,
    currency: input.currency,
    keyId: razorpayKeyId(),
    live: razorpayIsLive(),
    receipt,
  };
}

export async function confirmPayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  if (!verifyCheckoutSignature(input)) {
    // Unverified callers must not be able to change any payment record.
    return { ok: false as const, error: "Payment could not be verified. You have not been charged twice — contact support with your payment id." };
  }

  const record = await getPaymentByOrderId(input.orderId);
  const payment = await fetchRazorpayPayment(input.paymentId);

  if (payment.order_id && payment.order_id !== input.orderId) {
    return { ok: false as const, error: "Payment does not belong to this order." };
  }
  if (record && payment.amount !== Number(record.amount_minor)) {
    await markPaymentStatus({
      orderId: input.orderId,
      status: "failed",
      paymentId: input.paymentId,
      failureReason: "amount_mismatch",
    });
    return { ok: false as const, error: "The captured amount does not match this order." };
  }

  const settled = payment.status === "captured" || payment.status === "authorized";
  await markPaymentStatus({
    orderId: input.orderId,
    status: settled ? "paid" : payment.status,
    paymentId: payment.id,
    ...(settled ? {} : { failureReason: payment.error_description ?? payment.status }),
    providerPayload: {
      status: payment.status,
      method: payment.method ?? null,
      amount: payment.amount,
      currency: payment.currency,
    },
    verified: settled,
  });

  if (!settled) {
    return { ok: false as const, error: "The payment was not completed. Please try again." };
  }

  // Tours: after a verified payment, send to the partner exactly once (atomic claim inside).
  // Customer-facing result carries ONLY a Worldway reference — the partner's reference stays server-side.
  let tour: { confirmed: boolean; worldwayReference: string } | null = null;
  const tourBookingId = (record as { reference?: Record<string, unknown> } | null)?.reference?.["tour_booking_id"];
  if (record?.purpose === "tour" && typeof tourBookingId === "string") {
    let accepted = false;
    try {
      const { createSupplierBooking } = await import("@/lib/travelshop/booking.server");
      const r = await createSupplierBooking(tourBookingId, { id: String(record.user_id ?? ""), email: null });
      accepted = r.ok === true;
    } catch (e) {
      console.error("[tour] booking after payment failed", e instanceof Error ? e.message : e);
    }
    tour = { confirmed: accepted, worldwayReference: (await import("@/lib/travelshop/reference")).worldwayTourRef(tourBookingId) };
  }

  // Flight / hotel / bus booking record: claim the verified payment once and book once.
  let travel: { confirmed: boolean; uncertain: boolean; reference: string; bookingId: string; message: string | null } | null = null;
  const travelBookingId = (record as { reference?: Record<string, unknown> } | null)?.reference?.["travel_booking_id"];
  if (typeof travelBookingId === "string") {
    const { payWithRazorpayAndFulfil, worldwayTravelRef, UNCERTAIN_MESSAGE } = await import("@/lib/up17/booking.server");
    let r: Awaited<ReturnType<typeof payWithRazorpayAndFulfil>> | null = null;
    try {
      r = await payWithRazorpayAndFulfil({ bookingId: travelBookingId, orderId: input.orderId, paymentId: payment.id });
    } catch (e) {
      console.error("[travel] booking after payment failed", e instanceof Error ? e.message : e);
    }
    const res = r as { ok: boolean; confirmed?: boolean; uncertain?: boolean; error?: string } | null;
    travel = {
      confirmed: res?.confirmed === true,
      uncertain: !res || res.uncertain === true,
      reference: worldwayTravelRef(travelBookingId),
      bookingId: travelBookingId,
      message: res?.confirmed ? null : (res?.error ?? UNCERTAIN_MESSAGE),
    };
  }

  if (record?.purpose === "wallet_topup") {
    const { applyWalletTopup } = await import("@/lib/up17/booking.server");
    await applyWalletTopup(input.orderId, payment.amount);
  }

  // Membership: this path is signature-verified, re-fetched from the provider and
  // amount-matched above, so entitlement is applied immediately (idempotent; the
  // webhook applies the same tier as a backstop).
  if (record?.purpose === "membership" && record.user_id && record.plan_id) {
    const { applyVerifiedMembership } = await import("./payments.server");
    await applyVerifiedMembership(String(record.user_id), String(record.plan_id));
  }



  return {
    ok: true as const,
    paymentId: payment.id,
    orderId: input.orderId,
    amountMinor: payment.amount,
    currency: payment.currency,
    method: payment.method ?? null,
    purpose: record?.purpose ?? null,
    planId: record?.plan_id ?? null,
    tour,
    travel,
  };
}
