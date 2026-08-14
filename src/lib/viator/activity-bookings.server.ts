/**
 * Persistence for Viator hosted-payment activity bookings — server only.
 * The row is the single source of truth for idempotency: a cart may be booked
 * exactly once, and a terminal state can never be walked backwards.
 */
import type { ActivityBookingState } from "@/lib/viator/checkout-contract";

type DbError = { message: string } | null;

export type ActivityBookingRow = {
  id: string;
  user_id: string | null;
  cart_reference: string;
  product_code: string;
  product_title: string | null;
  travel_date: string | null;
  traveller_count: number;
  amount_minor: number;
  currency: string;
  status: ActivityBookingState;
  payment_status: string;
  hold_expires_at: string | null;
  session_expires_at: string | null;
  booking_reference: string | null;
  itinerary_reference: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  failure_reason: string | null;
  booked_at: string | null;
  audit: unknown;
};

type Table = {
  insert: (values: Record<string, unknown>) => Promise<{ error: DbError }>;
  select: (columns: string) => {
    eq: (
      column: string,
      value: string,
    ) => {
      maybeSingle: () => Promise<{ data: unknown; error: DbError }>;
    };
  };
  update: (values: Record<string, unknown>) => {
    eq: (
      column: string,
      value: string,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: DbError }>;
        };
      };
    } & Promise<{ error: DbError }>;
  };
};

async function table(): Promise<Table> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.from as unknown as (t: string) => Table)("viator_activity_bookings");
}

export async function insertActivityHold(row: {
  user_id: string | null;
  cart_reference: string;
  product_code: string;
  product_title: string | null;
  travel_date: string;
  traveller_count: number;
  amount_minor: number;
  currency: string;
  hold_expires_at: string | null;
  session_expires_at: string | null;
  customer_email: string;
  customer_phone: string | null;
  audit: Record<string, unknown>;
}): Promise<void> {
  const t = await table();
  const { error } = await t.insert({ ...row, status: "held", payment_status: "pending" });
  if (error) {
    console.error("[viator-booking] hold insert failed", error.message);
    throw new Error("Could not open the reservation. Please try again.");
  }
}

export async function getActivityBooking(cartRef: string): Promise<ActivityBookingRow | null> {
  const t = await table();
  const { data, error } = await t
    .select(
      "id, user_id, cart_reference, product_code, product_title, travel_date, traveller_count, amount_minor, currency, status, payment_status, hold_expires_at, session_expires_at, booking_reference, itinerary_reference, customer_email, customer_phone, failure_reason, booked_at, audit",
    )
    .eq("cart_reference", cartRef)
    .maybeSingle();
  if (error) {
    console.error("[viator-booking] lookup failed", error.message);
    return null;
  }
  return (data as ActivityBookingRow | null) ?? null;
}

/**
 * Atomically claims a held cart for submission. Only a row still in `held`
 * flips to `submitting`, so concurrent double-clicks cannot both charge.
 */
export async function claimHoldForBooking(input: {
  cartRef: string;
  billingCountry: string;
  billingPostalCode: string;
}): Promise<ActivityBookingRow | null> {
  const t = await table();
  const { data, error } = await t
    .update({
      status: "submitting",
      payment_status: "authorising",
      billing_country: input.billingCountry,
      billing_postal_code: input.billingPostalCode,
      updated_at: new Date().toISOString(),
    })
    .eq("cart_reference", input.cartRef)
    .eq("status", "held")
    .select("id, cart_reference, product_code, amount_minor, currency, traveller_count, status")
    .maybeSingle();
  if (error) {
    console.error("[viator-booking] claim failed", error.message);
    return null;
  }
  return (data as ActivityBookingRow | null) ?? null;
}

export async function finaliseActivityBooking(input: {
  cartRef: string;
  status: ActivityBookingState;
  paymentStatus: string;
  bookingReference?: string | null;
  itineraryReference?: string | null;
  failureReason?: string | null;
  audit?: Record<string, unknown> | null;
}): Promise<void> {
  const t = await table();
  const values: Record<string, unknown> = {
    status: input.status,
    payment_status: input.paymentStatus,
    updated_at: new Date().toISOString(),
  };
  if (input.bookingReference !== undefined) values["booking_reference"] = input.bookingReference;
  if (input.itineraryReference !== undefined) {
    values["itinerary_reference"] = input.itineraryReference;
  }
  if (input.failureReason !== undefined) values["failure_reason"] = input.failureReason;
  if (input.audit) values["audit"] = input.audit;
  if (input.status === "confirmed" || input.status === "paid_pending_confirmation") {
    values["booked_at"] = new Date().toISOString();
  }
  const { error } = await (
    t.update(values).eq("cart_reference", input.cartRef) as unknown as Promise<{ error: DbError }>
  );
  if (error) console.error("[viator-booking] finalise failed", error.message);
}

/** Returns a claimed cart to `held` when the supplier call never charged. */
export async function releaseHoldClaim(cartRef: string, reason: string): Promise<void> {
  const t = await table();
  await (
    t
      .update({
        status: "held",
        payment_status: "pending",
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("cart_reference", cartRef) as unknown as Promise<{ error: DbError }>
  );
}
