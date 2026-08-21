import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cancelInputSchema,
  confirmInputSchema,
  holdInputSchema,
} from "./booking-contract";

/** Public, credential-free view of whether Crystal supplier booking is armed. */
export const getCrystalBookingCapability = createServerFn({ method: "GET" }).handler(async () => {
  const { bookingCapability } = await import("./aktg-booking.server");
  return bookingCapability();
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
    const { confirmCrystalBooking } = await import("./booking.server");
    return confirmCrystalBooking(context.supabase, data.bookingId, data.idempotencyKey);
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
    const { bookingCapability, bookingOperationCatalog, crystalBookingAudit } = await import(
      "./aktg-booking.server"
    );
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
