import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { consumeRateLimit, currentRequest, rateLimitKey, requestFingerprint } from "@/lib/security/rate-limit.server";

// Worldway Private Aviation — customer-facing server functions.
// Every response is Worldway-branded: no partner names, URLs, tokens or sessions leave the server.

const DESK_EMAIL = "aviation@worldwaytravelsgroup.com";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function newReference() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `WWPA-${ymd}-${rnd}`;
}

const place = z.string().trim().min(2).max(120);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type JetEstimateOption = {
  category: string;
  currency: string;
  /** Partner point estimate; null when the partner returns a range only. */
  estimate: number | null;
  low: number;
  high: number;
  confidence: number | null;
};

function normaliseEstimates(structured: any): JetEstimateOption[] {
  const list = Array.isArray(structured?.estimates) ? structured.estimates : [];
  return list
    .map((e: any) => ({
      category: String(e.category ?? "Private jet"),
      currency: String(e.currency ?? "GBP"),
      estimate: Number(e.estimated_price),
      low: Number(e.price_low),
      high: Number(e.price_high),
      confidence: typeof e.confidence === "number" ? e.confidence : null,
    }))
    .filter((e: JetEstimateOption) => e.estimate !== null && Number.isFinite(e.estimate) && e.estimate > 0);
}

// ---------- Private Jets: step 1 — indicative estimate ----------
export const getJetEstimate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        origin: place,
        destination: place,
        passengers: z.number().int().min(1).max(40),
        roundTrip: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await consumeRateLimit(rateLimitKey("aviation-estimate", requestFingerprint(currentRequest())), 10, 60);
    // Live partner pricing with failover: primary aviation partner first, then the
    // next connected partner. Which partner answered stays server-side.
    let options: JetEstimateOption[] = [];
    let session: string | null = null;
    let partnerRoute: string | null = null;
    let source: string | null = null;
    try {
      const { callTool } = await import("./villiers.server");
      const r = await callTool(
        "get_jet_estimate",
        { origin: data.origin, destination: data.destination, passengers: data.passengers, round_trip: data.roundTrip },
        { retry: true },
      );
      if (!r.isError) {
        options = normaliseEstimates(r.structured);
        session = r.session;
        partnerRoute = r.structured?.route ? String(r.structured.route) : null;
        if (options.length) source = "villiers";
      }
    } catch (e) {
      console.error("[private-aviation] primary estimate failed", (e as Error).message);
    }
    // SkyAccess is UNAPPROVED / TEST ONLY: its adapter stays connected for backend
    // testing, but no SkyAccess-derived price may reach customers until supplier
    // approval and genuine live-data validation flip SKYACCESS_CUSTOMER_APPROVED.
    const { SKYACCESS_CUSTOMER_APPROVED } = await import("./skyaccess.server");
    if (SKYACCESS_CUSTOMER_APPROVED && !options.length && !data.roundTrip) {
      try {
        const { skyCharterEstimate } = await import("./skyaccess.server");
        const sky = await skyCharterEstimate({ origin: data.origin, destination: data.destination, passengers: data.passengers });
        options = sky.map((s) => ({ category: s.category, currency: s.currency, estimate: null, low: s.low, high: s.high, confidence: null }));
        if (options.length) source = "skyaccess";
      } catch (e) {
        console.error("[private-aviation] secondary estimate failed", (e as Error).message);
      }
    }
    if (!options.length) {
      return { ok: false as const, error: "We couldn't price this route live right now. Our aviation desk can still source aircraft — request a bespoke quote." };
    }
    try {
      const pricedAt = new Date().toISOString();
      const reference = newReference();
      const db = await admin();
      const { data: row, error } = await db
        .from("private_aviation_requests")
        .insert({
          reference,
          kind: "charter",
          status: "estimated",
          origin: data.origin,
          destination: data.destination,
          passengers: data.passengers,
          round_trip: data.roundTrip,
          estimate: { options, route: partnerRoute, source, pricedAt },
          supplier_session: session,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return {
        ok: true as const,
        estimateId: row.id as string,
        reference,
        route: `${data.origin} → ${data.destination}`,
        options,
        pricedAt,
      };
    } catch (e) {
      console.error("[private-aviation] estimate persist failed", (e as Error).message);
      return { ok: false as const, error: "Our private aviation pricing is temporarily unavailable. Please try again shortly." };
    }
  });

const confirmSchema = z.object({
  estimateId: z.string().uuid(),
  optIn: z.literal(true),
  departureDate: isoDate,
  returnDate: isoDate.optional(),
  aircraftCategory: z.string().trim().max(60).optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(40),
  flexibleDates: z.boolean().default(false),
  luggage: z.boolean().default(false),
  pets: z.boolean().default(false),
  wheelchair: z.boolean().default(false),
  specialRequests: z.string().trim().max(2000).optional(),
});

/**
 * Sends a qualified request for confirmed pricing. Never retried automatically:
 * the only resend happens when the partner explicitly rejects because the
 * estimate session expired — in that case we re-run the estimate (which the
 * customer already saw) and submit once more.
 */
async function submitConfirmation(
  row: any,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; tripId: string | null; stage: string | null; raw: any; error?: string }> {
  const { callTool } = await import("./villiers.server");
  let session: string | null = row.supplier_session;
  let r = await callTool("request_jet_confirmation", args, { session });
  const rejectedForEstimate = r.isError && /estimate/i.test(r.text);
  if (rejectedForEstimate) {
    const est = await callTool(
      "get_jet_estimate",
      { origin: row.origin, destination: row.destination, passengers: row.passengers, round_trip: row.round_trip },
      { retry: true },
    );
    session = est.session;
    r = await callTool("request_jet_confirmation", args, { session });
  }
  const s = r.structured ?? {};
  const tripId = s.trip_id ? String(s.trip_id) : null;
  return {
    ok: !r.isError,
    tripId,
    stage: s.status ? String(s.status) : s.stage ? String(s.stage) : null,
    raw: { structured: s, text: r.text.slice(0, 4000) },
    error: r.isError ? r.text.slice(0, 500) : undefined,
  };
}

export const requestJetConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db
      .from("private_aviation_requests")
      .select("*")
      .eq("id", data.estimateId)
      .maybeSingle();
    if (!row || row.kind !== "charter") return { ok: false as const, error: "Please get a price estimate first." };
    if (row.status !== "estimated") {
      return { ok: true as const, reference: row.reference, status: row.status, already: true };
    }
    if (data.returnDate && data.returnDate < data.departureDate) {
      return { ok: false as const, error: "Return date must be after departure." };
    }
    // Atomic claim prevents double submission.
    const { data: claimed } = await db
      .from("private_aviation_requests")
      .update({
        status: "submitted",
        user_id: context.userId,
        departure_date: data.departureDate,
        return_date: data.returnDate ?? null,
        aircraft_category: data.aircraftCategory ?? null,
        customer_name: `${data.firstName} ${data.lastName}`,
        customer_email: data.email,
        customer_phone: data.phone,
        special_requests: data.specialRequests ?? null,
        preferences: { flexibleDates: data.flexibleDates, luggage: data.luggage, pets: data.pets, wheelchair: data.wheelchair },
        submitted_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "estimated")
      .select("*")
      .maybeSingle();
    if (!claimed) return { ok: true as const, reference: row.reference, status: "submitted", already: true };

    try {
      const res = await submitConfirmation(claimed, {
        origin: row.origin,
        destination: row.destination,
        passengers: row.passengers,
        round_trip: row.round_trip || !!data.returnDate,
        departure_date: data.departureDate,
        ...(data.returnDate ? { return_date: data.returnDate } : {}),
        ...(data.aircraftCategory ? { aircraft_category: data.aircraftCategory } : {}),
        email: DESK_EMAIL,
        first_name: data.firstName,
        last_name: data.lastName,
        flexible_dates: data.flexibleDates,
        luggage: data.luggage,
        pets: data.pets,
        wheelchair: data.wheelchair,
        client_reference: row.reference,
        ...(data.specialRequests ? { special_requests: data.specialRequests } : {}),
      });
      await db
        .from("private_aviation_requests")
        .update({
          status: res.ok ? "sourcing" : "failed",
          supplier_trip_id: res.tripId,
          supplier_status: res.stage,
          supplier_response: res.raw,
          last_error: res.error ?? null,
        })
        .eq("id", row.id);
      if (!res.ok) return { ok: false as const, error: "We couldn't submit your request. Our aviation desk has been notified and will contact you.", reference: row.reference };
      const { sendAviationEmail } = await import("./emails.server");
      await sendAviationEmail(row.id, data.email, {
        kind: "request_received", reference: row.reference, customerName: `${data.firstName} ${data.lastName}`,
        route: `${row.origin} → ${row.destination}`, departureDate: data.departureDate, passengers: row.passengers,
        aircraft: data.aircraftCategory ?? null,
      }).catch(() => null);
      return { ok: true as const, reference: row.reference, status: "sourcing" };
    } catch (e) {
      // Outcome unknown — never resend; flag for the desk.
      await db
        .from("private_aviation_requests")
        .update({ last_error: `uncertain: ${(e as Error).message}`.slice(0, 500) })
        .eq("id", row.id);
      return { ok: true as const, reference: row.reference, status: "submitted", pendingCheck: true };
    }
  });

// ---------- Empty Legs: live feed ----------
export type PublicEmptyLeg = {
  id: string;
  aircraft: string;
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  departureDate: string;
  departureTime: string | null;
  arrivalTime: string | null;
  duration: string | null;
  price: number | null;
  currency: string;
  seats: number | null;
};

export const listLiveEmptyLegs = createServerFn({ method: "GET" }).handler(async () => {
  await consumeRateLimit(rateLimitKey("aviation-empty-legs", requestFingerprint(currentRequest())), 30, 60);
  const { fetchFeedLegs } = await import("./villiers.server");
  try {
    const legs = await fetchFeedLegs();
    const safe: PublicEmptyLeg[] = legs.map(({ trackingLink: _t, ...rest }) => rest);
    return { ok: true as const, legs: safe, fetchedAt: new Date().toISOString() };
  } catch (e) {
    console.error("[private-aviation] feed failed", (e as Error).message);
    return { ok: false as const, legs: [] as PublicEmptyLeg[], error: "Live empty legs are temporarily unavailable." };
  }
});

export const enquireEmptyLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        legId: z.string().regex(/^WEL-[0-9A-F]{12}$/),
        passengers: z.number().int().min(1).max(40),
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        email: z.string().trim().email().max(255),
        phone: z.string().trim().min(5).max(40),
        specialRequests: z.string().trim().max(2000).optional(),
        optIn: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { fetchFeedLegs, callTool } = await import("./villiers.server");
    const legs = await fetchFeedLegs();
    const leg = legs.find((l) => l.id === data.legId);
    if (!leg) return { ok: false as const, error: "This empty leg is no longer available." };
    if (leg.seats != null && data.passengers > leg.seats) {
      return { ok: false as const, error: `This flight has ${leg.seats} seats.` };
    }
    const db = await admin();
    const reference = newReference();
    const { trackingLink: tracking, ...legPublic } = leg;
    const { data: row, error } = await db
      .from("private_aviation_requests")
      .insert({
        reference,
        kind: "empty_leg",
        status: "submitted",
        user_id: context.userId,
        origin: leg.originCode || leg.originName,
        destination: leg.destinationCode || leg.destinationName,
        departure_date: leg.departureDate || null,
        passengers: data.passengers,
        aircraft_category: leg.aircraft,
        empty_leg: legPublic,
        customer_name: `${data.firstName} ${data.lastName}`,
        customer_email: data.email,
        customer_phone: data.phone,
        special_requests: data.specialRequests ?? null,
        supplier_tracking_link: tracking,
        submitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) {
      console.error("[private-aviation] empty-leg save failed", error.message);
      return { ok: false as const, error: "We couldn't save your enquiry. Please try again." };
    }
    try {
      const est = await callTool(
        "get_jet_estimate",
        { origin: row.origin, destination: row.destination, passengers: data.passengers },
        { retry: true },
      );
      const res = await submitConfirmation(
        { ...row, supplier_session: est.session },
        {
          origin: row.origin,
          destination: row.destination,
          passengers: data.passengers,
          departure_date: leg.departureDate,
          aircraft_category: leg.aircraft,
          email: DESK_EMAIL,
          first_name: data.firstName,
          last_name: data.lastName,
          client_reference: reference,
          special_requests: [
            `EMPTY LEG ENQUIRY: ${leg.aircraft}, ${leg.originCode} → ${leg.destinationCode}, ${leg.departureDate} ${leg.departureTime ?? ""}, listed ${leg.currency} ${leg.price ?? "?"}, ${leg.seats ?? "?"} seats.`,
            `Listing: ${leg.trackingLink}`,
            data.specialRequests ?? "",
          ].join("\n").trim(),
        },
      );
      await db
        .from("private_aviation_requests")
        .update({
          status: res.ok ? "sourcing" : "failed",
          estimate: { options: normaliseEstimates(est.structured) },
          supplier_trip_id: res.tripId,
          supplier_status: res.stage,
          supplier_response: res.raw,
          last_error: res.error ?? null,
        })
        .eq("id", row.id);
      if (!res.ok) return { ok: false as const, reference, error: "We couldn't reach the operator. Our aviation desk will contact you." };
      const { sendAviationEmail } = await import("./emails.server");
      await sendAviationEmail(row.id, data.email, {
        kind: "request_received", reference, customerName: `${data.firstName} ${data.lastName}`,
        route: `${row.origin} → ${row.destination}`, departureDate: leg.departureDate, passengers: data.passengers,
        aircraft: leg.aircraft,
      }).catch(() => null);
      return { ok: true as const, reference };
    } catch (e) {
      await db
        .from("private_aviation_requests")
        .update({ last_error: `uncertain: ${(e as Error).message}`.slice(0, 500) })
        .eq("id", row.id);
      return { ok: true as const, reference, pendingCheck: true };
    }
  });

// ---------- Customer: my requests ----------
const SAFE_COLS =
  "id, reference, kind, status, origin, destination, departure_date, return_date, round_trip, passengers, aircraft_category, estimate, empty_leg, created_at, submitted_at, updated_at";

export const listMyAviationRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("private_aviation_requests")
      .select(SAFE_COLS)
      .eq("user_id", context.userId)
      .neq("status", "estimated")
      .order("created_at", { ascending: false })
      .limit(50);
    return { items: (data ?? []) as any[] };
  });

// ---------- Admin (Super Admin) ----------
async function assertSuperAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const adminAviationHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { openSession, fetchFeedLegs } = await import("./villiers.server");
    const configured = {
      mcpUrl: !!process.env["VILLIERS_MCP_URL"],
      mcpToken: !!process.env["VILLIERS_MCP_TOKEN"],
      rssFeed: !!process.env["VILLIERS_RSS_FEED_URL"],
    };
    const t0 = Date.now();
    let mcp: { ok: boolean; ms: number; error?: string };
    try {
      await openSession();
      mcp = { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      mcp = { ok: false, ms: Date.now() - t0, error: (e as Error).message };
    }
    const t1 = Date.now();
    let feed: { ok: boolean; ms: number; count: number; error?: string };
    try {
      const legs = await fetchFeedLegs(true);
      feed = { ok: true, ms: Date.now() - t1, count: legs.length };
    } catch (e) {
      feed = { ok: false, ms: Date.now() - t1, count: 0, error: (e as Error).message };
    }
    return { configured, mcp, feed, checkedAt: new Date().toISOString() };
  });

export const adminListAviationRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const db = await admin();
    const { data } = await db
      .from("private_aviation_requests")
      .select(`${SAFE_COLS}, customer_name, customer_email, customer_phone, special_requests, supplier_trip_id, supplier_status, supplier_tracking_link, last_error, quote_amount, quote_currency, quote_details, quote_expires_at, quote_version, paid_at, paid_amount, paid_currency, receipt_number, email_log`)
      .order("created_at", { ascending: false })
      .limit(200);
    return { items: (data ?? []) as any[] };
  });

export const adminRefreshAviationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const db = await admin();
    const { data: row } = await db.from("private_aviation_requests").select("*").eq("id", data.id).maybeSingle();
    if (!row?.supplier_trip_id) return { ok: false as const, error: "No partner trip ID yet." };
    const { callTool, mapStage } = await import("./villiers.server");
    const r = await callTool("get_confirmation_status", { trip_id: row.supplier_trip_id }, { retry: true });
    if (r.isError) return { ok: false as const, error: r.text.slice(0, 300) };
    const s = r.structured ?? {};
    const stage = String(s.status ?? s.stage ?? s.outcome ?? "");
    const mapped = mapStage(stage || r.text);
    const status = ["quoted", "paid"].includes(row.status) && mapped !== "booked" ? row.status : mapped;
    await db
      .from("private_aviation_requests")
      .update({ supplier_status: stage || null, status, supplier_response: { structured: s, text: r.text.slice(0, 4000) } })
      .eq("id", row.id);
    return { ok: true as const, status, stage };
  });

// ---------- Worldwide airport master ----------
export type AirportOption = { iata: string; icao: string; name: string; city: string; country: string };

export const searchAirportMaster = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { searchAirports } = await import("./airports.server");
    return { items: searchAirports(data.q, 12).map(({ size: _s, ...a }) => a) as AirportOption[] };
  });

export const lookupAirportCodes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ codes: z.array(z.string().trim().min(3).max(4)).max(4) }).parse(d))
  .handler(async ({ data }) => {
    const { findAirportByCode } = await import("./airports.server");
    return {
      items: data.codes.map((c) => {
        const a = findAirportByCode(c);
        if (!a) return null;
        const { size: _s, ...rest } = a;
        return rest as AirportOption;
      }),
    };
  });

// ---------- Confirmed quotes (desk → customer) ----------
export const adminSetConfirmedQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        amount: z.number().positive().max(10_000_000),
        currency: z.enum(["INR", "USD", "GBP", "EUR", "AED"]),
        aircraft: z.string().trim().min(2).max(120),
        inclusions: z.string().trim().max(2000).optional(),
        expiresAt: z.string().datetime(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const db = await admin();
    const { data: row } = await db.from("private_aviation_requests").select("*").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false as const, error: "Request not found." };
    if (row.paid_at) return { ok: false as const, error: "This request is already paid." };
    if (!row.user_id) return { ok: false as const, error: "This request has no customer account." };
    if (new Date(data.expiresAt).getTime() <= Date.now()) return { ok: false as const, error: "Expiry must be in the future." };
    const version = (row.quote_version ?? 0) + 1;
    const { error } = await db
      .from("private_aviation_requests")
      .update({
        status: "quoted",
        quote_amount: data.amount,
        quote_currency: data.currency,
        quote_details: { aircraft: data.aircraft, inclusions: data.inclusions ?? null },
        quote_expires_at: data.expiresAt,
        quoted_at: new Date().toISOString(),
        quoted_by: context.userId,
        quote_version: version,
      })
      .eq("id", row.id)
      .is("paid_at", null);
    if (error) return { ok: false as const, error: error.message };
    const { sendAviationEmail } = await import("./emails.server");
    const emailStatus = await sendAviationEmail(row.id, row.customer_email, {
      kind: "quote_ready",
      reference: row.reference,
      customerName: row.customer_name ?? "Guest",
      route: `${row.origin} → ${row.destination}`,
      departureDate: row.departure_date,
      passengers: row.passengers,
      aircraft: data.aircraft,
      amount: data.amount,
      currency: data.currency,
      expiresAt: data.expiresAt,
    });
    return { ok: true as const, version, emailStatus };
  });

const refSchema = z.object({ reference: z.string().regex(/^WWPA-\d{6}-[0-9A-F]{6}$/) });

export const getMyAviationQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db
      .from("private_aviation_requests")
      .select(`${SAFE_COLS}, user_id, customer_name, customer_email, customer_phone, quote_amount, quote_currency, quote_details, quote_expires_at, quote_version, paid_at, paid_amount, paid_currency, receipt_number, payment_id`)
      .eq("reference", data.reference)
      .maybeSingle();
    if (!row || row.user_id !== context.userId) return { ok: false as const, error: "We couldn't find this request in your account." };
    const { user_id: _u, ...safe } = row;
    return { ok: true as const, request: safe as Record<string, any> };
  });

export const completeAviationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    refSchema.extend({ orderId: z.string().min(6).max(80), paymentId: z.string().min(6).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { finalizeAviationPayment } = await import("./payment.server");
    return finalizeAviationPayment({ ...data, userId: context.userId });
  });
