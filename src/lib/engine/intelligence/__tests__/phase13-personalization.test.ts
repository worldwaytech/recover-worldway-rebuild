import { describe, expect, it } from "vitest";
import {
  applyPersonalizationDefaults,
  buildPersonalizationContext,
  normalizeTravelerProfile,
  personalizeRankingFactors,
  permittedTravelerProfile,
} from "../traveler-profile";

const factors = [
  { factor: "Itinerary feasibility", weight: 0.4, value: 1 },
  { factor: "Customer preference fit", weight: 0.1, value: 1 },
  { factor: "Price", weight: 0.2, value: 1 },
  { factor: "Quality / luxury fit", weight: 0.3, value: 1 },
];

describe("Worldway Phase 13 personalization", () => {
  it("normalizes and deduplicates structured traveler preferences", () => {
    const p = normalizeTravelerProfile({
      favoriteDestinations: [" Istanbul ", "Istanbul"],
      preferredAirlines: ["Carrier A"],
      dietaryPreferences: ["vegetarian"],
      companions: [{ relation: "family", count: 3 }],
    });
    expect(p.favoriteDestinations).toEqual(["Istanbul"]);
    expect(p.companions[0]).toEqual({ relation: "family", count: 3 });
  });

  it("removes preference data when preference consent is absent", () => {
    const p = permittedTravelerProfile(
      normalizeTravelerProfile({
        favoriteDestinations: ["Istanbul"],
        budgetPattern: { typicalMax: 5000, currency: "EUR" },
      }),
      { preferences: false, history: true },
    );
    expect(p.favoriteDestinations).toEqual([]);
    expect(p.budgetPattern).toBeUndefined();
  });

  it("keeps only consented memory signals", () => {
    const c = buildPersonalizationContext(
      normalizeTravelerProfile({ preferredAirlines: ["Carrier A"] }),
      { preferences: true, history: false },
      [
        {
          key: "past_airline",
          value: { value: "Carrier B" },
          confidence: 0.8,
          consent_scope: "history",
          memory_kind: "journey",
        },
        {
          key: "pace",
          value: { value: "relaxed" },
          confidence: 1,
          consent_scope: "preferences",
          memory_kind: "explicit",
        },
      ],
    );
    expect(c.signals.some(s => s.key === "past_airline")).toBe(false);
    expect(c.signals.some(s => s.key === "pace")).toBe(true);
  });

  it("never overwrites explicit current-request values", () => {
    const c = buildPersonalizationContext(
      normalizeTravelerProfile({
        favoriteDestinations: ["Istanbul"],
        preferredAirlines: ["Carrier A"],
      }),
      { preferences: true, history: true },
      [],
    );
    const out = applyPersonalizationDefaults(
      { destination: "Paris", airline: "Carrier B" } as Record<string, unknown>,
      c,
    );
    expect(out.destination).toBe("Paris");
    expect(out.airline).toBe("Carrier B");
  });

  it("does not inject a single preferred destination when there are multiple favorites", () => {
    const c = buildPersonalizationContext(
      normalizeTravelerProfile({ favoriteDestinations: ["Istanbul", "Tokyo"] }),
      { preferences: true, history: true },
      [],
    );
    const out = applyPersonalizationDefaults({} as Record<string, unknown>, c);
    expect(out.destination).toBeUndefined();
  });

  it("keeps feasibility dominant after personalization", () => {
    const c = buildPersonalizationContext(
      normalizeTravelerProfile({
        preferredHotels: ["Hotel A"],
        activityPreferences: ["museum"],
      }),
      { preferences: true, history: true },
      [],
    );
    const out = personalizeRankingFactors(factors, c);
    expect(out.find(f => f.factor === "Itinerary feasibility")!.weight).toBeGreaterThanOrEqual(0.3);
    expect(Math.abs(out.reduce((s, f) => s + f.weight, 0) - 1)).toBeLessThan(0.000001);
  });
});
