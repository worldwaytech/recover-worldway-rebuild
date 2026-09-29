import { persistOutcomes } from "@/lib/engine/suppliers/health-store.server";
import { registrationFor } from "@/lib/engine/suppliers/catalog.server";
// Flight adapters for the engine orchestrator. Each wraps an EXISTING supplier
// client unchanged and normalises to a Worldway-branded offer shape.
import { createHash } from "crypto";
import type { EngineAdapter } from "@/lib/engine/orchestrator";
import { orchestrate } from "@/lib/engine/orchestrator";
import { up17Configured, up17SearchFlights, up17ServerIp, searchAirports } from "@/lib/up17/up17.server";
import { airiqConfig, airiqSearch, customerTotal, fareTotal, type AirIqFare } from "@/lib/airiq/client.server";

export type FlightQuery = {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string;
  passengers: number;
  cabin: "economy" | "premium_economy" | "business" | "first";
};

/** Server-only offer → supplier map (never serialised into responses). */
const OFFER_SUPPLIER = new Map<string, string>();
function tagSupplier(key: string, id: string) {
  if (OFFER_SUPPLIER.size > 20_000) OFFER_SUPPLIER.clear();
  OFFER_SUPPLIER.set(id, key);
  return id;
}
export function flightOfferSupplier(offerId: string): string | null {
  return OFFER_SUPPLIER.get(offerId) ?? null;
}

/**
 * Server-only revalidation handle per offer: what the supplier needs to
 * re-confirm the fare, plus the supplier NET (before Worldway markup).
 * Never serialised into responses.
 */
export type FlightOfferHandle =
  | { supplier: "up17"; resultIndex: string; searchTokenId: string | null; query: FlightQuery; net: number; currency: string }
  | { supplier: "airiq"; ticketId: string; query: FlightQuery; net: number; currency: string };
const OFFER_HANDLE = new Map<string, FlightOfferHandle>();
function tagHandle(id: string, h: FlightOfferHandle) {
  if (OFFER_HANDLE.size > 20_000) OFFER_HANDLE.clear();
  OFFER_HANDLE.set(id, h);
  return id;
}
export function flightOfferHandle(offerId: string): FlightOfferHandle | null {
  return OFFER_HANDLE.get(offerId) ?? null;
}

export type WorldwayFlightOffer = {
  offer_id: string;
  airline: string;
  flight_numbers: string[];
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  stops: number;
  duration_min: number | null;
  cabin: string;
  refundable: boolean | null;
  seats_available: number | null;
  total_price: number;
  currency: string;
  trip: "one_way" | "round_trip";
};

const up17Adapter: EngineAdapter<FlightQuery, WorldwayFlightOffer> = {
  registration: registrationFor("up17"),
  health: async () => ({ configured: up17Configured(), healthy: up17Configured(), detail: up17Configured() ? undefined : "not configured" }),
  run: async (q) => {
    const res = await up17SearchFlights({
      origin: q.origin,
      destination: q.destination,
      depart_date: q.depart_date,
      return_date: q.return_date,
      passengers: q.passengers,
      cabin: q.cabin,
      trip_type: q.return_date ? "round_trip" : "one_way",
      user_ip: await up17ServerIp(),
    });
    if (!res.ok) throw new Error(res.error ?? `search failed (${res.status})`);
    const token = res.data?.searchTokenId ?? null;
    return (res.data?.offers ?? [])
      .filter((o) => (o.fare.published ?? o.fare.total) != null)
      .map((o) => ({
        offer_id: tagHandle(tagSupplier("up17", worldwayOfferId(`a:${token ?? `${q.origin}${q.destination}${q.depart_date}`}:${o.resultIndex}`)), {
          supplier: "up17", resultIndex: o.resultIndex, searchTokenId: token, query: q,
          net: Number(o.fare.published ?? o.fare.total), currency: o.fare.currency || "INR",
        }),
        airline: o.airline,
        flight_numbers: o.flightNumbers,
        origin: o.origin,
        destination: o.destination,
        departure: o.departure,
        arrival: o.arrival,
        stops: o.stops,
        duration_min: o.durationMin,
        cabin: o.cabinClass || q.cabin,
        refundable: o.refundable,
        seats_available: o.seatsAvailable,
        total_price: Number(o.fare.published ?? o.fare.total),
        currency: o.fare.currency || "INR",
        trip: q.return_date ? "round_trip" : "one_way",
      }));
  },
};

const airiqAdapter: EngineAdapter<FlightQuery, WorldwayFlightOffer> = {
  // Series fares: one-way economy only.
  registration: registrationFor("airiq"),
  health: async () => {
    const c = airiqConfig();
    return { configured: c.configured, healthy: c.configured, detail: c.configured ? undefined : "not configured" };
  },
  run: async (q) => {
    if (q.return_date || q.cabin !== "economy") return [];
    const pax = { adult: q.passengers, child: 0, infant: 0 };
    const fares: AirIqFare[] = await airiqSearch({ origin: q.origin, destination: q.destination, date: q.depart_date, ...pax });
    return fares
      .filter((f) => f.seats >= q.passengers)
      .map((f) => ({
        offer_id: tagHandle(tagSupplier("airiq", worldwayOfferId(`b:${f.ticketId}`)), {
          supplier: "airiq", ticketId: f.ticketId, query: q, net: fareTotal(f, pax), currency: "INR",
        }),
        airline: f.airline,
        flight_numbers: [f.flightNumber],
        origin: f.origin,
        destination: f.destination,
        departure: `${f.departureDate} ${f.departureTime}`.trim(),
        arrival: `${f.arrivalDate} ${f.arrivalTime}`.trim(),
        stops: 0,
        duration_min: null,
        cabin: "economy",
        refundable: false,
        seats_available: f.seats,
        total_price: customerTotal(f, pax),
        currency: "INR",
        trip: "one_way",
      }));
  },
};

/** Opaque Worldway offer reference — reveals no supplier or routing. */
function worldwayOfferId(internal: string) {
  return `WWF-${createHash("sha256").update(internal).digest("hex").slice(0, 16).toUpperCase()}`;
}

/** Amadeus: interface-ready, inactive. Registered as disabled so it is never selected. */
const amadeusAdapter: EngineAdapter<FlightQuery, WorldwayFlightOffer> = {
  registration: registrationFor("amadeus"),
  health: async () => ({ configured: false, healthy: false, detail: "NOT_CONFIGURED" }),
  run: async () => [],
};

export const FLIGHT_ADAPTERS = [up17Adapter, airiqAdapter, amadeusAdapter];

function resolveIata(value: string): string {
  const raw = value.trim();
  if (/^[a-z]{3}$/i.test(raw)) return raw.toUpperCase();
  return (searchAirports(raw, 1)[0]?.iata ?? raw).toUpperCase();
}

export async function searchFlightsViaEngine(input: FlightQuery) {
  const q = { ...input, origin: resolveIata(input.origin), destination: resolveIata(input.destination) };
  const { results, outcomes } = await orchestrate(FLIGHT_ADAPTERS, "flight", "search", q);
  // Server-side routing trace (supplier keys stay out of the tool response).
  console.info("[search_flights] routing", JSON.stringify(outcomes));
  await persistOutcomes("search", outcomes);
  results.sort((a, b) => a.total_price - b.total_price);
  const offers = results.slice(0, 25);
  const anyAttempted = outcomes.some((o) => o.status !== "skipped");
  const allFailed = anyAttempted && outcomes.every((o) => o.status === "failed" || o.status === "skipped");
  return {
    ok: offers.length > 0 || !allFailed,
    query: q,
    count: offers.length,
    total_found: results.length,
    offers,
    ...(allFailed ? { error: "Live flight inventory is temporarily unavailable. Please retry shortly." } : {}),
    outcomes,
  };
}
