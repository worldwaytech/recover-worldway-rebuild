// Pre-purchased flight fares — server functions. Supplier code is imported
// inside handlers so credentials and the supplier client never reach the browser.
// Customer-facing messages never name the supplier.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRODUCT_TYPE = "prepurchased_flight";
const iata = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const paxSchema = z.object({
  adult: z.number().int().min(1).max(9),
  child: z.number().int().min(0).max(8),
  infant: z.number().int().min(0).max(4),
});
const searchSchema = paxSchema.extend({
  origin: iata,
  destination: iata,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.startsWith("Not configured")) return "Pre-purchased fares are not available right now. Please contact our flight desk.";
  if (/timed out|unreachable|HTTP 5/i.test(msg)) return "Our fare system is busy. Please try again in a moment.";
  return msg && msg.length < 160 && !/api|token|login/i.test(msg) ? msg : "We couldn't load fares. Please try again.";
}

export const listPrePurchasedSectors = createServerFn({ method: "GET" }).handler(async () => {
  const { airiqSectors } = await import("./client.server");
  try {
    return { ok: true as const, sectors: await airiqSectors() };
  } catch (e) {
    return { ok: false as const, sectors: [], error: friendly(e) };
  }
});

export const listPrePurchasedDates = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ origin: iata, destination: iata }).parse(i))
  .handler(async ({ data }) => {
    const { airiqAvailability } = await import("./client.server");
    try {
      return { ok: true as const, dates: await airiqAvailability(data.origin, data.destination) };
    } catch (e) {
      return { ok: false as const, dates: [] as string[], error: friendly(e) };
    }
  });

export const searchPrePurchasedFares = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => searchSchema.parse(i))
  .handler(async ({ data }) => {
    const { airiqSearch, fareTotal } = await import("./client.server");
    try {
      const fares = await airiqSearch(data);
      return {
        ok: true as const,
        currency: "INR",
        fares: fares
          .filter((f) => f.seats >= data.adult + data.child)
          .map((f) => ({ ...f, total: fareTotal(f, data) })),
      };
    } catch (e) {
      return { ok: false as const, currency: "INR", fares: [], error: friendly(e) };
    }
  });

const passenger = z.object({
  title: z.enum(["Mr.", "Mrs.", "Ms.", "Mstr.", "Miss"]),
  first_name: z.string().trim().min(1).max(60).regex(/^[A-Za-z .'-]+$/),
  last_name: z.string().trim().min(1).max(60).regex(/^[A-Za-z .'-]+$/),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passport_number: z.string().trim().max(20).optional(),
  passport_expirydate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passport_issuing_country_code: z.string().trim().length(2).optional(),
  nationality: z.string().trim().max(40).optional(),
});

const holdSchema = searchSchema.extend({
  ticketId: z.string().trim().min(1).max(80),
  contactEmail: z.string().trim().email().max(255),
  contactPhone: z.string().trim().min(6).max(20),
  adults: z.array(passenger).min(1).max(9),
  children: z.array(passenger).max(8),
  infants: z.array(passenger).max(4),
});

/** Revalidates the fare live and records a pending (unpaid, unticketed) booking. */
export const reservePrePurchasedFare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => holdSchema.parse(i))
  .handler(async ({ data, context }) => {
    if (data.adults.length !== data.adult || data.children.length !== data.child || data.infants.length !== data.infant) {
      return { ok: false as const, error: "Passenger details don't match the number of travellers." };
    }
    const { airiqSearch, fareTotal } = await import("./client.server");
    let fare;
    try {
      const fares = await airiqSearch(data);
      fare = fares.find((f) => f.ticketId === data.ticketId);
    } catch (e) {
      return { ok: false as const, error: friendly(e) };
    }
    if (!fare || fare.seats < data.adult + data.child) {
      return { ok: false as const, error: "This fare has just sold out. Please search again." };
    }
    if (fare.international) {
      const all = [...data.adults, ...data.children, ...data.infants];
      if (all.some((p) => !p.passport_number || !p.passport_expirydate || !p.dob || !p.passport_issuing_country_code || !p.nationality)) {
        return { ok: false as const, error: "Passport details, date of birth and nationality are required for international travel." };
      }
    }
    if (data.infants.some((p) => !p.dob)) {
      return { ok: false as const, error: "Date of birth is required for every infant." };
    }
    const total = fareTotal(fare, data);
    const reference = `WW-PPF-${Date.now().toString(36).toUpperCase()}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: context.userId,
        reference,
        product_type: PRODUCT_TYPE,
        title: `${fare.origin} → ${fare.destination} · ${fare.airline} ${fare.flightNumber}`,
        supplier: null,
        travel_date: fare.departureDate,
        status: "pending",
        currency: "INR",
        amount: total,
        amount_paid: 0,
        balance_due: total,
        supplier_status: "awaiting-payment",
        details: {
          channel: "airiq",
          ticketId: fare.ticketId,
          fare,
          pax: { adult: data.adult, child: data.child, infant: data.infant },
          search: { origin: data.origin, destination: data.destination, date: data.date },
          passengers: { adults: data.adults, children: data.children, infants: data.infants },
          contact: { email: data.contactEmail, phone: data.contactPhone },
          revalidatedAt: new Date().toISOString(),
        },
      })
      .select("id, reference, amount, currency")
      .single();
    if (error || !row) {
      console.error("[prepurchased] booking insert failed", error?.message);
      return { ok: false as const, error: "We couldn't save your booking. Please try again." };
    }
    return { ok: true as const, bookingId: row.id, reference: row.reference, total: Number(row.amount), currency: row.currency };
  });

type Pax = { title: string; first_name: string; last_name: string; dob?: string; passport_number?: string; passport_expirydate?: string; passport_issuing_country_code?: string; nationality?: string };
const slash = (d?: string) => (d ? d.replace(/-/g, "/") : undefined);
function toSupplierPax(p: Pax, travelWith?: string) {
  return {
    title: p.title,
    first_name: p.first_name,
    last_name: p.last_name,
    ...(p.dob ? { dob: slash(p.dob) } : {}),
    ...(p.passport_number ? { passport_number: p.passport_number } : {}),
    ...(p.passport_expirydate ? { passport_expirydate: slash(p.passport_expirydate) } : {}),
    ...(p.passport_issuing_country_code ? { passport_issuing_country_code: p.passport_issuing_country_code.toUpperCase() } : {}),
    ...(p.nationality ? { nationality: p.nationality } : {}),
    ...(travelWith ? { travel_with: travelWith } : {}),
  };
}

/** Issues the ticket for a paid booking. Shared by customer finalisation and staff action. */
async function issueTicket(bookingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: b } = await supabaseAdmin.from("bookings").select("id, details, amount, amount_paid, supplier_status, supplier_reference").eq("id", bookingId).single();
  if (!b) return { ok: false as const, error: "Booking not found." };
  if (b.supplier_reference) return { ok: true as const, supplierReference: b.supplier_reference, alreadyIssued: true };
  if (Number(b.amount_paid) < Number(b.amount)) return { ok: false as const, error: "Booking is not fully paid." };
  const { airiqBook, airiqConfig, airiqSearch } = await import("./client.server");
  if (!airiqConfig().bookingEnabled) {
    await supabaseAdmin.from("bookings").update({ supplier_status: "awaiting-ticketing" }).eq("id", bookingId);
    return { ok: false as const, error: "Ticketing is not yet authorised — our flight desk will issue the ticket." };
  }
  const d = b.details as Record<string, any>;
  // Revalidate once more immediately before ticketing.
  const live = (await airiqSearch({ ...d["search"], ...d["pax"] })).find((f) => f.ticketId === d["ticketId"]);
  if (!live || live.price > Number(d["fare"]?.price ?? 0)) {
    await supabaseAdmin.from("bookings").update({ supplier_status: "fare-changed" }).eq("id", bookingId);
    return { ok: false as const, error: "The fare changed before ticketing; our flight desk will contact you." };
  }
  await supabaseAdmin.from("bookings").update({ supplier_status: "ticketing" }).eq("id", bookingId);
  try {
    const res = await airiqBook({
      ticketId: d["ticketId"],
      pax: d["pax"],
      adults: d["passengers"].adults.map((p: Pax) => toSupplierPax(p)),
      children: d["passengers"].children.map((p: Pax) => toSupplierPax(p)),
      infants: d["passengers"].infants.map((p: Pax, i: number) => toSupplierPax(p, String(i + 1))),
    });
    await supabaseAdmin.from("bookings").update({ supplier_reference: res.bookingId, supplier_status: "ticketed", status: "confirmed" }).eq("id", bookingId);
    return { ok: true as const, supplierReference: res.bookingId, alreadyIssued: false };
  } catch (e) {
    // Indeterminate outcome: never retry blindly — staff resolve via ticket retrieval.
    await supabaseAdmin.from("bookings").update({ supplier_status: "ticketing-unknown" }).eq("id", bookingId);
    console.error("[prepurchased] ticketing failed", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "Ticketing is being confirmed by our flight desk." };
  }
}

/** Links a verified Razorpay payment to the booking, then attempts ticketing. */
export const finalizePrePurchasedBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ bookingId: z.string().uuid(), orderId: z.string().min(6).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b } = await supabaseAdmin.from("bookings").select("id, user_id, amount, product_type").eq("id", data.bookingId).single();
    if (!b || b.user_id !== context.userId || b.product_type !== PRODUCT_TYPE) return { ok: false as const, error: "Booking not found." };
    const { data: p } = await supabaseAdmin.from("payments").select("status, verified_at, amount_minor, reference, user_id").eq("order_id", data.orderId).maybeSingle();
    const ref = (p?.reference ?? {}) as Record<string, unknown>;
    if (!p || p.status !== "paid" || !p.verified_at || ref["booking_id"] !== data.bookingId || Number(p.amount_minor) !== Math.round(Number(b.amount) * 100)) {
      return { ok: false as const, error: "Payment could not be matched to this booking." };
    }
    await supabaseAdmin.from("bookings").update({ amount_paid: b.amount, balance_due: 0, supplier_status: "paid-awaiting-ticket" }).eq("id", b.id);
    const t = await issueTicket(b.id);
    return { ok: true as const, ticketed: t.ok, message: t.ok ? "Your ticket has been issued." : t.error };
  });

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

// ---------------- Staff ----------------
async function assertStaff(client: any, userId: string) {
  const { data, error } = await client.rpc("is_staff", { _user_id: userId });
  if (error || !data) throw new Error("Forbidden");
}

export const airiqAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { airiqHealth } = await import("./client.server");
    const health = await airiqHealth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("bookings")
      .select("id, reference, title, travel_date, status, supplier_status, supplier_reference, amount, amount_paid, currency, created_at")
      .eq("product_type", PRODUCT_TYPE)
      .order("created_at", { ascending: false })
      .limit(50);
    return { health, bookings: rows ?? [], checkedAt: new Date().toISOString() };
  });

export const airiqAdminIssueTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ bookingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    return issueTicket(data.bookingId);
  });

export const airiqAdminRetrieve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ supplierReference: z.string().trim().min(3).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { airiqTicket } = await import("./client.server");
    try {
      return { ok: true as const, ticket: JSON.parse(JSON.stringify(await airiqTicket(data.supplierReference))) as Record<string, unknown> };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Retrieve failed" };
    }
  });
