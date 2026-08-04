import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { Up17City } from "./cities.data.server";

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
      hotels: res.data?.hotels ?? [],
      count: res.data?.count ?? 0,
    };
  });

export const up17CityLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().trim().max(80),
        limit: z.number().int().min(1).max(25).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { up17CityAutocomplete } = await import("./up17.server");
    return up17CityAutocomplete(data.query, data.limit ?? 12);
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
