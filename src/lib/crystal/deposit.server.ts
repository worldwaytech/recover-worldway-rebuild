/**
 * Crystal deposit checkout — server only. Plugs Crystal into the shared paid
 * booking engine (src/lib/up17/booking.server.ts, travel_bookings):
 *
 *   held suite (live revalidated) → deposit in supplier currency (Crystal's own
 *   option %) → live FX lock to INR (approved providers, 20-min lock) →
 *   Razorpay (within limit) or Worldway Wallet → ONE Crystal Option call →
 *   genuine Crystal booking number stored.
 *
 * Timeouts/5xx on the Option call are "uncertain": money stays held, staff
 * reconcile, never retried.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CruisePayload = {
  kind: "cruise";
  crystalBookingId: string;
  idempotencyKey: string;
  supplierCurrency: string;
  depositSupplier: number;
  totalSupplier: number;
  fx: { rate: number; provider: string; ratesAt: string | null; lockedAt: string };
};

/** Default Razorpay single-transaction ceiling (INR), overridable via env. */
export function razorpayLimitMinor(): number {
  const v = Number(process.env["RAZORPAY_MAX_TXN_INR"] ?? "");
  return Math.round((Number.isFinite(v) && v > 0 ? v : 500_000) * 100);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: deposit from Crystal's own option percentage. Exported for tests. */
export function depositFrom(total: number, depositPercent: number | null | undefined): number | null {
  if (!(total > 0) || !(typeof depositPercent === "number" && depositPercent > 0 && depositPercent <= 100)) return null;
  return round2((total * depositPercent) / 100);
}

export async function prepareCruiseDeposit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  userId: string,
  input: { crystalBookingId: string; policyVersion: string },
) {
  const { bookingCapability } = await import("./aktg-booking.server");
  if (!bookingCapability().live) return { ok: false as const, error: "Online cruise booking is temporarily unavailable." };

  const { data: row } = await client
    .from("bookings")
    .select("id, user_id, status, amount, currency, deposit_amount, supplier_reference, idempotency_key, details, title, reference, product_type, travel_date")
    .eq("id", input.crystalBookingId)
    .maybeSingle();
  if (!row || row.user_id !== userId || row.product_type !== "crystal_cruise") return { ok: false as const, error: "Reservation not found." };
  if (row.supplier_reference) return { ok: false as const, error: "This reservation is already with Crystal." };
  const d = (row.details ?? {}) as Record<string, unknown>;
  if (!d["suiteHeld"]) return { ok: false as const, error: "Choose a suite first so it can be held for you." };
  const holdExpires = d["holdExpiresAt"] ? Date.parse(String(d["holdExpiresAt"])) : NaN;
  if (Number.isFinite(holdExpires) && holdExpires < Date.now() + 2 * 60_000) {
    return { ok: false as const, error: "Your suite hold is about to expire. Please choose the suite again." };
  }

  const total = Number(row.amount);
  const deposit = row.deposit_amount != null ? Number(row.deposit_amount) : depositFrom(total, d["depositPercent"] as number | null);
  if (!deposit || !(deposit > 0)) {
    return { ok: false as const, error: "Crystal did not publish a deposit for this fare, so it can't be paid online. Our cruise desk will contact you." };
  }

  const { recordCancellationPolicyAcceptance } = await import("./booking.server");
  await recordCancellationPolicyAcceptance(client as never, row.id, input.policyVersion);

  const currency = String(row.currency).toUpperCase();
  const { approvedFx } = await import("@/lib/engine/suppliers/fx.server");
  const fx = await approvedFx("INR", [currency]);
  const rate = fx.table[currency];
  if (currency !== "INR" && (!fx.source || !(rate > 0))) {
    return { ok: false as const, error: "Live exchange rates are unavailable right now. Please try again in a few minutes." };
  }
  const inr = round2(deposit * (currency === "INR" ? 1 : rate));

  const payload: CruisePayload = {
    kind: "cruise",
    crystalBookingId: row.id,
    idempotencyKey: `${row.idempotency_key ?? row.id}_option`,
    supplierCurrency: currency,
    depositSupplier: deposit,
    totalSupplier: total,
    fx: { rate: currency === "INR" ? 1 : rate, provider: fx.source ?? "identity", ratesAt: fx.audit.ratesAt, lockedAt: new Date().toISOString() },
  };
  const { createIntent } = await import("@/lib/up17/booking.server");
  const intent = await createIntent({
    userId,
    product: "cruise",
    amount: inr,
    currency: "INR",
    summary: {
      title: String(row.title ?? "Crystal cruise"),
      cruiseReference: row.reference,
      deposit: `${currency} ${deposit.toLocaleString()}`,
      total: `${currency} ${total.toLocaleString()}`,
      exchangeRate: currency === "INR" ? null : `1 ${currency} = ₹${rate.toFixed(4)}`,
      lead: [((d["guests"] as { firstName?: string; lastName?: string }[] | undefined)?.[0]?.firstName ?? ""), ((d["guests"] as { lastName?: string }[] | undefined)?.[0]?.lastName ?? "")].join(" ").trim() || null,
      guests: Number(d["guestCount"] ?? 0) || null,
      departure: (row.travel_date as string | null) ?? null,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: payload as any,
  });
  return {
    ok: true as const,
    ...intent,
    depositSupplier: deposit,
    supplierCurrency: currency,
    fxRate: payload.fx.rate,
    cardAllowed: intent.amountMinor <= razorpayLimitMinor(),
    cardLimitMinor: razorpayLimitMinor(),
  };
}

type SupplierResult = { ok: boolean; status: number; error?: string; data?: { bookingId: string | null; confirmationNo: string | null; status: string | null; confirmed: boolean; raw: unknown } };

/** Exactly one Crystal Option call for a paid deposit. */
export async function bookCrystalOption(p: CruisePayload): Promise<SupplierResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { confirmCrystalBooking } = await import("./booking.server");
  const { CrystalSupplierCallError } = await import("./aktg-booking.server");
  // One Option per cruise reservation, even if two deposits were paid: claim the
  // reservation atomically; a second paid intent is refused (and refunded).
  const { data: claim } = await supabaseAdmin
    .from("bookings")
    .update({ supplier_status: "option_in_progress" })
    .eq("id", p.crystalBookingId)
    .is("supplier_reference", null)
    .neq("supplier_status", "option_in_progress")
    .select("id, supplier_status")
    .maybeSingle();
  if (!claim) return { ok: false, status: 409, error: "This reservation has already been sent to Crystal." };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await confirmCrystalBooking(supabaseAdmin as any, p.crystalBookingId, p.idempotencyKey);
    const ref = r.booking.supplierReference ?? null;
    if (ref) {
      // Record the paid deposit on the cruise reservation (supplier currency).
      await supabaseAdmin
        .from("bookings")
        .update({ amount_paid: p.depositSupplier, balance_due: Math.max(0, Math.round((p.totalSupplier - p.depositSupplier) * 100) / 100) })
        .eq("id", p.crystalBookingId);
      return { ok: true, status: 200, data: { bookingId: ref, confirmationNo: ref, status: r.booking.status, confirmed: true, raw: { status: r.booking.status } } };
    }
    // Blocked before any supplier call (hold expired, missing data): safe refusal.
    if ("blockedReason" in r && r.blockedReason) return { ok: false, status: 400, error: r.message };
    return { ok: false, status: 0, error: "Crystal accepted the request without returning a booking number." };
  } catch (e) {
    if (e instanceof CrystalSupplierCallError) return { ok: false, status: e.status, error: e.message };
    const msg = e instanceof Error ? e.message : "unknown";
    // Validation errors thrown before calling Crystal (e.g. hold expired) are safe refusals.
    if (/expired|cancelled|not found/i.test(msg)) return { ok: false, status: 400, error: msg };
    return { ok: false, status: 0, error: msg };
  }
}
