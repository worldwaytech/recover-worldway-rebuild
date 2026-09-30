// Tour booking chain — SERVER ONLY.
//
// Flow: live quote → Worldway booking record (awaiting_supplier_authorization)
// → [GATED] supplier new-booking → reference_id + token stored → supplier
// payment-request → Worldway payment → status refresh.
//
// The supplier write is HARD GATED: it refuses unless TRAVELSHOP_BOOKING_ENABLED
// === "true". No Worldway record is ever marked confirmed without a supplier
// reference returned by the real API.
import { TRAVELSHOP_PATHS, travelshopRequest } from "./client.server";
import { liveQuote, type ServiceType } from "./catalogue.server";

export const TOUR_BOOKING_FLAG = "TRAVELSHOP_BOOKING_ENABLED";
export function tourBookingsEnabled() {
  return (process.env[TOUR_BOOKING_FLAG] ?? "").trim().toLowerCase() === "true";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface PrepareInput {
  userId: string;
  slug: string;
  date: string;
  service: ServiceType;
  adults: number;
  children: number;
  infants: number;
  rooms?: { single?: number; double?: number; triple?: number };
  lead: { firstName: string; lastName: string; email: string; phone: string; nationality?: string };
  specialRequests?: string;
}

const event = (type: string, detail: string) => ({ at: new Date().toISOString(), type, detail });

/** Revalidates live, then records the Worldway booking. Never calls the supplier write. */
export async function prepareTourBooking(input: PrepareInput) {
  const db = await admin();
  const { data: tour } = await db.from("travelshop_tours").select("external_id, slug, name, is_active, max_pax").eq("slug", input.slug).maybeSingle();
  if (!tour || !tour.is_active) return { ok: false as const, reason: "This tour is no longer available." };
  const q = await liveQuote(input);
  if (!q.ok) return q;
  const { data, error } = await db.from("travelshop_bookings").insert({
    user_id: input.userId,
    tour_external_id: tour.external_id,
    tour_slug: tour.slug,
    tour_name: tour.name,
    tour_date: input.date,
    service_type: input.service,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    rooms: input.rooms ?? {},
    lead_traveller: input.lead,
    special_requests: input.specialRequests ?? null,
    supplier_currency: q.currency,
    supplier_retail_total: q.retailTotal,
    markup_percent: q.rule.markupPercent,
    pricing_basis: q.rule.basis,
    customer_currency: q.currency,
    customer_total: q.customerTotal,
    price_checked_at: q.checkedAt,
    status: "awaiting_supplier_authorization",
    events: [event("live_revalidated", `${q.currency} ${q.customerTotal}`), event("record_created", "Awaiting supplier booking authorisation")],
  }).select("id, status, customer_currency, customer_total, price_checked_at").single();
  if (error) throw new Error("Could not save the booking request");
  return { ok: true as const, booking: data, bookingOpen: tourBookingsEnabled() };
}

/**
 * FINAL supplier call. Gated. Revalidates immediately before booking and
 * refuses if the live price moved. Only runs once staff enable the flag.
 */
export async function createSupplierBooking(bookingId: string) {
  if (!tourBookingsEnabled()) {
    return { ok: false as const, reason: "Supplier booking is not yet authorised." };
  }
  const db = await admin();
  const { data: b } = await db.from("travelshop_bookings").select("*").eq("id", bookingId).single();
  if (!b || b.status !== "awaiting_supplier_authorization") return { ok: false as const, reason: "Booking is not awaiting supplier creation." };
  const q = await liveQuote({ slug: b.tour_slug, date: b.tour_date, service: b.service_type as ServiceType, adults: b.adults, children: b.children, infants: b.infants });
  if (!q.ok || q.retailTotal !== Number(b.supplier_retail_total)) {
    await db.from("travelshop_bookings").update({ status: "price_changed", events: [...(b.events as unknown[]), event("revalidation_failed", q.ok ? `now ${q.currency} ${q.customerTotal}` : q.reason)] }).eq("id", bookingId);
    return { ok: false as const, reason: "The live price or availability changed. Please re-confirm." };
  }
  const lead = b.lead_traveller as PrepareInput["lead"];
  const res = await travelshopRequest<Record<string, unknown>>(TRAVELSHOP_PATHS.newBooking, {
    method: "POST",
    maxRetries: 0, // never auto-retry a booking write
    timeoutMs: 90_000,
    body: {
      tour_id: b.tour_external_id,
      date: b.tour_date,
      type: b.service_type,
      adl: b.adults,
      chd: b.children,
      inf: b.infants,
      rooms: b.rooms,
      customer: { first_name: lead.firstName, last_name: lead.lastName, email: lead.email, phone: lead.phone, nationality: lead.nationality },
      note: b.special_requests ?? undefined,
      external_reference: b.id,
    },
  });
  const ref = String(res["reference_id"] ?? res["referenceId"] ?? "");
  const token = String(res["token"] ?? res["booking_token"] ?? "");
  if (!ref) {
    await db.from("travelshop_bookings").update({ status: "supplier_failed", supplier_response: res, events: [...(b.events as unknown[]), event("supplier_failed", "No reference returned")] }).eq("id", bookingId);
    return { ok: false as const, reason: "The booking could not be created with our partner." };
  }
  await db.from("travelshop_bookings").update({
    status: "supplier_booked", supplier_reference_id: ref, supplier_booking_token: token || null,
    supplier_status: String(res["status"] ?? ""), supplier_response: res,
    events: [...(b.events as unknown[]), event("supplier_booked", "Reference received")],
  }).eq("id", bookingId);
  return { ok: true as const };
}

/** Supplier payment request for a supplier-created booking (gated). */
export async function requestSupplierPayment(bookingId: string) {
  if (!tourBookingsEnabled()) return { ok: false as const, reason: "Supplier booking is not yet authorised." };
  const db = await admin();
  const { data: b } = await db.from("travelshop_bookings").select("*").eq("id", bookingId).single();
  if (!b?.supplier_reference_id) return { ok: false as const, reason: "No supplier booking exists yet." };
  const res = await travelshopRequest<Record<string, unknown>>(TRAVELSHOP_PATHS.paymentRequest(b.supplier_reference_id), { method: "POST", maxRetries: 0 });
  await db.from("travelshop_bookings").update({ status: "payment_requested", supplier_payment_request: res, events: [...(b.events as unknown[]), event("payment_requested", "Supplier payment request created")] }).eq("id", bookingId);
  return { ok: true as const };
}

/** Read-only status refresh from the supplier. */
export async function refreshSupplierBooking(bookingId: string) {
  const db = await admin();
  const { data: b } = await db.from("travelshop_bookings").select("id, supplier_reference_id, events").eq("id", bookingId).single();
  if (!b?.supplier_reference_id) return { ok: false as const, reason: "No supplier booking exists yet." };
  const res = await travelshopRequest<Record<string, unknown>>(TRAVELSHOP_PATHS.booking(b.supplier_reference_id));
  const status = String(res["status"] ?? (res["data"] as Record<string, unknown> | undefined)?.["status"] ?? "");
  await db.from("travelshop_bookings").update({ supplier_status: status, supplier_response: res, events: [...(b.events as unknown[]), event("status_refreshed", status || "unknown")] }).eq("id", bookingId);
  return { ok: true as const, status };
}

/** Customer-safe view of their own tour bookings. */
export async function listCustomerTourBookings(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("travelshop_bookings")
    .select("id, tour_slug, tour_name, tour_date, service_type, adults, children, infants, customer_currency, customer_total, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}
