// Flight adapters for the engine orchestrator. Each wraps an EXISTING supplier
// client unchanged and normalises to a Worldway-branded offer shape.
import { createHash } from "crypto";
import type { EngineAdapter } from "@/lib/engine/orchestrator";
import { orchestrate } from "@/lib/engine/orchestrator";
import { up17Configured, up17SearchFlights, up17ServerIp, searchAirports } from "@/lib/up17/up17.server";
import { airiqConfig, airiqSearch, customerTotal, type AirIqFare } from "@/lib/airiq/client.server";

export type FlightQuery = {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string;
  passengers: number;
  cabin: "economy" | "premium_economy" | "business" | "first";
};

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
  registration: { supplierKey: "up17", kinds: ["flight"], capabilities: ["search", "revalidate", "book"], readiness: "production", reliability: 0.9 },
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
    return (res.data?.offers ?? [])
      .filter((o) => (o.fare.published ?? o.fare.total) != null)
      .map((o) => ({
        offer_id: worldwayOfferId(`a:${o.resultIndex}`),
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
  registration: { supplierKey: "airiq", kinds: ["flight"], capabilities: ["search", "revalidate", "book", "ticket"], readiness: "production", reliability: 0.8 },
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
        offer_id: worldwayOfferId(`b:${f.ticketId}`),
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

export const FLIGHT_ADAPTERS = [up17Adapter, airiqAdapter];

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
