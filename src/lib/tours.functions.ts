import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const searchSchema = z.object({
  q: z.string().max(120).optional(),
  country: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  page: z.number().int().min(1).max(200).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
  currency: z.string().max(3).optional(),
  sort: z.enum(["NAME", "PRICE", "DEPARTURE"]).optional(),
  durationMin: z.number().int().min(1).max(120).optional(),
  durationMax: z.number().int().min(1).max(120).optional(),
  priceMin: z.number().min(0).max(200000).optional(),
  priceMax: z.number().min(0).max(200000).optional(),
  departFrom: z.string().max(10).optional(),
  departTo: z.string().max(10).optional(),
});

export const searchTourCatalogue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { searchTours } = await import("./tours.server");
    return searchTours(data);
  });

export const getTourDossier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().max(20),
        currency: z.string().max(3).optional(),
        fromDate: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getTourDetail } = await import("./tours.server");
    return getTourDetail(data.id, data.currency ?? "USD", data.fromDate);
  });

export const getTourDepartureList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().max(20),
        currency: z.string().max(3).optional(),
        fromDate: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getTourDepartures } = await import("./tours.server");
    return getTourDepartures(data.id, data.currency ?? "USD", data.fromDate);
  });

export const checkTourAvailability = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        departureId: z.string().max(30),
        roomCode: z.string().max(20).optional(),
        travellers: z.number().int().min(1).max(8).optional(),
        currency: z.string().max(3).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { checkDepartureAvailability } = await import("./tours.server");
    return checkDepartureAvailability(
      data.departureId,
      data.roomCode ?? "",
      data.travellers ?? 1,
      data.currency ?? "USD",
    );
  });

export const reserveTourDeparture = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        departureId: z.string().max(30),
        roomCode: z.string().max(20),
        tourName: z.string().max(200),
        startDate: z.string().max(20),
        currency: z.string().max(3).optional(),
        travellers: z
          .array(
            z.object({
              firstName: z.string().min(1).max(60),
              lastName: z.string().min(1).max(60),
              email: z.string().email().max(160),
              phone: z.string().max(40).optional(),
              title: z.enum(["Mr", "Mrs", "Ms", "Miss"]).optional(),
              dateOfBirth: z.string().max(10).optional(),
              nationalityId: z.string().max(10).optional(),
            }),
          )
          .min(1)
          .max(8),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { createTourBooking } = await import("./tours-booking.server");
    const { fallbackMessage } = await import("./tours-scope");
    const result = await createTourBooking(data);
    // If the supplier cannot issue the live hold (write scope pending or a
    // transient failure), capture the traveller so the desk can complete it.
    if (!result.ok && !("soldOut" in result && result.soldOut)) {
      const lead = data.travellers[0]!;
      const denied = "needsBookingPermission" in result && Boolean(result.needsBookingPermission);
      let captured = false;
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("quote_requests").insert({
          full_name: `${lead.firstName} ${lead.lastName}`.trim(),
          email: lead.email,
          phone: lead.phone ?? null,
          product_kind: "tours",
          product_slug: data.departureId,
          product_title: data.tourName,
          party_size: data.travellers.length,
          travel_month: data.startDate.slice(0, 7),
          message: `Live reservation fallback · departure ${data.departureId} · room ${data.roomCode} · ${
            denied ? "supplier write scope pending" : `supplier error ${result.status}`
          }`,
          status: "new",
        });
        captured = true;
      } catch {
        captured = false;
      }
      return {
        ...result,
        captured,
        deskAssist: true,
        // No booking exists in any of these paths.
        reference: undefined,
        travellerMessage: fallbackMessage({
          writeScopeDenied: denied,
          captured,
          supplierError: denied ? undefined : result.error,
        }),
      };
    }
    return result;
  });

/** Staff-only: confirms a supplier reservation. */
export const confirmTourReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ bookingId: z.string().max(40), serviceId: z.string().max(40).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { confirmTourBooking } = await import("./tours-booking.server");
    return confirmTourBooking(data);
  });

/** Requests cancellation of a live reservation (supplier status transition). */
export const cancelTourReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ bookingId: z.string().max(40), serviceId: z.string().max(40).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { cancelTourBooking } = await import("./tours-booking.server");
    return cancelTourBooking(data);
  });

/** Full supplier-side reservation dossier: services, invoices, payments, refunds, documents. */
export const getTourReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { getTourBooking } = await import("./tours-booking.server");
    return getTourBooking(data.bookingId);
  });

/** Pre-booking requirement + penalty disclosure for a departure (read-only). */
export const getTourDepartureRequirements = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ departureId: z.string().max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { getDepartureRequirements, getTourCancellationTerms } = await import(
      "./tours-booking.server"
    );
    const [requirements, cancellation] = await Promise.all([
      getDepartureRequirements(data.departureId),
      getTourCancellationTerms(data.departureId),
    ]);
    return { requirements, cancellation };
  });

/** Amendment: complete traveller data required before confirmation. */
export const updateTourTraveller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        customerId: z.string().max(40),
        dateOfBirth: z.string().max(10).optional(),
        nationalityId: z.string().max(10).optional(),
        passportNumber: z.string().max(40).optional(),
        passportExpiry: z.string().max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { updateTourCustomer } = await import("./tours-booking.server");
    const { customerId, ...patch } = data;
    return updateTourCustomer(customerId, patch);
  });


export const getTourConnectorStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { toursStatus } = await import("./tours.server");
  return toursStatus();
});

export const getTourTaxonomy = createServerFn({ method: "GET" }).handler(async () => {
  const { getTaxonomy } = await import("./tours-taxonomy.server");
  return getTaxonomy();
});

export const getTourDealsList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(24).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { getTourDeals } = await import("./tours-taxonomy.server");
    return getTourDeals(data.limit ?? 12);
  });

export const getTourDeparture = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ departureId: z.string().max(30), currency: z.string().max(3).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getDepartureDetail } = await import("./tours.server");
    return getDepartureDetail(data.departureId, data.currency ?? "USD");
  });

export const getRelatedTours = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().max(20),
        currency: z.string().max(3).optional(),
        limit: z.number().int().min(1).max(6).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getSimilarTours } = await import("./tours.server");
    return getSimilarTours(data.id, data.currency ?? "USD", data.limit ?? 3);
  });

/**
 * Admin-only diagnostics: reports whether the supplier application key is
 * READ_ONLY or BOOKING_ENABLED. Never creates a booking.
 */
export const getToursWriteScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { probeToursWriteScope, toursStatus } = await import("./tours.server");
    const [scope, status] = await Promise.all([
      probeToursWriteScope(data.force ?? false),
      Promise.resolve(toursStatus()),
    ]);
    return { scope, status };
  });
