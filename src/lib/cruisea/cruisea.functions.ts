import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CruiseaFilters } from "./types";

const filtersSchema = z.object({
  query: z.string().max(120).optional(),
  cruiseType: z.string().max(30).optional(),
  region: z.string().max(60).optional(),
  country: z.string().max(60).optional(),
  company: z.string().max(80).optional(),
  ship: z.string().max(80).optional(),
  duration: z.string().max(10).optional(),
  departureDate: z.string().max(10).optional(),
  departureMonth: z.string().max(7).optional(),
  embarkationPort: z.string().max(80).optional(),
  cabinCategory: z.string().max(20).optional(),
  areaTag: z.string().max(80).optional(),
  packageOptions: z.array(z.string().max(40)).max(10).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  guests: z.number().int().min(1).max(8).optional(),
  sort: z.enum(["departure", "price-asc", "price-desc", "duration"]).optional(),
  page: z.number().int().min(1).max(200).optional(),
  pageSize: z.number().int().min(1).max(48).optional(),
});

export const searchCruisea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { searchCruiseaSailings } = await import("./catalogue.server");
    return searchCruiseaSailings(data as CruiseaFilters);
  });

export const getCruiseaFacetsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCruiseaFacets } = await import("./catalogue.server");
  return getCruiseaFacets();
});

export const getCruiseaSailingFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getCruiseaSailing } = await import("./catalogue.server");
    return getCruiseaSailing(data.id);
  });

export const revalidateCruiseaCabinFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sailingId: z.string().uuid(),
        cabinId: z.string().uuid(),
        guests: z.number().int().min(1).max(8),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { revalidateCruiseaCabin } = await import("./catalogue.server");
    return revalidateCruiseaCabin(data);
  });

const bookingSchema = z.object({
  sailingId: z.string().uuid(),
  cabinId: z.string().uuid(),
  guests: z.number().int().min(1).max(8),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(160),
  contactPhone: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  passengers: z
    .array(
      z.object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
        dateOfBirth: z.string().max(10).optional(),
      }),
    )
    .max(8)
    .optional(),
});

export const createCruiseaBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bookingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { createCruiseaBooking } = await import("./booking.server");
    return createCruiseaBooking(context as never, data);
  });

export const confirmCruiseaBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { confirmCruiseaBooking } = await import("./booking.server");
    return confirmCruiseaBooking(context as never, data.bookingId);
  });

export const cancelCruiseaBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { cancelCruiseaBooking } = await import("./booking.server");
    return cancelCruiseaBooking(context as never, data.bookingId);
  });

export const listCruiseaBookingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCruiseaBookings } = await import("./booking.server");
    return listCruiseaBookings(context as never);
  });

export const getCruiseaBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getCruiseaBooking } = await import("./booking.server");
    return getCruiseaBooking(context as never, data.bookingId);
  });

export const addCruiseaPassengerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bookingId: z.string().uuid(),
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
        dateOfBirth: z.string().max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { addCruiseaPassenger } = await import("./booking.server");
    return addCruiseaPassenger(context as never, data);
  });

export const listCruiseaSavedSearchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCruiseaSavedSearches } = await import("./booking.server");
    return listCruiseaSavedSearches(context as never);
  });

export const saveCruiseaSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(80), filters: filtersSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveCruiseaSearch } = await import("./booking.server");
    return saveCruiseaSearch(context as never, {
      name: data.name,
      filters: data.filters as CruiseaFilters,
    });
  });

export const deleteCruiseaSavedSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteCruiseaSavedSearch } = await import("./booking.server");
    return deleteCruiseaSavedSearch(context as never, data.id);
  });
