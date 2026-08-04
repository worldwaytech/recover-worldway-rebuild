import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
            }),
          )
          .min(1)
          .max(8),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { createTourBooking } = await import("./tours.server");
    return createTourBooking(data);
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
