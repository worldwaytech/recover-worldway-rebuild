import { describe, expect, it } from "vitest";
import { buildTravellerTripContext, applyCurrentTripRequest, normalizeTripMemory, rememberTripFact } from "../traveller-trip-memory";
import { buildPersonalizationContext, EMPTY_TRAVELER_PROFILE } from "../traveler-profile";

const personalization = buildPersonalizationContext(EMPTY_TRAVELER_PROFILE, { preferences: true, history: true }, []);

describe("Traveller + Trip Memory foundation", () => {
  it("builds a consent-aware unified traveller/trip envelope", () => {
    const context = buildTravellerTripContext({
      travellerId: "traveller-1",
      consent: { preferences: true, history: true },
      profile: EMPTY_TRAVELER_PROFILE,
      personalization,
      memories: [{
        id: "m1", kind: "journey", key: "trip:1:pace", value: { value: "relaxed" },
        confidence: 0.9, source: "booking", sourceRef: "trip-1", expiresAt: null, consentScope: "history",
      }],
      activeTrip: {
        tripId: "trip-1", status: "planning", origin: "DEL", destinations: ["IST"],
        arrivalDate: "2026-10-20", departureDate: "2026-10-28", facts: [], updatedAt: "2026-10-03T00:00:00.000Z",
      },
    });
    expect(context.memories).toHaveLength(1);
    expect(context.activeTrip?.tripId).toBe("trip-1");
    expect(context.precedence).toBe("current_request_over_memory");
  });

  it("does not expose memories when the matching consent scope is disabled", () => {
    const context = buildTravellerTripContext({
      travellerId: "traveller-1",
      consent: { preferences: true, history: false },
      profile: EMPTY_TRAVELER_PROFILE,
      personalization,
      memories: [{
        id: "m1", kind: "journey", key: "trip:1:pace", value: { value: "relaxed" },
        confidence: 0.9, source: "booking", sourceRef: "trip-1", expiresAt: null, consentScope: "history",
      }],
    });
    expect(context.memories).toHaveLength(0);
  });

  it("makes the current request authoritative over trip memory", () => {
    const base = buildTravellerTripContext({
      travellerId: "traveller-1",
      consent: { preferences: true, history: true },
      profile: EMPTY_TRAVELER_PROFILE,
      personalization,
      memories: [],
      activeTrip: {
        tripId: "trip-1", status: "planning", origin: "DEL", destinations: ["IST"],
        arrivalDate: "2026-10-20", departureDate: "2026-10-28",
        facts: [{ key: "pace", value: "slow", confidence: 0.7, source: "system_inference", observedAt: "2026-10-02T00:00:00.000Z" }],
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
    });
    const next = applyCurrentTripRequest(base, {
      tripId: "trip-1", destinations: ["IST", "DXB"], facts: { pace: "fast" },
    });
    expect(next.activeTrip?.destinations).toEqual(["IST", "DXB"]);
    expect(next.activeTrip?.facts.find((fact) => fact.key === "pace")?.value).toBe("fast");
    expect(next.activeTrip?.facts.find((fact) => fact.key === "pace")?.confidence).toBe(1);
  });

  it("rejects impossible trip dates and normalizes facts", () => {
    expect(() => normalizeTripMemory({
      tripId: "trip-1", status: "planning", destinations: [],
      arrivalDate: "2026-10-28", departureDate: "2026-10-20", facts: [], updatedAt: new Date().toISOString(),
    })).toThrow("trip_departure_before_arrival");

    const trip = normalizeTripMemory({
      tripId: " trip-1 ", status: "planning", destinations: [" IST ", "IST "], facts: [{
        key: " confidence ", value: true, confidence: 4, source: "user", observedAt: "2026-10-03T00:00:00.000Z",
      }], updatedAt: new Date().toISOString(),
    });
    expect(trip.tripId).toBe("trip-1");
    expect(trip.destinations).toEqual(["IST"]);
    expect(trip.facts[0].confidence).toBe(1);
  });

  it("replaces a trip fact deterministically", () => {
    const trip = normalizeTripMemory({
      tripId: "trip-1", status: "planning", destinations: ["IST"], facts: [],
      updatedAt: new Date().toISOString(),
    });
    const updated = rememberTripFact(trip, {
      key: "pace", value: "relaxed", confidence: 0.8, source: "user", observedAt: "2026-10-03T00:00:00.000Z",
    });
    const replaced = rememberTripFact(updated, {
      key: "pace", value: "fast", confidence: 1, source: "user", observedAt: "2026-10-03T01:00:00.000Z",
    });
    expect(replaced.facts).toHaveLength(1);
    expect(replaced.facts[0].value).toBe("fast");
  });
});
