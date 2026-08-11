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
  applyVerifiedMembership,
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

/** Resolves the amount that will actually be charged. Membership pricing is server-owned. */
export function resolvePaymentAmount(input: OrderInput): {
  amountMinor: number;
  currency: string;
  planId: string | null;
} {
  if (input.purpose === "membership") {
    const planId = input.planId ?? "";
    if (!isMembershipPlanId(planId)) {
      throw new Error("Unknown membership plan.");
    }
    const plan = MEMBERSHIP_PLANS[planId];
    return { amountMinor: plan.amountMinor, currency: plan.currency, planId };
  }

  if (input.amount === undefined) {
    throw new Error("A payment amount is required.");
  }

  const currency = input.currency || "INR";
  const amountMinor = ZERO_DECIMAL_CURRENCIES.has(currency)
    ? Math.round(input.amount)
    : toMinorUnits(input.amount);

  if (!Number.isFinite(amountMinor) || amountMinor < 100) {
    throw new Error("The payment amount is too small to process.");
  }
  if (amountMinor > 200_000_000_00) {
    throw new Error("The payment amount exceeds the permitted limit.");
  }
  return { amountMinor, currency, planId: input.planId ?? null };
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
    await markPaymentStatus({
      orderId: input.orderId,
      status: "failed",
      paymentId: input.paymentId,
      failureReason: "signature_mismatch",
    });
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

  return {
    ok: true as const,
    paymentId: payment.id,
    orderId: input.orderId,
    amountMinor: payment.amount,
    currency: payment.currency,
    method: payment.method ?? null,
    purpose: record?.purpose ?? null,
    planId: record?.plan_id ?? null,
  };
}
