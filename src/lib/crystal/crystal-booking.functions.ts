import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  availableSuitesInputSchema,
  cancelInputSchema,
  confirmInputSchema,
  holdInputSchema,
} from "./booking-contract";

/** Public, credential-free view of whether Crystal supplier booking is armed. */
export const getCrystalBookingCapability = createServerFn({ method: "GET" }).handler(async () => {
  const { bookingCapability } = await import("./aktg-booking.server");
  return bookingCapability();
});

/**
 * Open suite numbers for a voyage + suite category + price type + currency
 * (documented GET /d/v1/cruises/availablesuites). Read-only; used for suite
 * selection between revalidation and the hold. Never fabricates suites.
 */
export const getCrystalAvailableSuites = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => availableSuitesInputSchema.parse(d))
  .handler(async ({ data }) => {
    const { listAvailableSuites, CrystalBookingUnavailableError } =
      await import("./aktg-booking.server");
    try {
      const suites = await listAvailableSuites(data);
      return { live: true as const, suites, checkedAt: new Date().toISOString() };
    } catch (err) {
      if (err instanceof CrystalBookingUnavailableError) {
        return {
          live: false as const,
          suites: [],
          checkedAt: new Date().toISOString(),
          error:
            "Suite selection is not available right now; our Crystal desk will allocate a suite for you.",
        };
      }
      return {
        live: false as const,
        suites: [],
        checkedAt: new Date().toISOString(),
        error: "Crystal could not return available suites for this grade right now.",
      };
    }
  });

/** Availability/pricing revalidation → supplier hold (or tracked request). */
export const holdCrystalSuite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => holdInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { holdCrystalVoyage } = await import("./booking.server");
    return holdCrystalVoyage(context.supabase, context.userId, data);
  });

export const confirmCrystalReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Online reservations are only sent to Crystal after a verified deposit
    // payment (prepareCrystalDeposit → shared paid-booking engine). This
    // endpoint can no longer create an unpaid supplier booking.
    const { retrieveCrystalBooking } = await import("./booking.server");
    void data.idempotencyKey;
    const { booking } = await retrieveCrystalBooking(context.supabase, data.bookingId);
    return {
      booking,
      confirmed: booking.status === "confirmed",
      message: "Pay the deposit to send your reservation to Crystal.",
    };
  });

/** Live FX-locked INR deposit intent for a held Crystal suite. */
export const prepareCrystalDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: z.string().uuid(), policyVersion: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { prepareCruiseDeposit } = await import("./deposit.server");
    try {
      return await prepareCruiseDeposit(context.supabase, context.userId, {
        crystalBookingId: data.bookingId,
        policyVersion: data.policyVersion,
      });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message.slice(0, 200) : "Could not prepare the deposit." };
    }
  });

export const getCrystalBookingDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { retrieveCrystalBooking } = await import("./booking.server");
    return retrieveCrystalBooking(context.supabase, data.bookingId);
  });

export const listCrystalReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCrystalBookings } = await import("./booking.server");
    return { bookings: await listCrystalBookings(context.supabase) };
  });

export const cancelCrystalReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cancelInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { cancelCrystalBooking } = await import("./booking.server");
    return cancelCrystalBooking(context.supabase, context.userId, data.bookingId, data.reason);
  });

/** Admin-only booking rail diagnostics (audit trail carries no credentials). */
export const getCrystalBookingDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { bookingCapability, bookingOperationCatalog, crystalBookingAudit } =
      await import("./aktg-booking.server");
    return {
      capability: bookingCapability(),
      catalog: bookingOperationCatalog(),
      audit: crystalBookingAudit(20),
    };
  });

/** Admin-only safe PROD validation: read-only documented operations only. */
export const verifyCrystalBookingReadOnly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { verifyBookingReadOnly } = await import("./aktg-booking.server");
    return { probes: await verifyBookingReadOnly() };
  });

/**
 * Admin-only Crystal PROD readiness check. Never mutates supplier state:
 * with `probe: true` it performs one documented parameter-free GET only.
 */
export const getCrystalProdReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ probe: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { crystalProdReadiness } = await import("./readiness.server");
    return crystalProdReadiness(data.probe);
  });

/** Read-only supplier booking history for a reservation the caller owns. */
export const getCrystalBookingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { crystalBookingHistory } = await import("./booking.server");
    const result = await crystalBookingHistory(context.supabase, data.bookingId);
    // Serialised as JSON text: the supplier payload shape is supplier-defined.
    return {
      supplierSynced: result.supplierSynced,
      history: result.history ? JSON.stringify(result.history) : null,
    };
  });
