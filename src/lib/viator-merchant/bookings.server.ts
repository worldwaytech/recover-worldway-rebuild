/**
 * Persistence for merchant sandbox bookings — server only, service role.
 * The row keyed by partner_booking_ref is the idempotency anchor: one row per
 * booking attempt, terminal states never walk backwards.
 */
import type { MerchantBookingState } from "@/lib/viator-merchant/booking.server";

type DbError = { message: string } | null;

export type MerchantBookingRow = {
  id: string;
  user_id: string;
  partner_booking_ref: string;
  partner_cart_ref: string | null;
  cart_ref: string | null;
  booking_ref: string | null;
  product_code: string;
  product_title: string | null;
  option_code: string | null;
  start_time: string | null;
  travel_date: string | null;
  language_guide: string | null;
  traveller_count: number;
  retail_price: number | null;
  currency: string;
  status: MerchantBookingState;
  payment_status: string;
  voucher_url: string | null;
  failure_reason: string | null;
  cancellation: unknown;
  booker: unknown;
  booked_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, user_id, partner_booking_ref, partner_cart_ref, cart_ref, booking_ref, product_code, product_title, option_code, start_time, travel_date, language_guide, traveller_count, retail_price, currency, status, payment_status, voucher_url, failure_reason, cancellation, booker, booked_at, cancelled_at, created_at";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function table(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin.from("viator_merchant_bookings" as never);
}

function toRow(data: unknown): MerchantBookingRow | null {
  return (data as MerchantBookingRow | null) ?? null;
}

export async function insertMerchantHold(row: {
  user_id: string;
  partner_booking_ref: string;
  partner_cart_ref: string;
  cart_ref: string;
  booking_ref: string | null;
  product_code: string;
  product_title: string | null;
  option_code: string;
  start_time: string | null;
  travel_date: string;
  language_guide: string | null;
  traveller_count: number;
  retail_price: number | null;
  currency: string;
  booker: Record<string, unknown>;
  audit: Record<string, unknown>;
}): Promise<{ error: string | null }> {
  const t = await table();
  const { error } = (await t.insert({
    ...row,
    status: "held",
    payment_status: "sandbox_not_collected",
  })) as { error: DbError };
  if (error) {
    console.error("[merchant-booking] hold insert failed", error.message);
    return { error: "Could not open the reservation. Please try again." };
  }
  return { error: null };
}

export async function getMerchantBooking(
  partnerBookingRef: string,
): Promise<MerchantBookingRow | null> {
  const t = await table();
  const { data, error } = (await t
    .select(COLUMNS)
    .eq("partner_booking_ref", partnerBookingRef)
    .maybeSingle()) as { data: unknown; error: DbError };
  if (error) {
    console.error("[merchant-booking] lookup failed", error.message);
    return null;
  }
  return toRow(data);
}

export async function listMerchantBookingsForUser(
  userId: string,
): Promise<MerchantBookingRow[]> {
  const t = await table();
  const { data, error } = (await t
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)) as { data: unknown; error: DbError };
  if (error) {
    console.error("[merchant-booking] list failed", error.message);
    return [];
  }
  return (data as MerchantBookingRow[]) ?? [];
}

export async function listAllMerchantBookings(): Promise<MerchantBookingRow[]> {
  const t = await table();
  const { data, error } = (await t
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100)) as { data: unknown; error: DbError };
  if (error) {
    console.error("[merchant-booking] admin list failed", error.message);
    return [];
  }
  return (data as MerchantBookingRow[]) ?? [];
}

/** Atomically claim a held booking for submission (blocks double-submit). */
export async function claimMerchantHold(
  partnerBookingRef: string,
  userId: string,
): Promise<MerchantBookingRow | null> {
  const t = await table();
  const { data, error } = (await t
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("partner_booking_ref", partnerBookingRef)
    .eq("user_id", userId)
    .eq("status", "held")
    .select(COLUMNS)
    .maybeSingle()) as { data: unknown; error: DbError };
  if (error) {
    console.error("[merchant-booking] claim failed", error.message);
    return null;
  }
  return toRow(data);
}

export async function updateMerchantBooking(input: {
  partnerBookingRef: string;
  status: MerchantBookingState;
  bookingRef?: string | null;
  voucherUrl?: string | null;
  retailPrice?: number | null;
  failureReason?: string | null;
  cancellation?: unknown;
}): Promise<void> {
  const t = await table();
  const values: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.bookingRef !== undefined) values["booking_ref"] = input.bookingRef;
  if (input.voucherUrl !== undefined) values["voucher_url"] = input.voucherUrl;
  if (input.retailPrice !== undefined) values["retail_price"] = input.retailPrice;
  if (input.failureReason !== undefined) values["failure_reason"] = input.failureReason;
  if (input.cancellation !== undefined) values["cancellation"] = input.cancellation;
  if (input.status === "confirmed") values["booked_at"] = new Date().toISOString();
  if (input.status === "cancelled") values["cancelled_at"] = new Date().toISOString();
  const { error } = (await t
    .update(values)
    .eq("partner_booking_ref", input.partnerBookingRef)) as { error: DbError };
  if (error) console.error("[merchant-booking] update failed", error.message);
}

/** Return a claimed booking to `held` when the supplier call never happened. */
export async function releaseMerchantClaim(
  partnerBookingRef: string,
  reason: string,
): Promise<void> {
  const t = await table();
  await t
    .update({
      status: "held",
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("partner_booking_ref", partnerBookingRef)
    .eq("status", "pending");
}
