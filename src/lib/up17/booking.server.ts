/**
 * Shared UP17 booking engine for flights, hotels and buses — server only.
 *
 * Lifecycle (travel_bookings.status):
 *   awaiting_payment → paid → supplier_in_progress → confirmed
 *                                                  ↘ supplier_failed   (clear refusal: wallet hold released / Razorpay refund by staff)
 *                                                  ↘ supplier_uncertain (timeout/unknown: money stays held, staff reconcile, never retried)
 * Every transition is a conditional update on the previous status, so one
 * booking record can reach the supplier at most once.
 */
import type { Up17HotelGuest, Up17BusPassenger, Up17Passenger, Up17SupplierBooking } from "./up17.server";

export type TravelProduct = "flight" | "hotel" | "bus";

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);
export const toMinor = (amount: number, currency: string) =>
  ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);

/** Customer-facing Worldway reference — never the supplier's. */
export const worldwayTravelRef = (id: string) => `WWB-${id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;

export const UNCERTAIN_MESSAGE =
  "Payment received. Your booking is being confirmed by the Worldway team — please do not pay again; we will contact you shortly.";
const FAILED_WALLET = "The booking could not be completed. Your wallet hold has been released — nothing was charged.";
const FAILED_CARD = "The booking could not be completed. Your payment will be refunded in full by the Worldway team.";

export type HotelPayload = {
  kind: "hotel";
  resultIndex: string;
  hotelCode: string;
  hotelName: string;
  searchTokenId: string;
  nationality: string;
  rooms: { roomIndex: number; guests: Up17HotelGuest[] }[];
};
export type BusPayload = {
  kind: "bus";
  resultIndex: string;
  searchTokenId: string;
  boardingPointId: number;
  droppingPointId: number;
  passengers: Up17BusPassenger[];
};
export type FlightPayload = {
  kind: "flight";
  resultIndex: string;
  searchTokenId: string;
  passengers: Up17Passenger[];
};
export type SupplierPayload = HotelPayload | BusPayload | FlightPayload;

export type TravelBookingRow = {
  id: string;
  user_id: string;
  product: TravelProduct;
  status: string;
  currency: string;
  amount_minor: number;
  payment_method: string | null;
  payment_order_id: string | null;
  payment_id: string | null;
  wallet_reserve_key: string | null;
  summary: Record<string, unknown>;
  supplier_payload: SupplierPayload;
  supplier_booking_id: string | null;
  supplier_pnr: string | null;
  customer_message: string | null;
  expires_at: string;
  paid_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(action: string, bookingId: string, details: Record<string, unknown>) {
  try {
    const sb = await db();
    await sb.from("admin_audit_log").insert({
      action,
      target_type: "travel_booking",
      target_id: bookingId,
      details,
    });
  } catch (e) {
    console.error("[travel-booking] audit failed", action, e instanceof Error ? e.message : e);
  }
}

export async function createIntent(input: {
  userId: string;
  product: TravelProduct;
  amount: number;
  currency: string;
  summary: Record<string, unknown>;
  payload: SupplierPayload;
}) {
  const currency = input.currency.toUpperCase();
  const amountMinor = toMinor(input.amount, currency);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) throw new Error("The live price could not be verified.");
  const sb = await db();
  const { data, error } = await sb
    .from("travel_bookings")
    .insert({
      user_id: input.userId,
      product: input.product,
      currency,
      amount_minor: amountMinor,
      summary: input.summary,
      supplier_payload: input.payload,
    })
    .select("id, amount_minor, currency, expires_at")
    .single();
  if (error || !data) throw new Error("Could not save the booking. Please try again.");
  await audit("travel_booking.created", data.id, { product: input.product, amount_minor: amountMinor, currency });
  return {
    bookingId: data.id as string,
    reference: worldwayTravelRef(data.id),
    amountMinor: Number(data.amount_minor),
    currency: data.currency as string,
    expiresAt: data.expires_at as string,
  };
}

export async function getBooking(id: string): Promise<TravelBookingRow | null> {
  const sb = await db();
  const { data } = await sb.from("travel_bookings").select("*").eq("id", id).maybeSingle();
  return (data as TravelBookingRow) ?? null;
}

/** Amount for a Razorpay order — owner-only, unpaid, unexpired intent. */
export async function travelPaymentAmount(id: string, userId: string | null) {
  const row = await getBooking(id);
  if (!row || !userId || row.user_id !== userId) throw new Error("Booking not found.");
  if (row.status !== "awaiting_payment") throw new Error("This booking has already been paid or closed.");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("This price has expired. Please check availability again.");
  return { amountMinor: Number(row.amount_minor), currency: row.currency, planId: null, product: row.product };
}

export async function attachOrder(id: string, orderId: string) {
  const sb = await db();
  await sb.from("travel_bookings").update({ payment_order_id: orderId }).eq("id", id).eq("status", "awaiting_payment");
}

/** Called after Razorpay capture is verified and amount-matched. */
export async function payWithRazorpayAndFulfil(input: { bookingId: string; orderId: string; paymentId: string }) {
  const row = await getBooking(input.bookingId);
  if (!row) return { ok: false as const, error: "Booking not found." };
  const { claimVerifiedPaymentForFulfilment } = await import("@/lib/payments/payments.server");
  const claim = await claimVerifiedPaymentForFulfilment({
    orderId: input.orderId,
    paymentId: input.paymentId,
    expectedUserId: row.user_id,
    expectedPurpose: row.product,
    expectedAmountMinor: Number(row.amount_minor),
    expectedCurrency: row.currency,
  });
  if (!claim.ok) return { ok: false as const, error: claim.error };
  const sb = await db();
  const { data } = await sb
    .from("travel_bookings")
    .update({ status: "paid", payment_method: "razorpay", payment_order_id: input.orderId, payment_id: input.paymentId, paid_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "awaiting_payment")
    .select("id")
    .maybeSingle();
  if (!data) {
    await audit("travel_booking.payment_without_open_booking", row.id, { order_id: input.orderId });
    return { ok: false as const, error: UNCERTAIN_MESSAGE };
  }
  await audit("travel_booking.paid", row.id, { method: "razorpay", order_id: input.orderId });
  return fulfil(row.id);
}

/** Wallet: hold funds atomically, mark paid, then book once. */
export async function payWithWalletAndFulfil(bookingId: string, userId: string) {
  const row = await getBooking(bookingId);
  if (!row || row.user_id !== userId) return { ok: false as const, error: "Booking not found." };
  if (row.status !== "awaiting_payment") return { ok: false as const, error: "This booking has already been paid or closed." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const, error: "This price has expired. Please check availability again." };
  const sb = await db();
  const key = `booking:${row.id}`;
  const { data: reserved, error } = await sb.rpc("wallet_reserve", {
    _user: userId,
    _currency: row.currency,
    _amount: Number(row.amount_minor),
    _key: key,
    _booking: row.id,
  });
  if (error) return { ok: false as const, error: "The wallet could not be charged. Nothing was taken." };
  if (!reserved) return { ok: false as const, error: "Your wallet balance is not enough for this booking." };
  const { data } = await sb
    .from("travel_bookings")
    .update({ status: "paid", payment_method: "wallet", wallet_reserve_key: key, paid_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "awaiting_payment")
    .select("id")
    .maybeSingle();
  if (!data) {
    await sb.rpc("wallet_settle", { _reserve_key: key, _capture: false });
    return { ok: false as const, error: "This booking has already been paid or closed." };
  }
  await audit("travel_booking.paid", row.id, { method: "wallet" });
  return fulfil(row.id);
}

type Outcome =
  | { kind: "confirmed"; booking: Up17SupplierBooking }
  | { kind: "refused"; error: string }
  | { kind: "uncertain"; error: string };

/** Pure outcome classification — exported for tests. */
export function classifyOutcome(res: { ok: boolean; status: number; error?: string; data?: Up17SupplierBooking } | null): Outcome {
  if (!res) return { kind: "uncertain", error: "no response" };
  if (!res.ok && (res.status === 0 || res.status >= 500)) return { kind: "uncertain", error: res.error ?? "supplier timeout" };
  if (!res.ok) return { kind: "refused", error: res.error ?? "refused" };
  if (res.data?.confirmed) return { kind: "confirmed", booking: res.data };
  return { kind: "uncertain", error: "supplier response did not confirm the booking" };
}

async function callSupplier(p: SupplierPayload) {
  const s = await import("./up17.server");
  if (p.kind === "hotel") return s.up17HotelBook(p);
  if (p.kind === "bus") return s.up17BusBook(p);
  const r = await s.up17BookFlight(p);
  if (!r.ok) return { ok: false, status: r.status, error: r.error };
  const b = r.data!;
  const status = b.status ?? "";
  return {
    ok: true,
    status: r.status,
    data: {
      bookingId: b.bookingId,
      confirmationNo: b.pnr,
      status: b.status,
      confirmed: !!b.pnr && !/fail|cancel|reject/i.test(status),
      raw: b,
    },
  };
}

export async function fulfil(bookingId: string) {
  const sb = await db();
  const { data: claimed } = await sb
    .from("travel_bookings")
    .update({ status: "supplier_in_progress" })
    .eq("id", bookingId)
    .eq("status", "paid")
    .select("*")
    .maybeSingle();
  if (!claimed) return { ok: false as const, error: "This booking is already being processed." };
  const row = claimed as TravelBookingRow;
  const reference = worldwayTravelRef(row.id);
  await audit("travel_booking.sent_to_supplier", row.id, { product: row.product });

  if (row.product === "flight") {
    // Re-price immediately before ticketing; never ticket against a changed fare.
    const { up17ConfirmFare } = await import("./up17.server");
    const p = row.supplier_payload as FlightPayload;
    const fare = await up17ConfirmFare({ resultIndex: p.resultIndex, searchTokenId: p.searchTokenId }).catch(() => null);
    const extras = Number((row.summary as { extrasTotal?: number }).extrasTotal ?? 0);
    const live = fare?.ok && fare.data?.total != null ? toMinor(fare.data.total + extras, fare.data.currency) : null;
    if (live === null || live !== Number(row.amount_minor)) {
      return finish(row, { kind: "refused", error: "The fare changed before ticketing." }, reference);
    }
  }

  let res: Awaited<ReturnType<typeof callSupplier>> | null = null;
  try {
    res = await callSupplier(row.supplier_payload);
  } catch (e) {
    console.error("[travel-booking] supplier call threw", row.id, e instanceof Error ? e.message : e);
    res = null;
  }
  return finish(row, classifyOutcome(res as Parameters<typeof classifyOutcome>[0]), reference);
}

async function finish(row: TravelBookingRow, outcome: Outcome, reference: string) {
  const sb = await db();
  const wallet = row.payment_method === "wallet" && row.wallet_reserve_key;
  if (outcome.kind === "confirmed") {
    await sb
      .from("travel_bookings")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        supplier_booking_id: outcome.booking.bookingId,
        supplier_pnr: outcome.booking.confirmationNo,
        supplier_response: { status: outcome.booking.status, raw: outcome.booking.raw },
        customer_message: null,
      })
      .eq("id", row.id);
    if (wallet) await sb.rpc("wallet_settle", { _reserve_key: row.wallet_reserve_key, _capture: true });
    if (row.payment_order_id) {
      const { recordFulfilment } = await import("@/lib/payments/payments.server");
      await recordFulfilment(row.payment_order_id, outcome.booking.confirmationNo ?? outcome.booking.bookingId ?? reference);
    }
    await audit("travel_booking.confirmed", row.id, { supplier_booking_id: outcome.booking.bookingId });
    return { ok: true as const, confirmed: true as const, reference, bookingId: row.id };
  }
  if (outcome.kind === "refused") {
    const msg = wallet ? FAILED_WALLET : FAILED_CARD;
    await sb.from("travel_bookings").update({ status: "supplier_failed", customer_message: msg, supplier_response: { error: outcome.error } }).eq("id", row.id);
    if (wallet) await sb.rpc("wallet_settle", { _reserve_key: row.wallet_reserve_key, _capture: false });
    await audit("travel_booking.supplier_refused", row.id, { error: outcome.error, refund_needed: !wallet });
    return { ok: false as const, confirmed: false as const, reference, bookingId: row.id, error: msg };
  }
  // Uncertain: keep the money held, never retry automatically.
  await sb.from("travel_bookings").update({ status: "supplier_uncertain", customer_message: UNCERTAIN_MESSAGE, supplier_response: { error: outcome.error } }).eq("id", row.id);
  await audit("travel_booking.supplier_uncertain", row.id, { error: outcome.error });
  return { ok: false as const, confirmed: false as const, uncertain: true as const, reference, bookingId: row.id, error: UNCERTAIN_MESSAGE };
}

/** Customer-safe view — no supplier ids, payloads or responses. */
export function customerView(r: TravelBookingRow) {
  const label: Record<string, string> = {
    awaiting_payment: "Awaiting payment",
    paid: "Confirming",
    supplier_in_progress: "Confirming",
    confirmed: "Confirmed",
    supplier_failed: "Not booked",
    supplier_uncertain: "Worldway team finalising",
    cancel_requested: "Cancellation requested",
    cancelled: "Cancelled",
    refunded: "Refunded",
    expired: "Expired",
  };
  return {
    id: r.id,
    reference: worldwayTravelRef(r.id),
    product: r.product,
    status: r.status,
    statusLabel: label[r.status] ?? r.status,
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    paymentMethod: r.payment_method,
    summary: r.summary,
    message: r.customer_message,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
    canCancel: r.status === "confirmed" && r.product === "hotel",
  };
}

// ---------------------------------------------------------- wallet top-up

/** Credits a verified, amount-matched Razorpay top-up once (idempotent on the order id). */
export async function applyWalletTopup(orderId: string, capturedAmountMinor?: number) {
  const { getPaymentByOrderId } = await import("@/lib/payments/payments.server");
  const rec = await getPaymentByOrderId(orderId);
  if (!rec || rec.purpose !== "wallet_topup" || rec.status !== "paid" || !rec.user_id) return false;
  if (capturedAmountMinor !== undefined && capturedAmountMinor !== Number(rec.amount_minor)) return false;
  const sb = await db();
  const { data } = await sb.rpc("wallet_topup", {
    _user: rec.user_id,
    _currency: rec.currency.toUpperCase(),
    _amount: Number(rec.amount_minor),
    _key: `topup:${orderId}`,
    _order: orderId,
  });
  return data === true;
}

export async function walletSnapshot(userId: string) {
  const sb = await db();
  const [{ data: accounts }, { data: ledger }] = await Promise.all([
    sb.from("wallet_accounts").select("currency, balance_minor, reserved_minor").eq("user_id", userId),
    sb.from("wallet_ledger").select("id, kind, amount_minor, currency, booking_id, note, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    accounts: ((accounts ?? []) as { currency: string; balance_minor: number; reserved_minor: number }[]).map((a) => ({
      currency: a.currency,
      balanceMinor: Number(a.balance_minor),
      reservedMinor: Number(a.reserved_minor),
      availableMinor: Number(a.balance_minor) - Number(a.reserved_minor),
    })),
    ledger: ((ledger ?? []) as { id: string; kind: string; amount_minor: number; currency: string; booking_id: string | null; note: string | null; created_at: string }[]).map((l) => ({
      id: l.id,
      kind: l.kind,
      amountMinor: Number(l.amount_minor),
      currency: l.currency,
      reference: l.booking_id ? worldwayTravelRef(l.booking_id) : null,
      note: l.note,
      createdAt: l.created_at,
    })),
  };
}

// ---------------------------------------------------------- staff reconciliation

export async function staffResolve(input: { bookingId: string; action: "release_wallet" | "refund_wallet" | "mark_confirmed" | "mark_failed"; staffId: string; supplierReference?: string }) {
  const row = await getBooking(input.bookingId);
  if (!row) throw new Error("Booking not found.");
  const sb = await db();
  if (input.action === "mark_confirmed") {
    if (row.status !== "supplier_uncertain") throw new Error("Only unclear bookings can be confirmed by staff.");
    if (!input.supplierReference) throw new Error("Enter the partner's confirmed reference.");
    await sb.from("travel_bookings").update({ status: "confirmed", confirmed_at: new Date().toISOString(), supplier_pnr: input.supplierReference, customer_message: null }).eq("id", row.id).eq("status", "supplier_uncertain");
    if (row.wallet_reserve_key) await sb.rpc("wallet_settle", { _reserve_key: row.wallet_reserve_key, _capture: true });
  } else if (input.action === "mark_failed" || input.action === "release_wallet") {
    if (row.status !== "supplier_uncertain") throw new Error("Only unclear bookings can be closed this way.");
    await sb.from("travel_bookings").update({ status: "supplier_failed", customer_message: row.wallet_reserve_key ? FAILED_WALLET : FAILED_CARD }).eq("id", row.id).eq("status", "supplier_uncertain");
    if (row.wallet_reserve_key) await sb.rpc("wallet_settle", { _reserve_key: row.wallet_reserve_key, _capture: false });
  } else if (input.action === "refund_wallet") {
    if (!["supplier_failed", "cancelled"].includes(row.status)) throw new Error("Refunds apply to failed or cancelled bookings.");
    const { data } = await sb.rpc("wallet_refund", {
      _user: row.user_id,
      _currency: row.currency,
      _amount: Number(row.amount_minor),
      _key: `refund:${row.id}`,
      _booking: row.id,
      _note: `Refund ${worldwayTravelRef(row.id)}`,
    });
    if (!data) throw new Error("This booking was already refunded.");
    await sb.from("travel_bookings").update({ status: "refunded" }).eq("id", row.id);
  }
  await audit(`travel_booking.staff_${input.action}`, row.id, { staff_id: input.staffId });
  return { ok: true as const };
}
