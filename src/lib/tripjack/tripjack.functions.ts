// TripJack server functions. Thin wrappers only — supplier code is imported
// inside handlers so the server-only client (and the credential) never enters
// the client bundle.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CAB_JOURNEY_TYPES,
  CAB_TRIP_TYPES,
  TRIPJACK_CERTIFICATION_STATUSES,
  TRIPSAFE_CHANNEL_TYPES,
  TRIPSAFE_NOMINEE_RELATIONS,
} from "./config";

const cabLocation = z.object({
  type: z.literal("location"),
  displayAddress: z.string().min(1).max(300),
  lat: z.string().max(32),
  long: z.string().max(32),
  address: z.object({
    subLocality: z.string().max(120).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
    postalCode: z.string().max(20).optional(),
  }),
});

const cabQuoteSchema = z.object({
  origin: cabLocation,
  destination: cabLocation,
  journeyType: z.enum(CAB_JOURNEY_TYPES),
  tripType: z.enum(CAB_TRIP_TYPES),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).optional(),
  passengers: z.number().int().min(1).max(12),
  durationInMinutes: z.number().int().min(0).max(24 * 60 * 30).optional(),
  distanceInKm: z.number().min(0).max(10_000).optional(),
});

const region = z.object({ rkey: z.string().min(2).max(4), rt: z.enum(["COUNTRY", "POPULARREGION"]) });

const tripsafeSearchSchema = z.object({
  isq: z.object({
    sd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    cd: z.string().max(5).optional(),
    isc: z.object({ iri: z.array(region).min(1).max(20) }),
    iti: z.array(z.object({ age: z.number().int().min(0).max(120) })).min(1).max(10),
    ict: z.enum(TRIPSAFE_CHANNEL_TYPES).optional(),
    adr: z.string().max(4).optional(),
    isef: z.boolean().optional(),
  }),
  bid: z.string().max(40).optional(),
});

const traveller = z.object({
  id: z.number().int().min(1).max(10).optional(),
  ti: z.string().min(1).max(6),
  fn: z.string().min(1).max(60),
  ln: z.string().min(1).max(60),
  age: z.number().int().min(0).max(120),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eid: z.string().email().max(120).optional(),
  cnum: z.string().max(20).optional(),
  pnum: z.string().max(20).optional(),
  pincode: z.string().max(10).optional(),
  gen: z.enum(["M", "F"]).optional(),
  isio: z.boolean().optional(),
  nomineeName: z.string().max(80).optional(),
  nomineeRelation: z.enum(TRIPSAFE_NOMINEE_RELATIONS).optional(),
});

/** Plan selection carried from Search → Review → Book (TripSafe v5.1 §3). */
const tripsafeSelectionSchema = z.object({
  plid: z.string().min(1).max(80),
  pid: z.string().min(1).max(120),
  sd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cd: z.string().max(5).optional(),
  iti: z.array(traveller).min(1).max(10),
  refid: z.string().max(40).optional(),
});

/**
 * Public, credential-free integration status for the Trip services pages.
 */
export const getTripjackStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ suite: z.enum(["cabs", "tripsafe"]) }).parse(d))
  .handler(async ({ data }) => {
    const { tripjackCredentialStatus } = await import("./client.server");
    const { TRIPJACK_CAPABILITIES, TRIPJACK_SUITE_LABEL, TRIPJACK_UAT_BASE_URL } = await import("./config");
    const capabilities = TRIPJACK_CAPABILITIES[data.suite].map((c) => ({
      key: c.key,
      label: c.label,
      mutating: c.mutating,
      mapped: c.path !== null,
      doc: c.doc,
      note: c.note,
    }));
    return {
      suite: data.suite,
      label: TRIPJACK_SUITE_LABEL[data.suite],
      environment: "uat" as const,
      baseUrl: TRIPJACK_UAT_BASE_URL,
      credentialConfigured: tripjackCredentialStatus().configured,
      capabilities,
      mappedCount: capabilities.filter((c) => c.mapped).length,
      live: capabilities.some((c) => c.mapped) && tripjackCredentialStatus().configured,
    };
  });

// ─── Cabs: public reads ──────────────────────────────────────────────────────

export const searchCabLocations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ query: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { searchCabPlaces } = await import("./cabs.server");
    return searchCabPlaces(data.query);
  });

export const resolveCabLocation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ placeId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { resolveCabPlace } = await import("./cabs.server");
    return resolveCabPlace(data.placeId);
  });

export const getCabQuotes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cabQuoteSchema.parse(d))
  .handler(async ({ data }) => {
    const { quoteCabs } = await import("./cabs.server");
    return quoteCabs(data);
  });

// ─── Cabs: authenticated writes ──────────────────────────────────────────────

export const createCabBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        idempotencyKey: z.string().min(8).max(80),
        title: z.string().min(1).max(160),
        request: z.object({
          journeyInfo: z.record(z.string(), z.unknown()),
          routeDetail: z.record(z.string(), z.unknown()),
          quotationInfo: z.object({
            vehicleType: z.string().max(60).optional(),
            vehicleCategory: z.string().max(60).optional(),
            quoteId: z.string().max(80).optional(),
            childQuoteId: z.string().max(80).optional(),
            paxCount: z.number().int().optional(),
            luggageCount: z.number().int().optional(),
            vendorId: z.number().int().optional(),
          }),
          pricingInfo: z.object({
            netAmount: z.string().max(20),
            addonsPrice: z.string().max(20),
            agentMarkup: z.number(),
            agentMarkupSplitup: z.object({ onwardJourneyMarkup: z.number(), returnJourneyMarkup: z.number() }),
            grossAmount: z.string().max(20),
          }),
          passengerDetail: z.object({
            firstName: z.string().min(1).max(60),
            lastName: z.string().min(1).max(60),
            email: z.string().email().max(120),
            phone: z.string().min(6).max(20),
            flightDetails: z.object({ number: z.string().max(12).optional() }).optional(),
          }),
          serviceRequest: z.string().max(300).optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { bookCab } = await import("./cabs.server");
    return bookCab(context.supabase as never, context.userId, {
      idempotencyKey: data.idempotencyKey,
      title: data.title,
      request: { ...data.request, addons: [], consent: "yes" } as never,
    });
  });

export const payCabBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { payCabBooking } = await import("./cabs.server");
    return payCabBooking(context.supabase as never, data.bookingId);
  });

export const syncCabBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { syncCabBooking } = await import("./cabs.server");
    const r = await syncCabBooking(context.supabase as never, data.bookingId);
    return { booking: r.booking, message: r.message };
  });

export const cancelCabBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: z.string().uuid(), reason: z.string().min(3).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { cancelCabBooking } = await import("./cabs.server");
    return cancelCabBooking(context.supabase as never, data.bookingId, data.reason);
  });

export const listMyCabBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCabBookings } = await import("./cabs.server");
    return listCabBookings(context.supabase as never);
  });

// ─── TripSafe: public reads ──────────────────────────────────────────────────

export const searchTripsafePlans = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tripsafeSearchSchema.parse(d))
  .handler(async ({ data }) => {
    const { searchTripsafe } = await import("./tripsafe.server");
    const r = await searchTripsafe(data);
    if (!r.ok) return r;
    // Do not ship the full raw supplier payload to the browser.
    const plans = r.data.plans.map(({ raw: _raw, ...p }) => p);
    return { ok: true as const, correlationId: r.correlationId, data: { searchId: r.data.searchId, plans } };
  });

export const reviewTripsafePlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tripsafeReviewSchema.parse(d))
  .handler(async ({ data }) => {
    const { reviewTripsafe } = await import("./tripsafe.server");
    const r = await reviewTripsafe(data);
    if (!r.ok) return r;
    return { ok: true as const, correlationId: r.correlationId, data: { bookingId: r.data.bookingId, totalFare: r.data.totalFare } };
  });

// ─── TripSafe: authenticated writes ──────────────────────────────────────────

export const createTripsafeBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        idempotencyKey: z.string().min(8).max(80),
        planName: z.string().min(1).max(160),
        review: tripsafeReviewSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { bookTripsafe } = await import("./tripsafe.server");
    return bookTripsafe(context.supabase as never, context.userId, data);
  });

export const syncTripsafeBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { syncTripsafeBooking } = await import("./tripsafe.server");
    const r = await syncTripsafeBooking(context.supabase as never, data.bookingId);
    return { booking: r.booking, message: r.message };
  });

export const cancelTripsafeBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: z.string().uuid(), reason: z.string().min(3).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { cancelTripsafeBooking } = await import("./tripsafe.server");
    return cancelTripsafeBooking(context.supabase as never, data.bookingId, data.reason);
  });

export const listMyInsuranceBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listInsuranceBookings } = await import("./tripsafe.server");
    return listInsuranceBookings(context.supabase as never);
  });

// ─── Staff diagnostics ───────────────────────────────────────────────────────

export const getTripjackDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { tripjackCredentialStatus, tripjackLogs } = await import("./client.server");
    return { credential: tripjackCredentialStatus(), logs: tripjackLogs(50) };
  });

export const probeTripjackCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        suite: z.enum(["cabs", "tripsafe"]),
        capability: z.string().max(40),
        payload: z.record(z.string(), z.unknown()).optional(),
        query: z.record(z.string(), z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { tripjackCapability } = await import("./config");
    const cap = tripjackCapability(data.suite, data.capability);
    if (!cap) return { ok: false as const, message: "Unknown capability." };
    if (cap.mutating) return { ok: false as const, message: "Mutating operations cannot be probed." };
    const { tripjackCall, redact } = await import("./client.server");
    const result = await tripjackCall(data.suite, data.capability, data.payload ?? {}, data.query);
    return result.ok
      ? { ok: true as const, correlationId: result.correlationId, sample: JSON.stringify(redact(result.data)).slice(0, 4000) }
      : { ok: false as const, message: result.error.message, kind: result.error.kind };
  });
