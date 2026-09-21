// RateHawk server functions. Thin wrappers only: every supplier import happens
// inside a handler, so no server-only code or credential name resolution ever
// reaches the client bundle.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: unknown) {
  const { isAdmin } = await import("@/lib/wwl.server");
  if (!(await isAdmin(context as never))) throw new Error("Forbidden");
}

const guestsSchema = z
  .array(
    z.object({
      adults: z.number().int().min(1).max(6),
      children: z.array(z.number().int().min(0).max(17)).max(4).optional(),
    }),
  )
  .min(1)
  .max(4);

const searchSchema = z.object({
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  residency: z.string().min(2).max(3),
  currency: z.string().min(3).max(3).optional(),
  language: z.string().min(2).max(5).optional(),
  guests: guestsSchema,
  regionId: z.number().int().positive().optional(),
  hotelIds: z.array(z.string().max(80)).max(20).optional(),
});

/** Admin console payload: environment, credentials, health, provenance. */
export const getRatehawkAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ probe: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const config = await import("./config");
    const { ratehawkCredentialStatus, ratehawkEnabled, ratehawkEnvironment, ratehawkHost, ratehawkProbe } =
      await import("./client.server");

    const credentials = ratehawkCredentialStatus();
    const health =
      data.probe && credentials.configured
        ? await ratehawkProbe()
        : {
            ok: false,
            status: null as number | null,
            detail: credentials.configured
              ? "Not probed in this load — use Test connection."
              : `NOT CONNECTED — missing ${credentials.missing.join(" and ")}.`,
          };

    return {
      supplier: config.RATEHAWK_SUPPLIER_NAME,
      providerKey: config.RATEHAWK_SUPPLIER_ID,
      environment: ratehawkEnvironment(),
      host: ratehawkHost(),
      enabled: ratehawkEnabled(),
      docsUrl: config.RATEHAWK_DOCS_URL,
      secretNames: [...config.RATEHAWK_SECRET_NAMES],
      credentials,
      capabilities: [...config.RATEHAWK_CAPABILITIES],
      endpoints: config.RATEHAWK_ENDPOINTS,
      limits: config.RATEHAWK_LIMITS,
      health,
      connectionState: credentials.configured
        ? health.ok
          ? "connected"
          : "not-verified"
        : "not-connected",
    };
  });

/** Test Connection. */
export const testRatehawkConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { ratehawkProbe } = await import("./client.server");
    return ratehawkProbe();
  });

/** Destination / hotel autocomplete. */
export const suggestRatehawkDestinations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { suggestDestinations } = await import("./hotels.server");
    const result = await suggestDestinations(data.query);
    return result.ok
      ? { ok: true as const, data: result.data, meta: result.meta }
      : { ok: false as const, error: result.error, meta: result.meta };
  });

/** Search → normalised offers. */
export const searchRatehawkHotels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { normaliseHotelOffers, searchHotels } = await import("./hotels.server");
    const result = await searchHotels(data);
    if (!result.ok) return { ok: false as const, error: result.error, meta: result.meta, offers: [] };
    return { ok: true as const, meta: result.meta, offers: normaliseHotelOffers(result.data) };
  });

/** Hotel details (static content). */
export const getRatehawkHotelDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hotelId: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getHotelDetails } = await import("./hotels.server");
    const result = await getHotelDetails(data.hotelId);
    return result.ok
      ? { ok: true as const, data: result.data, meta: result.meta }
      : { ok: false as const, error: result.error, meta: result.meta };
  });

/** Rooms and rates for one hotel. */
export const getRatehawkHotelRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.extend({ hid: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getHotelRates, normaliseHotelOffers } = await import("./hotels.server");
    const result = await getHotelRates(data);
    if (!result.ok) return { ok: false as const, error: result.error, meta: result.meta, offers: [] };
    return { ok: true as const, meta: result.meta, offers: normaliseHotelOffers(result.data) };
  });

/** Prebook a rate (revalidation before booking). */
export const prebookRatehawkRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bookHash: z.string().min(8).max(200),
        priceIncreasePercent: z.number().min(0).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { normaliseHotelOffers, prebookRate } = await import("./hotels.server");
    const result = await prebookRate(data.bookHash, data.priceIncreasePercent ?? 0);
    if (!result.ok) return { ok: false as const, error: result.error, meta: result.meta, offers: [] };
    return { ok: true as const, meta: result.meta, offers: normaliseHotelOffers(result.data) };
  });

/** Booking status for a partner order id. */
export const getRatehawkBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partnerOrderId: z.string().min(1).max(256) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getBookingStatus } = await import("./hotels.server");
    const result = await getBookingStatus(data.partnerOrderId);
    return result.ok
      ? { ok: true as const, data: result.data, meta: result.meta }
      : { ok: false as const, error: result.error, meta: result.meta };
  });

/** Order info for a partner order id. */
export const getRatehawkOrderInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partnerOrderId: z.string().min(1).max(256) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getOrderInfo } = await import("./hotels.server");
    const result = await getOrderInfo(data.partnerOrderId);
    return result.ok
      ? { ok: true as const, data: result.data, meta: result.meta }
      : { ok: false as const, error: result.error, meta: result.meta };
  });

/** Cancellation. */
export const cancelRatehawkBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partnerOrderId: z.string().min(1).max(256) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { cancelBooking } = await import("./hotels.server");
    const result = await cancelBooking(data.partnerOrderId);
    return result.ok
      ? { ok: true as const, data: result.data, meta: result.meta }
      : { ok: false as const, error: result.error, meta: result.meta };
  });

/** Sandbox-only end-to-end validation, including cancellation of its booking. */
export const runRatehawkValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        regionId: z.number().int().positive().optional(),
        checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        residency: z.string().min(2).max(3).optional(),
        book: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runRatehawkSandboxValidation } = await import("./hotels.server");
    return runRatehawkSandboxValidation(data);
  });
