// Server-authoritative amount for a pending pre-purchased flight booking.
const PRODUCT_TYPE = "prepurchased_flight";

/** Used by the payment layer: server-authoritative amount for a pending booking. */
export async function prePurchasedAmount(bookingId: string, userId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: b } = await supabaseAdmin.from("bookings").select("user_id, amount, status, product_type, amount_paid, details").eq("id", bookingId).single();
  if (!b || b.product_type !== PRODUCT_TYPE || !userId || b.user_id !== userId || b.status !== "pending" || Number(b.amount_paid) > 0) {
    throw new Error("This booking can't be paid.");
  }
  const d = b.details as Record<string, any>;
  const { airiqSearch } = await import("./client.server");
  const live = (await airiqSearch({ ...d["search"], ...d["pax"] })).find((f) => f.ticketId === d["ticketId"]);
  if (!live || live.price !== Number(d["fare"]?.price)) throw new Error("This fare has changed. Please search again.");
  return { amountMinor: Math.round(Number(b.amount) * 100), currency: "INR" };
}

