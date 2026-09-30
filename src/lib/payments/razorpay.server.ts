/**
 * Razorpay server layer — never import this from client code.
 *
 * Handles order creation, signature verification and payment fetches against
 * the Razorpay REST API using Basic auth (key_id:key_secret).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.razorpay.com/v1";

function credentials(): { keyId: string; keySecret: string } {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured on this environment.");
  }
  return { keyId, keySecret };
}

export function razorpayKeyId(): string {
  return credentials().keyId;
}

export function razorpayIsLive(): boolean {
  return credentials().keyId.startsWith("rzp_live_");
}

async function callRazorpay<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const { keyId, keySecret } = credentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const description =
      (parsed as { error?: { description?: string } } | null)?.error?.description ??
      `Razorpay request failed (${res.status})`;
    // Log provider detail server-side only.
    console.error("[razorpay] request failed", path, res.status, text.slice(0, 500));
    throw new Error(description);
  }

  return parsed as T;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string | null;
};

export async function createRazorpayOrder(input: {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  return callRazorpay<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt.slice(0, 40),
      payment_capture: 1,
      ...(input.notes ? { notes: input.notes } : {}),
    },
  });
}

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  status: string;
  amount: number;
  currency: string;
  method?: string | null;
  email?: string | null;
  contact?: string | null;
  captured?: boolean;
  error_description?: string | null;
};

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return callRazorpay<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Checkout handoff signature: HMAC-SHA256 of `order_id|payment_id` with the key secret. */
export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  const expected = createHmac("sha256", keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, input.signature.trim().toLowerCase());
}

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature.trim().toLowerCase());
}

/** Full refund of a captured payment. Idempotent on our side via the caller's atomic claim. */
export async function refundRazorpayPayment(paymentId: string, amountMinor: number, receipt: string) {
  return callRazorpay<{ id: string; status: string; amount: number }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: { amount: amountMinor, speed: "normal", receipt, notes: { reason: "Worldway tour booking could not be confirmed" } },
  });
}
