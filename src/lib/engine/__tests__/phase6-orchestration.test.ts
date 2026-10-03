import { describe, expect, it } from "vitest";
import { buildItinerary, checkTripRequirements, createTripRequirementProfile, detectOrchestrationConflicts } from "../orchestration";
import { toComponent } from "../normalize";
import type { CanonicalOffer } from "../normalize";
import type { TripRequirements } from "../types";

const req: TripRequirements = {
  origin: "DEL",
  destinations: ["IST", "ATH"],
  departFrom: "2026-10-10",
  returnBy: "2026-10-20",
  adults: 2,
  children: 0,
  luxuryLevel: 5,
  interests: [],
};

const offer = (
  kind: CanonicalOffer["kind"],
  id: string,
  start: string,
  end: string,
  from: string,
  to: string,
): CanonicalOffer => ({
  supplierKey: "test",
  kind,
  externalId: id,
  title: id,
  refundable: true,
  revalidatedAt: "2026-10-09T00:00:00Z",
  start: { at: start, timezone: "Europe/Istanbul", place: from },
  end: { at: end, timezone: "Europe/Istanbul", place: to },
  net: { amount: 100, currency: "EUR" },
});

describe("Phase 6 intelligent orchestration", () => {
  it("requires explicitly requested products without inventing them", () => {
    const profile = createTripRequirementProfile(req, { requiredKinds: ["flight", "stay", "insurance"], insurance: "required" });
    const items = [toComponent(offer("flight", "F", "2026-10-10T08:00:00Z", "2026-10-10T12:00:00Z", "DEL", "IST"))];
    const result = checkTripRequirements(items, profile);

    expect(result.satisfied).toBe(false);
    expect(result.missing.map((x) => x.kind)).toEqual(["stay", "insurance"]);
  });

  it("detects overlapping duplicate hotels and activities outside a stay", () => {
    const items = [
      toComponent(offer("stay", "H1", "2026-10-10T14:00:00Z", "2026-10-15T10:00:00Z", "IST", "IST")),
      toComponent(offer("stay", "H2", "2026-10-12T14:00:00Z", "2026-10-16T10:00:00Z", "IST", "IST")),
      toComponent(offer("activity", "A", "2026-10-16T12:00:00Z", "2026-10-16T14:00:00Z", "IST", "IST")),
    ];
    const conflicts = detectOrchestrationConflicts(items, createTripRequirementProfile(req));

    expect(conflicts.some((x) => x.code === "duplicate-stay" && x.severity === "error")).toBe(true);
    expect(conflicts.some((x) => x.code === "activity-outside-stay")).toBe(true);
  });

  it("builds a chronological customer itinerary from actual component timestamps", () => {
    const items = [
      toComponent(offer("flight", "F", "2026-10-10T20:00:00Z", "2026-10-11T03:00:00Z", "DEL", "IST")),
      toComponent(offer("stay", "H", "2026-10-11T14:00:00Z", "2026-10-13T10:00:00Z", "IST", "IST")),
      toComponent(offer("activity", "A", "2026-10-12T09:00:00Z", "2026-10-12T12:00:00Z", "IST", "IST")),
    ];
    const itinerary = buildItinerary(items);

    expect(itinerary.map((d) => d.localDate)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
    expect(itinerary[2]!.entries.map((x) => x.kind)).toEqual(["activity"]);
  });
});
