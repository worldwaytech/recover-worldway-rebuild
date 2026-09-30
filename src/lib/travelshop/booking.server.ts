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
  // Untyped view: these rows are mapped to Worldway DTOs explicitly below.
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
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
  lead: { title?: string; firstName: string; lastName: string; email: string; phone: string; phoneCountryCode?: string; nationality?: string };
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
    rooms: q.roomLines ?? input.rooms ?? {},
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
 * FINAL supplier call — STAFF ONLY (Gate 4). Runs only when: the switch is on,
 * a Worldway payment for this record is verified "paid", the verified partner
 * contract can be built, and live revalidation still matches. Atomic claim,
 * never auto-retried, every outcome audited.
 */
export async function createSupplierBooking(bookingId: string, actor: { id: string; email: string | null }) {
  if (!tourBookingsEnabled()) return { ok: false as const, reason: "Supplier booking is not yet authorised." };
  const db = await admin();
  const audit = (action: string, detail: Record<string, unknown>) =>
    db.from("admin_audit_log").insert({ actor_id: actor.id, actor_email: actor.email, action, target_table: "travelshop_bookings", target_id: bookingId, detail });

  const { data: pre } = await db.from("travelshop_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!pre) return { ok: false as const, reason: "Booking not found." };
  const { data: paid } = await db.from("payments").select("id, amount_minor, currency")
    .eq("purpose", "tour").eq("status", "paid").contains("reference", { tour_booking_id: bookingId }).limit(1).maybeSingle();
  if (!paid) {
    await audit("tour_supplier_booking_refused", { reason: "no_verified_payment" });
    return { ok: false as const, reason: "No verified Worldway payment for this booking." };
  }
  const { buildNewBookingBody } = await import("./booking-contract");
  const { partnerCountries } = await import("./countries.server");
  const built = buildNewBookingBody(pre as never, await partnerCountries().catch(() => []));
  if (!built.ok) {
    await audit("tour_supplier_booking_refused", { reason: "contract", blockers: built.blockers });
    return { ok: false as const, reason: built.blockers.join(" ") };
  }

  // Idempotency: atomically claim the record — one record, one supplier write.
  const { data: b } = await db.from("travelshop_bookings")
    .update({ status: "supplier_booking_in_progress" })
    .eq("id", bookingId).eq("status", "awaiting_supplier_authorization")
    .select("*").maybeSingle();
  if (!b) return { ok: false as const, reason: "Booking is not awaiting supplier creation (already in progress or done)." };
  const q = await liveQuote({ slug: b.tour_slug, date: b.tour_date, service: b.service_type as ServiceType, adults: b.adults, children: b.children, infants: b.infants });
  if (!q.ok || q.retailTotal !== Number(b.supplier_retail_total)) {
    await db.from("travelshop_bookings").update({ status: "price_changed", events: [...(b.events as unknown[]), event("revalidation_failed", q.ok ? `now ${q.currency} ${q.customerTotal}` : q.reason)] }).eq("id", bookingId);
    await audit("tour_supplier_booking_refused", { reason: "revalidation_failed" });
    return { ok: false as const, reason: "The live price or availability changed. Please re-confirm." };
  }
  let res: Record<string, unknown>;
  try {
    res = await travelshopRequest<Record<string, unknown>>(TRAVELSHOP_PATHS.newBooking, { method: "POST", maxRetries: 0, timeoutMs: 90_000, body: built.body });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "unknown";
    // 4xx = partner rejected at validation → nothing was booked. Anything else is uncertain.
    const rejected = /Supplier HTTP 4\d\d/.test(msg);
    await db.from("travelshop_bookings").update({
      status: rejected ? "supplier_failed" : "supplier_uncertain",
      events: [...(b.events as unknown[]), event(rejected ? "supplier_rejected" : "supplier_uncertain", msg.slice(0, 160))],
    }).eq("id", bookingId);
    await audit(rejected ? "tour_supplier_booking_rejected" : "tour_supplier_booking_uncertain", { error: msg });
    return { ok: false as const, reason: rejected ? `Partner rejected the booking: ${msg}` : "Outcome uncertain — reconcile with the partner before any retry." };
  }
  const data = (res["data"] as Record<string, unknown> | undefined) ?? res;
  const ref = String(data["reference_id"] ?? data["reference"] ?? data["booking_reference"] ?? "");
  const token = String(data["token"] ?? "");
  if (!ref) {
    await db.from("travelshop_bookings").update({ status: "supplier_uncertain", supplier_response: res, events: [...(b.events as unknown[]), event("supplier_uncertain", "No reference recognised in response")] }).eq("id", bookingId);
    await audit("tour_supplier_booking_uncertain", { reason: "no_reference", response_keys: Object.keys(data) });
    return { ok: false as const, reason: "The partner answered without a recognisable reference — the response is saved for staff review." };
  }
  await db.from("travelshop_bookings").update({
    status: "supplier_booked", supplier_reference_id: ref, supplier_booking_token: token || null,
    supplier_status: String(data["status"] ?? ""), supplier_response: res,
    events: [...(b.events as unknown[]), event("supplier_booked", "Reference received")],
  }).eq("id", bookingId);
  await audit("tour_supplier_booking_created", { reference: ref, payment_id: paid.id });
  await queueTourConfirmationEmail(bookingId).catch(() => null);
  const { kindOf } = await import("./certification.server");
  await audit("tour_certification_evidence", { kind: kindOf(b.rooms), reference: ref, payment_id: paid.id, supplier_status: String(data["status"] ?? ""), response_keys: Object.keys(data) });
  return { ok: true as const, reference: ref };
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

/** Customer-safe view of their own tour bookings — Worldway references and labels only. */
export async function listCustomerTourBookings(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("travelshop_bookings")
    .select("id, tour_slug, tour_name, tour_date, service_type, adults, children, infants, customer_currency, customer_total, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const { worldwayTourRef, customerTourStatus } = await import("./reference");
  return (data ?? []).map(({ status, ...b }) => ({ ...b, reference: worldwayTourRef(b.id), status: customerTourStatus(status) }));
}

/** One customer tour booking with its Worldway receipt — owner only, no partner fields. */
export async function getCustomerTourBooking(userId: string, bookingId: string) {
  const db = await admin();
  const { data: b } = await db.from("travelshop_bookings")
    .select("id, user_id, tour_slug, tour_name, tour_date, service_type, adults, children, infants, customer_currency, customer_total, status, created_at, lead_traveller")
    .eq("id", bookingId).maybeSingle();
  if (!b || b.user_id !== userId) return null;
  const { data: pays } = await db.from("payments").select("id, amount_minor, currency, status, verified_at, created_at")
    .eq("purpose", "tour").contains("reference", { tour_booking_id: bookingId }).in("status", ["paid", "refunded", "refund_in_progress"]).order("created_at");
  const { worldwayTourRef, worldwayReceiptNo, customerTourStatus } = await import("./reference");
  const lead = (b.lead_traveller ?? {}) as Record<string, unknown>;
  return {
    reference: worldwayTourRef(b.id), status: customerTourStatus(b.status),
    tourName: b.tour_name, tourSlug: b.tour_slug, tourDate: b.tour_date, service: b.service_type,
    adults: b.adults, children: b.children, infants: b.infants,
    currency: b.customer_currency, total: Number(b.customer_total), createdAt: b.created_at,
    lead: { name: [lead["title"], lead["firstName"] ?? lead["first_name"], lead["lastName"] ?? lead["last_name"]].filter(Boolean).join(" "), email: String(lead["email"] ?? "") },
    payments: (pays ?? []).map((p) => ({ receiptNo: worldwayReceiptNo(p.id), amount: p.amount_minor / 100, currency: p.currency, status: p.status, paidAt: p.verified_at ?? p.created_at })),
  };
}

/** Worldway-branded confirmation email to the lead traveller. Idempotent per booking; outcome logged on the booking. */
export async function queueTourConfirmationEmail(bookingId: string) {
  const db = await admin();
  const { data: b } = await db.from("travelshop_bookings").select("id, tour_name, tour_date, adults, children, customer_currency, customer_total, lead_traveller, events").eq("id", bookingId).maybeSingle();
  if (!b) return "not_found";
  const { worldwayTourRef } = await import("./reference");
  const lead = (b.lead_traveller ?? {}) as Record<string, unknown>;
  const to = String(lead["email"] ?? "");
  const reference = worldwayTourRef(b.id);
  let status = "no_recipient";
  if (to) {
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const r = await sendTemplateEmail("tour-booking-confirmation", to, {
        templateData: {
          name: [lead["title"], lead["firstName"] ?? lead["first_name"], lead["lastName"] ?? lead["last_name"]].filter(Boolean).join(" "),
          reference, tourName: b.tour_name, tourDate: b.tour_date,
          travellers: `${b.adults} adult${b.adults === 1 ? "" : "s"}${b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}`,
          total: `${b.customer_currency} ${Number(b.customer_total).toFixed(2)}`,
          bookingUrl: `https://worldwaytravelsgroup.com/account/tour/${b.id}`,
        },
        idempotencyKey: `tour-booking-confirmation-${b.id}`,
      });
      status = r.sent ? "sent" : String((r as { reason?: string }).reason ?? "not_sent");
    } catch (e) {
      status = `failed: ${(e as { code?: string }).code ?? (e instanceof Error ? e.message.slice(0, 80) : "unknown")}`;
    }
  }
  await db.from("travelshop_bookings").update({ events: [...(b.events as unknown[]), event("confirmation_email", `${status} (${reference})`)] }).eq("id", bookingId);
  return status;
}

/** Staff-only full refund for a paid tour that could not be confirmed. Atomic claim — refunds at most once. */
export async function staffRefundTourPayment(bookingId: string, actor: { id: string; email: string | null }) {
  const db = await admin();
  const audit = (action: string, detail: Record<string, unknown>) =>
    db.from("admin_audit_log").insert({ actor_id: actor.id, actor_email: actor.email, action, target_table: "travelshop_bookings", target_id: bookingId, detail });
  const { data: b } = await db.from("travelshop_bookings").select("id, status, events").eq("id", bookingId).maybeSingle();
  if (!b) return { ok: false as const, reason: "Booking not found." };
  if (!["supplier_failed", "price_changed", "cancelled"].includes(b.status))
    return { ok: false as const, reason: b.status === "supplier_uncertain" ? "Reconcile with the partner first — the booking may exist." : "Only failed, price-changed or cancelled bookings can be refunded." };
  const { data: p } = await db.from("payments").update({ status: "refund_in_progress" })
    .eq("purpose", "tour").eq("status", "paid").contains("reference", { tour_booking_id: bookingId })
    .select("id, payment_id, amount_minor").maybeSingle();
  if (!p?.payment_id) return { ok: false as const, reason: "No paid payment to refund (already refunded or in progress)." };
  try {
    const { refundRazorpayPayment } = await import("@/lib/payments/razorpay.server");
    const r = await refundRazorpayPayment(p.payment_id, p.amount_minor, bookingId.slice(0, 36));
    await db.from("payments").update({ status: "refunded" }).eq("id", p.id);
    await db.from("travelshop_bookings").update({ status: "refunded", events: [...(b.events as unknown[]), event("refunded", "Full refund issued")] }).eq("id", bookingId);
    await audit("tour_payment_refunded", { payment_row: p.id, refund_id: r.id, refund_status: r.status });
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    await audit("tour_payment_refund_failed", { payment_row: p.id, error: msg });
    return { ok: false as const, reason: `Refund not confirmed — payment left as "refund in progress" for manual check: ${msg}` };
  }
}

/**
 * Staff-only controlled payment path (Gate 4). Prepares a booking only for
 * tours whose partner requirements are fully confirmed: per-person priced
 * (no partner room ids needed) and a lead traveller the live partner contract
 * accepts. Refuses before any payment if the booking could not be sent.
 */
export async function staffPrepareTourPayment(input: PrepareInput) {
  if (!tourBookingsEnabled()) return { ok: false as const, reason: "Supplier booking is not yet authorised." };
  const q = await liveQuote(input);
  if (!q.ok) return q;
  if (q.roomPriced && !q.roomLines) return { ok: false as const, reason: "The partner didn't return room ids for this date and group, so it can't be booked online." };
  const { buildNewBookingBody } = await import("./booking-contract");
  const { partnerCountries } = await import("./countries.server");
  const check = buildNewBookingBody({ tour_external_id: q.tourId, tour_date: input.date, service_type: input.service, adults: input.adults, children: input.children, infants: input.infants, rooms: q.roomLines ?? {}, supplier_currency: q.currency, lead_traveller: input.lead }, await partnerCountries().catch(() => []));
  if (!check.ok) return { ok: false as const, reason: check.blockers.join(" ") };
  const r = await prepareTourBooking({ ...input, rooms: undefined });
  if (!r.ok) return r;
  return { ok: true as const, bookingId: r.booking.id as string, currency: r.booking.customer_currency as string, total: Number(r.booking.customer_total), checkedAt: r.booking.price_checked_at as string };
}

/** Amount for a staff tour payment — server-owned: caller must be staff and own the record; price re-checked live. */
export async function tourPaymentAmount(bookingId: string, userId: string | null) {
  if (!userId) throw new Error("Sign in required.");
  const db = await admin();
  if (!tourBookingsEnabled()) throw new Error("Online tour payment isn't available yet.");
  const { data: b } = await db.from("travelshop_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b || b.user_id !== userId || b.status !== "awaiting_supplier_authorization") throw new Error("This tour booking can't be paid.");
  // Owner-approved go-live: customer payment no longer waits on a prior certification booking.
  // The contract, live price/availability and room checks below remain mandatory.
  const { buildNewBookingBody } = await import("./booking-contract");
  const { partnerCountries } = await import("./countries.server");
  if (!buildNewBookingBody(b as never, await partnerCountries().catch(() => [])).ok) throw new Error("Online payment isn't available for this tour — our team will confirm it.");
  const { data: prior } = await db.from("payments").select("id").eq("purpose", "tour").eq("status", "paid").contains("reference", { tour_booking_id: bookingId }).limit(1).maybeSingle();
  if (prior) throw new Error("This tour booking is already paid.");
  const q = await liveQuote({ slug: b.tour_slug, date: b.tour_date, service: b.service_type as ServiceType, adults: b.adults, children: b.children, infants: b.infants });
  if (!q.ok || (q.roomPriced && JSON.stringify(q.roomLines) !== JSON.stringify(b.rooms)) || q.retailTotal !== Number(b.supplier_retail_total)) throw new Error("The live price or availability changed. Prepare the booking again.");
  const currency = String(b.customer_currency).toUpperCase();
  const amountMinor = Math.round(Number(b.customer_total) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) throw new Error("Invalid tour amount.");
  return { amountMinor, currency, planId: null };
}

/** Whether this saved booking can be paid online right now (flag, contract, certification for its kind). */
export async function customerPayable(bookingId: string) {
  if (!tourBookingsEnabled()) return false;
  const db = await admin();
  const { data: b } = await db.from("travelshop_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return false;
  const { buildNewBookingBody } = await import("./booking-contract");
  const { partnerCountries } = await import("./countries.server");
  return buildNewBookingBody(b as never, await partnerCountries().catch(() => [])).ok;
}
