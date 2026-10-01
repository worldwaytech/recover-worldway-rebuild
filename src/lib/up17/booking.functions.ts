import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string; supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } };
const ctx = (c: unknown) => c as Ctx;

async function assertStaff(c: Ctx) {
  const { data, error } = await c.supabase.rpc("is_staff", { _user_id: c.userId });
  if (error || data !== true) throw new Error("Forbidden");
}

const token = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(60).regex(/^[A-Za-z .'-]+$/, "Use letters only");
const phone = z.string().trim().regex(/^\d{8,15}$/, "Enter a valid phone number");
const title = z.enum(["Mr", "Mrs", "Ms", "Miss", "Mstr"]);

// ------------------------------------------------------------------ hotels

export const hotelRoomOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultIndex: token, hotelCode: token, searchTokenId: token }).parse(d))
  .handler(async ({ data }) => {
    const { up17HotelRooms } = await import("./up17.server");
    const r = await up17HotelRooms(data);
    return { ok: r.ok, error: r.ok ? null : "Rooms are not available for this hotel right now.", rooms: r.rooms };
  });

const guest = z.object({
  title,
  first_name: name,
  last_name: name,
  phone,
  email: z.string().trim().email().max(120),
  pax_type: z.union([z.literal(1), z.literal(2)]),
  age: z.number().int().min(0).max(120),
  lead: z.boolean(),
  pan: z.string().trim().regex(/^[A-Z]{5}\d{4}[A-Z]$/).optional(),
});

export const prepareHotelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: token,
        hotelCode: token,
        hotelName: z.string().trim().min(1).max(200),
        searchTokenId: token,
        nationality: z.string().trim().length(2),
        checkIn: z.string().max(20).optional(),
        checkOut: z.string().max(20).optional(),
        city: z.string().max(120).optional(),
        rooms: z.array(z.object({ roomIndex: z.number().int().min(0), guests: z.array(guest).min(1).max(8) })).min(1).max(6),
      })
      .refine((v) => v.rooms.flatMap((r) => r.guests).filter((g) => g.lead).length === 1, "Choose exactly one lead guest")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { up17HotelBlockRoom } = await import("./up17.server");
    const block = await up17HotelBlockRoom({ ...data, roomIndexes: data.rooms.map((r) => r.roomIndex) });
    if (!block.ok || block.total === null) {
      return { ok: false as const, error: "This room could not be held at a live price. Please choose another room." };
    }
    const { createIntent } = await import("./booking.server");
    const intent = await createIntent({
      userId: ctx(context).userId,
      product: "hotel",
      amount: block.total,
      currency: block.currency,
      summary: {
        title: data.hotelName,
        city: data.city ?? null,
        checkIn: data.checkIn ?? null,
        checkOut: data.checkOut ?? null,
        rooms: block.rooms.map((r) => ({ name: r.name, mealPlan: r.mealPlan, cancellation: r.cancellation })),
        lead: (() => { const g = data.rooms.flatMap((r) => r.guests).find((x) => x.lead)!; return `${g.first_name} ${g.last_name}`; })(),
        guests: data.rooms.reduce((s, r) => s + r.guests.length, 0),
      },
      payload: { kind: "hotel", resultIndex: data.resultIndex, hotelCode: data.hotelCode, hotelName: data.hotelName, searchTokenId: data.searchTokenId, nationality: data.nationality, rooms: data.rooms },
    });
    return { ok: true as const, priceChanged: block.priceChanged, ...intent };
  });

// ------------------------------------------------------------------- buses

export const busSeatOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultIndex: token, searchTokenId: token }).parse(d))
  .handler(async ({ data }) => {
    const { up17BusSeatLayout, up17BusPoints } = await import("./up17.server");
    const [seats, points] = await Promise.all([up17BusSeatLayout(data), up17BusPoints(data)]);
    return {
      ok: seats.ok && points.ok,
      error: seats.ok && points.ok ? null : "Seats are not available for this bus right now.",
      seats: seats.seats,
      boarding: points.boarding,
      dropping: points.dropping,
    };
  });

export const prepareBusBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: token,
        searchTokenId: token,
        boardingPointId: z.number().int(),
        droppingPointId: z.number().int(),
        operator: z.string().max(120).optional(),
        route: z.string().max(200).optional(),
        departure: z.string().max(40).optional(),
        passengers: z
          .array(
            z.object({
              title,
              first_name: name,
              last_name: name,
              email: z.string().trim().email().max(120),
              phone,
              gender: z.enum(["1", "2"]),
              age: z.number().int().min(1).max(120),
              address: z.string().trim().min(5).max(200),
              seat_name: z.string().trim().min(1).max(10),
              lead: z.boolean(),
            }),
          )
          .min(1)
          .max(6),
      })
      .refine((v) => v.passengers.filter((p) => p.lead).length === 1, "Choose exactly one lead passenger")
      .refine((v) => new Set(v.passengers.map((p) => p.seat_name)).size === v.passengers.length, "Each passenger needs a different seat")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { up17BusBlockSeat } = await import("./up17.server");
    const block = await up17BusBlockSeat(data);
    if (!block.ok || block.total === null) {
      return { ok: false as const, error: "These seats could not be held at a live price. Please choose other seats." };
    }
    const { createIntent } = await import("./booking.server");
    const lead = data.passengers.find((p) => p.lead)!;
    const intent = await createIntent({
      userId: ctx(context).userId,
      product: "bus",
      amount: block.total,
      currency: block.currency,
      summary: {
        title: data.route ?? "Bus journey",
        operator: data.operator ?? null,
        departure: data.departure ?? null,
        seats: data.passengers.map((p) => p.seat_name),
        lead: `${lead.first_name} ${lead.last_name}`,
        guests: data.passengers.length,
      },
      payload: { kind: "bus", resultIndex: data.resultIndex, searchTokenId: data.searchTokenId, boardingPointId: data.boardingPointId, droppingPointId: data.droppingPointId, passengers: data.passengers },
    });
    return { ok: true as const, priceChanged: block.priceChanged, ...intent };
  });

// ----------------------------------------------------------------- flights (wallet)

export const prepareFlightBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: token,
        searchTokenId: token,
        route: z.string().max(200).optional(),
        departure: z.string().max(40).optional(),
        passengers: z.array(z.record(z.string(), z.unknown())).min(1).max(9),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { up17ConfirmFare, resolveFlightExtras } = await import("./up17.server");
    const pax = data.passengers as unknown as (import("./up17.server").Up17Passenger & { extras?: { baggage?: string[]; meal?: string[]; seat?: string[] } })[];
    const fare = await up17ConfirmFare({ resultIndex: data.resultIndex, searchTokenId: data.searchTokenId });
    const extras = await resolveFlightExtras({ resultIndex: data.resultIndex, searchTokenId: data.searchTokenId, selections: pax.map((p) => p.extras ?? {}) });
    if (!fare.ok || fare.data?.total == null || !extras.ok) {
      return { ok: false as const, error: "The live fare could not be verified. Please search again." };
    }
    const { createIntent } = await import("./booking.server");
    const lead = pax.find((p) => p.is_lead) ?? pax[0];
    const intent = await createIntent({
      userId: ctx(context).userId,
      product: "flight",
      amount: fare.data.total + extras.total,
      currency: fare.data.currency,
      summary: { title: data.route ?? "Flight", departure: data.departure ?? null, lead: `${lead.first_name} ${lead.last_name}`, guests: pax.length, extrasTotal: extras.total },
      payload: {
        kind: "flight",
        resultIndex: data.resultIndex,
        searchTokenId: data.searchTokenId,
        passengers: pax.map((p, i) => {
          const { extras: _e, ...rest } = p;
          const ssr = extras.perPax[i];
          return ssr && (ssr.baggage.length || ssr.meal.length || ssr.seat.length) ? { ...rest, ssr } : rest;
        }),
      },
    });
    return { ok: true as const, priceChanged: fare.data.priceChanged, ...intent };
  });

// ----------------------------------------------------------------- payment

export const payTravelBookingWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { payWithWalletAndFulfil } = await import("./booking.server");
    return payWithWalletAndFulfil(data.bookingId, ctx(context).userId);
  });

// ----------------------------------------------------------------- account

export const myTravelBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { customerView } = await import("./booking.server");
    const { data } = await (supabaseAdmin as never as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("travel_bookings")
      .select("*")
      .eq("user_id", ctx(context).userId)
      .neq("status", "awaiting_payment")
      .order("created_at", { ascending: false })
      .limit(100);
    return ((data ?? []) as Parameters<typeof customerView>[0][]).map(customerView);
  });

export const myTravelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getBooking, customerView } = await import("./booking.server");
    const row = await getBooking(data.id);
    if (!row || row.user_id !== ctx(context).userId) return null;
    return customerView(row);
  });

/** Hotel cancellation via the documented offline cancel request; staff complete any refund. */
export const requestTravelCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().trim().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getBooking } = await import("./booking.server");
    const row = await getBooking(data.id);
    if (!row || row.user_id !== ctx(context).userId) return { ok: false as const, error: "Booking not found." };
    if (row.status === "confirmed" && row.product === "activity" && row.supplier_booking_id) {
      return cancelActivity(row as never, ctx(context).userId);
    }
    if (row.status !== "confirmed" || row.product !== "hotel" || !row.supplier_booking_id) {
      return { ok: false as const, error: "Please contact the Worldway team to change this booking." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as never as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: claimed } = await sb.from("travel_bookings").update({ status: "cancel_requested" }).eq("id", row.id).eq("status", "confirmed").select("id").maybeSingle();
    if (!claimed) return { ok: false as const, error: "A cancellation is already in progress." };
    const { up17HotelCancel } = await import("./up17.server");
    const payload = row.supplier_payload as { searchTokenId: string };
    const res = await up17HotelCancel({ bookingId: row.supplier_booking_id, searchTokenId: payload.searchTokenId, remarks: data.reason || "Customer cancellation" }).catch(() => null);
    await sb.from("travel_bookings").update({
      customer_message: "Cancellation requested. The Worldway team will confirm it and any refund under the hotel's cancellation rules.",
      supplier_response: { cancel: res ? { ok: res.ok, status: res.status, error: res.error ?? null, data: res.data ?? null } : { ok: false, error: "no response" } },
    }).eq("id", row.id);
    await sb.from("admin_audit_log").insert({ action: "travel_booking.cancel_requested", target_table: "travel_bookings", target_id: row.id, actor_id: ctx(context).userId, detail: { supplier_ok: res?.ok ?? false } });
    return { ok: true as const };
  });

// ----------------------------------------------------------------- wallet

export const myWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { walletSnapshot } = await import("./booking.server");
    return walletSnapshot(ctx(context).userId);
  });

// ----------------------------------------------------------------- staff

export const staffTravelBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(ctx(context));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { worldwayTravelRef } = await import("./booking.server");
    const { data } = await (supabaseAdmin as never as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("travel_bookings")
      .select("id, user_id, product, status, currency, amount_minor, payment_method, payment_order_id, payment_id, supplier_booking_id, supplier_pnr, supplier_response, summary, created_at")
      .neq("status", "awaiting_payment")
      .order("created_at", { ascending: false })
      .limit(200);
    return ((data ?? []) as { id: string }[]).map((r) => ({ ...r, reference: worldwayTravelRef(r.id) }));
  });

export const staffResolveTravelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      bookingId: z.string().uuid(),
      action: z.enum(["release_wallet", "refund_wallet", "mark_confirmed", "mark_failed"]),
      supplierReference: z.string().trim().max(80).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(ctx(context));
    const { staffResolve } = await import("./booking.server");
    try {
      return await staffResolve({ ...data, staffId: ctx(context).userId });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
    }
  });

/**
 * Activity cancellation: only when Viator's own cancel quote returns a full
 * refund (so the Worldway full refund is exact); reason code always from
 * Viator's published list. Refund is completed by staff (card) or the wallet refund.
 */
async function cancelActivity(row: { id: string; supplier_booking_id: string }, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as never as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { viatorCancelQuote, viatorCancelReasons, viatorCancelBooking } = await import("@/lib/viator/post-booking.server");
  const quote = await viatorCancelQuote(row.supplier_booking_id);
  const full = quote.ok && quote.status === "CANCELLABLE" && quote.refund?.refundAmount != null && quote.refund.itemPrice != null && quote.refund.refundAmount >= quote.refund.itemPrice;
  if (!full) return { ok: false as const, error: "This experience can no longer be cancelled for a full refund online. Please contact the Worldway team." };
  const reasons = await viatorCancelReasons("CUSTOMER");
  const reason = reasons.reasons.find((r) => r.code === "Customer_Service.I_canceled_my_entire_trip") ?? reasons.reasons[0];
  if (!reason) return { ok: false as const, error: "Please contact the Worldway team to cancel this booking." };
  const { data: claimed } = await sb.from("travel_bookings").update({ status: "cancel_requested" }).eq("id", row.id).eq("status", "confirmed").select("id").maybeSingle();
  if (!claimed) return { ok: false as const, error: "A cancellation is already in progress." };
  const res = await viatorCancelBooking(row.supplier_booking_id, reason.code).catch(() => null);
  const accepted = res?.ok && /ACCEPTED|CANCEL/i.test(res.status ?? "");
  await sb.from("travel_bookings").update({
    status: accepted ? "cancelled" : "cancel_requested",
    customer_message: accepted
      ? "Cancelled. Your full refund will be completed by the Worldway team."
      : "Cancellation requested. The Worldway team will confirm it and your refund.",
    supplier_response: { cancel: { quote: quote.refund, ok: res?.ok ?? false, status: res?.status ?? null, error: res?.error ?? null } },
  }).eq("id", row.id);
  await sb.from("admin_audit_log").insert({ action: accepted ? "travel_booking.cancelled" : "travel_booking.cancel_requested", target_table: "travel_bookings", target_id: row.id, actor_id: userId, detail: { supplier_ok: res?.ok ?? false, refund_needed: true } });
  return { ok: true as const };
}
