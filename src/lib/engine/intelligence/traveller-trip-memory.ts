// Worldway Traveller + Trip Memory foundation.
// Post-Phase-16 Upgrade 3: a unified, consent-aware context envelope.
// Persistence remains in the existing Phase-13 travel_dna/travel_memory stores.
// This layer is deterministic and contains no booking/payment authority.
// Current requests remain authoritative over remembered trip facts.

import type { PersonalizationContext, TravelerProfile } from "./traveler-profile";

export type MemoryPrecedence = "current_request_over_memory";

export interface TripMemoryFact {
  key: string;
  value: string | number | boolean | null;
  confidence: number;
  source: "user" | "booking" | "interaction" | "system_inference";
  observedAt: string;
}

export interface TripMemory {
  tripId: string;
  status: "planning" | "booked" | "completed" | "cancelled";
  origin?: string;
  destinations: string[];
  arrivalDate?: string;
  departureDate?: string;
  facts: TripMemoryFact[];
  updatedAt: string;
}

export interface TravellerMemoryRecord {
  id: string;
  kind: "explicit" | "behavioral" | "journey" | "inferred" | "session";
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  source: "user" | "booking" | "interaction" | "system_inference";
  sourceRef: string | null;
  expiresAt: string | null;
  consentScope: "preferences" | "history";
}

export interface TravellerTripContext {
  travellerId: string;
  consent: { preferences: boolean; history: boolean };
  profile: TravelerProfile;
  personalization: PersonalizationContext;
  memories: readonly TravellerMemoryRecord[];
  activeTrip?: TripMemory;
  precedence: MemoryPrecedence;
  generatedAt: string;
}

export interface CurrentTripRequest {
  tripId?: string;
  origin?: string;
  destinations?: string[];
  arrivalDate?: string;
  departureDate?: string;
  facts?: Record<string, string | number | boolean | null>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string | undefined, field: string): void {
  if (value !== undefined && !DATE.test(value)) throw new Error(`invalid_trip_${field}`);
}

function normalizeDestinations(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 50);
}

function normalizeConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function normalizeTripMemory(input: TripMemory): TripMemory {
  assertDate(input.arrivalDate, "arrival_date");
  assertDate(input.departureDate, "departure_date");
  if (input.arrivalDate && input.departureDate && input.departureDate < input.arrivalDate) {
    throw new Error("trip_departure_before_arrival");
  }
  if (!input.tripId.trim()) throw new Error("trip_id_required");

  return {
    ...input,
    tripId: input.tripId.trim().slice(0, 120),
    origin: input.origin?.trim() || undefined,
    destinations: normalizeDestinations(input.destinations),
    facts: input.facts
      .filter((fact) => fact.key.trim())
      .map((fact) => ({
        ...fact,
        key: fact.key.trim().slice(0, 120),
        confidence: normalizeConfidence(fact.confidence),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function applyCurrentTripRequest(
  context: TravellerTripContext,
  request: CurrentTripRequest,
): TravellerTripContext {
  const current = context.activeTrip;
  const tripId = request.tripId ?? current?.tripId;
  if (!tripId) return context;

  const mergedFacts = new Map<string, TripMemoryFact>(
    (current?.facts ?? []).map((fact) => [fact.key, fact]),
  );

  for (const [key, value] of Object.entries(request.facts ?? {})) {
    mergedFacts.set(key, {
      key,
      value,
      confidence: 1,
      source: "user",
      observedAt: new Date().toISOString(),
    });
  }

  return {
    ...context,
    activeTrip: normalizeTripMemory({
      tripId,
      status: current?.status ?? "planning",
      origin: request.origin ?? current?.origin,
      destinations: request.destinations ?? current?.destinations ?? [],
      arrivalDate: request.arrivalDate ?? current?.arrivalDate,
      departureDate: request.departureDate ?? current?.departureDate,
      facts: [...mergedFacts.values()],
      updatedAt: new Date().toISOString(),
    }),
    precedence: "current_request_over_memory",
  };
}

export function buildTravellerTripContext(input: {
  travellerId: string;
  consent: { preferences: boolean; history: boolean };
  profile: TravelerProfile;
  personalization: PersonalizationContext;
  memories: readonly TravellerMemoryRecord[];
  activeTrip?: TripMemory;
}): TravellerTripContext {
  return {
    travellerId: input.travellerId,
    consent: { ...input.consent },
    profile: input.profile,
    personalization: input.personalization,
    memories: input.memories.filter((memory) => input.consent[memory.consentScope] === true),
    activeTrip: input.activeTrip ? normalizeTripMemory(input.activeTrip) : undefined,
    precedence: "current_request_over_memory",
    generatedAt: new Date().toISOString(),
  };
}

export function rememberTripFact(trip: TripMemory, fact: TripMemoryFact): TripMemory {
  return normalizeTripMemory({
    ...trip,
    facts: [...trip.facts.filter((existing) => existing.key !== fact.key), fact],
    updatedAt: new Date().toISOString(),
  });
}
