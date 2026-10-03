import { z } from "zod";
import type { ScoreFactor } from "../ranking";

export const TravelerProfile = z.object({
  favoriteDestinations: z.array(z.string().min(1).max(120)).max(100).default([]),
  preferredAirlines: z.array(z.string().min(1).max(120)).max(100).default([]),
  preferredHotels: z.array(z.string().min(1).max(160)).max(100).default([]),
  dietaryPreferences: z.array(z.string().min(1).max(120)).max(50).default([]),
  roomPreferences: z.array(z.string().min(1).max(120)).max(50).default([]),
  activityPreferences: z.array(z.string().min(1).max(120)).max(100).default([]),
  budgetPattern: z.object({
    currency: z.string().length(3).optional(),
    typicalMin: z.number().finite().nonnegative().optional(),
    typicalMax: z.number().finite().nonnegative().optional(),
  }).optional(),
  companions: z.array(z.object({
    relation: z.string().min(1).max(80),
    count: z.number().int().min(1).max(20).default(1),
  })).max(30).default([]),
  importantTravelDates: z.array(z.object({
    label: z.string().min(1).max(100),
    monthDay: z.string().regex(/^\d{2}-\d{2}$/),
  })).max(30).default([]),
  loyaltyPrograms: z.array(z.object({
    program: z.string().min(1).max(120),
    tier: z.string().max(80).optional(),
  })).max(50).default([]),
});

export type TravelerProfile = z.infer<typeof TravelerProfile>;
export const EMPTY_TRAVELER_PROFILE: TravelerProfile = TravelerProfile.parse({});

const normalizeList = (values: string[]) =>
  [...new Set(values.map(v => v.trim()).filter(Boolean))].slice(0, 100);

export function normalizeTravelerProfile(input: unknown): TravelerProfile {
  const p = TravelerProfile.parse(input ?? {});
  return {
    ...p,
    favoriteDestinations: normalizeList(p.favoriteDestinations),
    preferredAirlines: normalizeList(p.preferredAirlines),
    preferredHotels: normalizeList(p.preferredHotels),
    dietaryPreferences: normalizeList(p.dietaryPreferences),
    roomPreferences: normalizeList(p.roomPreferences),
    activityPreferences: normalizeList(p.activityPreferences),
    companions: p.companions.map(c => ({ relation: c.relation.trim(), count: c.count })),
    importantTravelDates: p.importantTravelDates.map(d => ({ label: d.label.trim(), monthDay: d.monthDay })),
    loyaltyPrograms: p.loyaltyPrograms.map(l => ({ program: l.program.trim(), tier: l.tier?.trim() || undefined })),
  };
}

export interface PersonalizationSignal {
  key: string;
  value: string | number | boolean;
  confidence: number;
  source: "explicit" | "history" | "behavioral";
}

export interface PersonalizationContext {
  profile: TravelerProfile;
  signals: PersonalizationSignal[];
  consent: { preferences: boolean; history: boolean };
}

export function permittedTravelerProfile(
  profile: TravelerProfile,
  consent: { preferences: boolean; history: boolean },
): TravelerProfile {
  if (!consent.preferences) {
    return { ...EMPTY_TRAVELER_PROFILE, budgetPattern: undefined };
  }
  return normalizeTravelerProfile(profile);
}

export function buildPersonalizationContext(
  profile: TravelerProfile,
  consent: { preferences: boolean; history: boolean },
  memories: Array<{
    key: string;
    value: Record<string, unknown>;
    confidence?: number;
    consent_scope: "preferences" | "history";
    memory_kind: string;
  }>,
): PersonalizationContext {
  const permitted = permittedTravelerProfile(profile, consent);
  const signals: PersonalizationSignal[] = [];

  for (const memory of memories) {
    if (!consent[memory.consent_scope]) continue;
    const raw = memory.value.value;
    if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") continue;
    signals.push({
      key: memory.key,
      value: raw,
      confidence: Math.max(0, Math.min(1, Number(memory.confidence ?? 1))),
      source:
        memory.consent_scope === "history"
          ? "history"
          : memory.memory_kind === "behavioral"
            ? "behavioral"
            : "explicit",
    });
  }

  for (const destination of permitted.favoriteDestinations)
    signals.push({ key: "favorite_destination", value: destination, confidence: 1, source: "explicit" });
  for (const airline of permitted.preferredAirlines)
    signals.push({ key: "preferred_airline", value: airline, confidence: 1, source: "explicit" });
  for (const hotel of permitted.preferredHotels)
    signals.push({ key: "preferred_hotel", value: hotel, confidence: 1, source: "explicit" });
  for (const dietary of permitted.dietaryPreferences)
    signals.push({ key: "dietary_preference", value: dietary, confidence: 1, source: "explicit" });
  for (const room of permitted.roomPreferences)
    signals.push({ key: "room_preference", value: room, confidence: 1, source: "explicit" });
  for (const activity of permitted.activityPreferences)
    signals.push({ key: "activity_preference", value: activity, confidence: 1, source: "explicit" });
  for (const companion of permitted.companions)
    signals.push({ key: "companion_pattern", value: companion.relation + ":" + companion.count, confidence: 1, source: "explicit" });
  for (const loyalty of permitted.loyaltyPrograms)
    signals.push({ key: "loyalty_program", value: loyalty.program, confidence: 1, source: "explicit" });
  for (const date of permitted.importantTravelDates)
    signals.push({ key: "important_travel_date", value: date.label + ":" + date.monthDay, confidence: 1, source: "explicit" });
  if (permitted.budgetPattern?.typicalMax != null)
    signals.push({ key: "budget_pattern_max", value: permitted.budgetPattern.typicalMax, confidence: 1, source: "explicit" });

  return { profile: permitted, signals, consent };
}

export function applyPersonalizationDefaults<T extends Record<string, unknown>>(
  request: T,
  context: PersonalizationContext,
): T {
  const out: Record<string, unknown> = { ...request };
  const p = context.profile;

  if (out.destination == null && p.favoriteDestinations.length === 1) out.destination = p.favoriteDestinations[0];
  if (out.airline == null && p.preferredAirlines.length === 1) out.airline = p.preferredAirlines[0];
  if (out.hotel == null && p.preferredHotels.length === 1) out.hotel = p.preferredHotels[0];
  if (out.dietaryPreference == null && p.dietaryPreferences.length === 1) out.dietaryPreference = p.dietaryPreferences[0];
  if (out.roomPreference == null && p.roomPreferences.length === 1) out.roomPreference = p.roomPreferences[0];
  if (out.activityPreferences == null && p.activityPreferences.length)
    out.activityPreferences = [...p.activityPreferences];
  if (out.budget == null && p.budgetPattern?.typicalMax != null)
    out.budget = { amount: p.budgetPattern.typicalMax, currency: p.budgetPattern.currency };

  return out as T;
}

export function personalizeRankingFactors(
  factors: ScoreFactor[],
  context: PersonalizationContext,
): ScoreFactor[] {
  if (!context.consent.preferences && !context.consent.history) return factors.map(f => ({ ...f }));

  const preferenceStrength = context.signals.length
    ? Math.min(0.25, 0.05 + context.signals.length * 0.01)
    : 0;
  const adjusted = factors.map(f =>
    f.factor === "Customer preference fit"
      ? { ...f, weight: f.weight + preferenceStrength }
      : { ...f },
  );

  const feasibility = adjusted.find(f => f.factor === "Itinerary feasibility");
  const others = adjusted.filter(f => f !== feasibility);
  const sum = others.reduce((s, f) => s + f.weight, 0) || 1;
  const feasibilityWeight = feasibility ? Math.max(feasibility.weight, 0.3) : 0;

  return adjusted.map(f =>
    f === feasibility
      ? { ...f, weight: feasibilityWeight }
      : { ...f, weight: (f.weight / sum) * (1 - feasibilityWeight) },
  );
}
