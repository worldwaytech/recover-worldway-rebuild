// Server-authoritative private aviation quote payment.
import { checkQuotePayable, receiptNumber } from "./quote";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function aviationQuoteAmount(reference: string, userId: string | null) {
  const { data: row } = await (await db()).from("private_aviation_requests").select("*").eq("reference", reference).maybeSingle();
  const c = checkQuotePayable(row, userId);
  if (!c.ok) throw new Error(c.error);
  return { amountMinor: c.amountMinor, currency: c.currency };
}

/** Marks a quote paid after a verified Razorpay payment. Idempotent; safe from checkout and webhook. */
export async function finalizeAviationPayment(input: { reference: string; orderId: string; paymentId: string; userId: string | null }) {
  const d = await db();
  const { data: row } = await d.from("private_aviation_requests").select("*").eq("reference", input.reference).maybeSingle();
  if (!row) return { ok: false as const, error: "Request not found." };
  if (row.paid_at) {
    return row.payment_order_id === input.orderId
      ? { ok: true as const, receiptNumber: row.receipt_number as string, already: true }
      : { ok: false as const, error: "This quote has already been paid." };
  }
  const check = checkQuotePayable(row, input.userId ?? row.user_id);
  if (!check.ok) return { ok: false as const, error: check.error };
  const { claimVerifiedPaymentForFulfilment, recordFulfilment } = await import("@/lib/payments/payments.server");
  const claim = await claimVerifiedPaymentForFulfilment({
    orderId: input.orderId,
    paymentId: input.paymentId,
    expectedUserId: row.user_id,
    expectedPurpose: "private_aviation",
    expectedAmountMinor: check.amountMinor,
    expectedCurrency: check.currency,
  });
  if (!claim.ok) {
    if (claim.reason === "already_fulfilled") {
      const { data: again } = await d.from("private_aviation_requests").select("receipt_number, payment_order_id").eq("id", row.id).maybeSingle();
      if (again?.payment_order_id === input.orderId) return { ok: true as const, receiptNumber: again.receipt_number, already: true };
    }
    return { ok: false as const, error: claim.error };
  }
  const paidAt = new Date();
  const rcpt = receiptNumber(row.reference, paidAt);
  await d
    .from("private_aviation_requests")
    .update({
      status: "paid",
      paid_at: paidAt.toISOString(),
      payment_order_id: input.orderId,
      payment_id: input.paymentId,
      paid_amount: check.amountMinor / 100,
      paid_currency: check.currency,
      receipt_number: rcpt,
    })
    .eq("id", row.id)
    .is("paid_at", null);
  await recordFulfilment(input.orderId, row.reference);
  const { sendAviationEmail } = await import("./emails.server");
  await sendAviationEmail(row.id, row.customer_email, {
    kind: "payment_receipt",
    reference: row.reference,
    customerName: row.customer_name ?? "Guest",
    route: `${row.origin} → ${row.destination}`,
    departureDate: row.departure_date,
    passengers: row.passengers,
    aircraft: row.quote_details?.aircraft ?? row.aircraft_category,
    amount: check.amountMinor / 100,
    currency: check.currency,
    receiptNumber: rcpt,
    paymentId: input.paymentId,
  }).catch(() => null);
  return { ok: true as const, receiptNumber: rcpt };
}
