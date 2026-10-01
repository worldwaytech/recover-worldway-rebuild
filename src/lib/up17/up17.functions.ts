import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { Up17City } from "./cities.db.server";

const iata = z.string().trim().min(2).max(4);

const searchSchema = z.object({
  origin: iata.optional().default(""),
  destination: iata.optional().default(""),
  depart_date: z.string().trim().min(4),
  return_date: z.string().trim().optional(),
  passengers: z.number().int().min(1).max(9).optional(),
  children: z.number().int().min(0).max(8).optional(),
  infants: z.number().int().min(0).max(8).optional(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  trip_type: z.enum(["one_way", "round_trip", "multi_city"]).optional(),
  direct_only: z.boolean().optional(),
  preferred_carriers: z.array(z.string().trim().min(2).max(3)).max(10).optional(),
  legs: z
    .array(z.object({ origin: iata, destination: iata, date: z.string().trim().min(4) }))
    .max(6)
    .optional(),
});

export const up17FlightSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data }) => {
    const { up17SearchFlights } = await import("./up17.server");
    const res = await up17SearchFlights(data);
    return {
      ok: res.ok,
      status: res.status,
      error: res.error,
      searchTokenId: res.data?.searchTokenId ?? null,
      offers: res.data?.offers ?? [],
      count: res.data?.count ?? 0,
    };
  });

export const up17BaggageLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: z.string().trim().min(1).max(200),
        searchTokenId: z.string().trim().min(1).max(200),
        currency: z.string().trim().max(6).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { up17BaggageOptions } = await import("./up17.server");
    const res = await up17BaggageOptions(data);
    return { ok: res.ok, options: res.data?.options ?? [] };
  });

export const up17FareRuleLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: z.string().trim().min(1).max(200),
        searchTokenId: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { up17FareRules } = await import("./up17.server");
    const res = await up17FareRules(data);
    return { ok: res.ok, error: res.error, rules: res.data?.rules ?? [] };
  });

export type AirportSuggestion = {
  iata: string;
  city: string;
  country: string;
  name: string;
};

export const up17AirportLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().trim().max(80),
        limit: z.number().int().min(1).max(25).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; results: AirportSuggestion[] }> => {
    const { searchAirports } = await import("./up17.server");
    return { ok: true, results: searchAirports(data.query, data.limit ?? 12) };
  });

export const up17Status = createServerFn({ method: "GET" }).handler(async () => {
  const { up17Configured } = await import("./up17.server");
  return { configured: up17Configured() };
});

const hotelSchema = z.object({
  destination: z.string().trim().min(1).max(120),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(20).optional(),
  rooms: z.number().int().min(1).max(10).optional(),
  nationality: z.string().trim().max(4).optional(),
  min_rating: z.number().int().min(1).max(5).optional(),
  max_rating: z.number().int().min(1).max(5).optional(),
});

export const up17HotelSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => hotelSchema.parse(d))
  .handler(async ({ data }) => {
    const { up17SearchHotels } = await import("./up17.server");
    const res = await up17SearchHotels(data);
    return {
      ok: res.ok,
      status: res.status,
      error: res.error,
      searchTokenId: res.data?.searchTokenId ?? null,
      cityName: res.data?.cityName ?? "",
      hotels: res.data?.hotels ?? [],
      count: res.data?.count ?? 0,
    };
  });

export const up17HotelDetailLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: z.string().trim().min(1).max(200),
        hotelCode: z.string().trim().min(1).max(200),
        searchTokenId: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { up17HotelDetail } = await import("./up17.server");
    const res = await up17HotelDetail(data);
    return {
      ok: res.ok,
      error: res.error,
      gallery: res.data?.gallery ?? [],
      amenities: res.data?.amenities ?? [],
      description: res.data?.description ?? "",
      checkInTime: res.data?.checkInTime ?? "",
      checkOutTime: res.data?.checkOutTime ?? "",
    };
  });

export const up17CityLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().trim().max(80),
        limit: z.number().int().min(1).max(25).optional(),
        kind: z.enum(["hotel", "bus"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { up17CityAutocomplete } = await import("./up17.server");
    return up17CityAutocomplete(data.query, data.limit ?? 12, data.kind ?? "hotel");
  });

const busSchema = z.object({
  origin: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.number().int().min(1).max(50).optional(),
});

export const up17BusSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => busSchema.parse(d))
  .handler(async ({ data }) => {
    const { up17SearchBuses } = await import("./up17.server");
    const res = await up17SearchBuses(data);
    return {
      ok: res.ok,
      status: res.status,
      error: res.error,
      searchTokenId: res.data?.searchTokenId ?? null,
      buses: res.data?.buses ?? [],
      count: res.data?.count ?? 0,
    };
  });

const extraKeys = z.array(z.string().trim().min(1).max(80)).max(12).optional();
const extraSelectionSchema = z.object({ baggage: extraKeys, meal: extraKeys, seat: extraKeys }).strict();

const paxSchema = z.object({
  title: z.enum(["Mr", "Mrs", "Ms", "Dr", "Mstr", "Miss"]),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  pax_type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.union([z.literal(1), z.literal(2)]),
  nationality: z.string().trim().length(2),
  address_line1: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(60),
  country_code: z.string().trim().length(2),
  contact_no: z.string().trim().min(6).max(20),
  email: z.string().trim().email().max(120),
  is_lead: z.boolean(),
  passport_no: z.string().trim().max(20).optional(),
  passport_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passport_issue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pan: z.string().trim().max(12).optional(),
  baggage_codes: z.array(z.string().trim().max(24)).max(8).optional(),
  meal_codes: z.array(z.string().trim().max(24)).max(8).optional(),
  extras: extraSelectionSchema.optional(),
});

export const up17FlightExtrasLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: z.string().trim().min(1).max(200),
        searchTokenId: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { flightExtras } = await import("./up17.server");
    return flightExtras(data);
  });

export const up17ConfirmFlightFare = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: z.string().trim().min(1).max(200),
        searchTokenId: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { up17ConfirmFare } = await import("./up17.server");
    const res = await up17ConfirmFare(data);
    return { ok: res.ok, error: res.error, confirmation: res.data ?? null };
  });

const UNCERTAIN_MSG =
  "Payment received. Your ticket is being confirmed by the Worldway team — please do not pay again; we will contact you shortly.";

export const up17BookFlightTicket = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        resultIndex: z.string().trim().min(1).max(200),
        searchTokenId: z.string().trim().min(1).max(200),
        passengers: z.array(paxSchema).min(1).max(9),
        /** Razorpay order + payment that funded this ticket. Both are mandatory. */
        orderId: z.string().trim().min(6).max(80),
        paymentId: z.string().trim().min(6).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { claimVerifiedPaymentForFulfilment, recordFulfilment, releaseFulfilmentClaim, optionalUserId } =
      await import("@/lib/payments/payments.server");

    // Re-price on the server immediately before ticketing. The amount used to
    // open checkout came from the browser, so it is never authoritative for a
    // supplier booking. Fail closed if UP17 cannot return a usable live fare.
    const { up17ConfirmFare } = await import("./up17.server");
    const confirmedFare = await up17ConfirmFare({
      resultIndex: data.resultIndex,
      searchTokenId: data.searchTokenId,
    });
    const { resolveFlightExtras } = await import("./up17.server");
    const extras = await resolveFlightExtras({
      resultIndex: data.resultIndex,
      searchTokenId: data.searchTokenId,
      selections: data.passengers.map((p) => p.extras ?? {}),
    });
    if (!extras.ok) return { ok: false as const, error: extras.error, booking: null };
    const fareTotal = confirmedFare.data?.total;
    const total = fareTotal === null || fareTotal === undefined ? fareTotal : fareTotal + extras.total;
    const currency = confirmedFare.data?.currency.trim().toUpperCase();
    if (!confirmedFare.ok || total === null || total === undefined || !currency) {
      return {
        ok: false as const,
        error: confirmedFare.error ?? "The live fare could not be verified. No ticket was issued.",
        booking: null,
      };
    }
    const zeroDecimal = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);
    const expectedAmountMinor = zeroDecimal.has(currency) ? Math.round(total) : Math.round(total * 100);
    if (!Number.isSafeInteger(expectedAmountMinor) || expectedAmountMinor < 1) {
      return {
        ok: false as const,
        error: "The live fare could not be verified. No ticket was issued.",
        booking: null,
      };
    }

    // Payment-before-booking: the supplier is only called once this server has
    // verified capture with Razorpay, matched it exactly to the server-confirmed
    // fare and currency, and claimed it only once.
    const claim = await claimVerifiedPaymentForFulfilment({
      orderId: data.orderId,
      paymentId: data.paymentId,
      expectedUserId: await optionalUserId(),
      expectedPurpose: "flight",
      expectedAmountMinor,
      expectedCurrency: currency,
    });
    if (!claim.ok) {
      return { ok: false as const, error: claim.error, booking: null };
    }

    const { up17BookFlight } = await import("./up17.server");
    let res: Awaited<ReturnType<typeof up17BookFlight>>;
    try {
      res = await up17BookFlight({
        resultIndex: data.resultIndex,
        searchTokenId: data.searchTokenId,
        passengers: data.passengers.map((p, i) => {
          const { extras: _sel, ...rest } = p;
          const ssr = extras.perPax[i];
          return ssr && (ssr.baggage.length || ssr.meal.length || ssr.seat.length) ? { ...rest, ssr } : rest;
        }),
      });
    } catch (e) {
      // Outcome unknown — the ticket may exist. Keep the claim (no retry on this
      // payment) and hand to staff for reconciliation; never risk a duplicate ticket.
      console.error("[up17] book outcome uncertain", { orderId: data.orderId, error: e instanceof Error ? e.message : e });
      return { ok: false as const, uncertain: true as const, error: UNCERTAIN_MSG, booking: null };
    }

    if (!res.ok && (res.status === 0 || res.status >= 500)) {
      // Timeout / network / server error: the airline may have issued the ticket.
      console.error("[up17] book outcome uncertain", { orderId: data.orderId, status: res.status, error: res.error });
      return { ok: false as const, uncertain: true as const, error: UNCERTAIN_MSG, booking: null };
    }

    if (!res.ok) {
      // No ticket was issued — release the claim so the guest may retry on the
      // same payment without risking a duplicate ticket.
      await releaseFulfilmentClaim(data.orderId);
      return { ok: false as const, error: res.error, booking: null };
    }

    const raw = (res.data ?? null) as { pnr?: string; booking_id?: string | number } | null;
    const reference = raw?.pnr ?? String(raw?.booking_id ?? data.paymentId);
    await recordFulfilment(data.orderId, reference);

    return { ok: true as const, error: res.error, booking: res.data ?? null };

  });


export const up17FlightBookingLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        searchTokenId: z.string().trim().min(1).max(200),
        orderId: z.string().trim().min(1).max(100),
        paymentId: z.string().trim().min(1).max(100),
        bookingId: z.string().trim().max(60).optional(),
        pnr: z.string().trim().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Only the payer of a fulfilled order may read the booking it produced.
    const { getPaymentByOrderId, optionalUserId } = await import("@/lib/payments/payments.server");
    const denied = { ok: false as const, error: "Booking details are not available.", booking: null };
    const pay = await getPaymentByOrderId(data.orderId);
    if (!pay || pay.payment_id !== data.paymentId || pay.status !== "paid" || !pay.fulfilled_at) return denied;
    if (pay.user_id) {
      const uid = await optionalUserId();
      if (uid !== pay.user_id) return denied;
    }
    const ref = (pay.fulfilment_reference ?? "").trim();
    if (!ref || (ref !== (data.pnr ?? "") && ref !== (data.bookingId ?? ""))) return denied;
    const { up17FlightBookingDetail } = await import("./up17.server");
    const res = await up17FlightBookingDetail({
      searchTokenId: data.searchTokenId,
      bookingId: data.bookingId,
      pnr: data.pnr,
    });
    return { ok: res.ok, error: res.error, booking: res.data ?? null };
  });

/** Real supplier calendar fares with the approved Worldway flight markup applied. */
export const up17CalendarFareLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        origin: iata,
        destination: iata,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { up17CalendarFares } = await import("./up17.server");
    const { commercialRuleFor } = await import("@/lib/engine/suppliers/commercial.server");
    const rule = commercialRuleFor({ supplierKey: "up17" });
    const res = await up17CalendarFares(data);
    if (!res.ok || !rule) return { ok: false as const, fares: [] as { date: string; price: number; lowest: boolean }[], currency: "INR" };
    const fares = (res.data?.fares ?? []).map((f) => ({
      date: f.date,
      price: Math.round(f.fare * (1 + rule.markupPercent / 100) + rule.serviceFee),
      lowest: f.lowestOfMonth,
    }));
    return { ok: true as const, fares, currency: "INR" };
  });
