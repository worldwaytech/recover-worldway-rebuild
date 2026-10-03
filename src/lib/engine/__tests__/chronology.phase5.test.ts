import { describe, expect, it } from "vitest";
import { buildChronologicalTripGraph, buildJourneySegments, checkTripWindow, chronologyIsValid, localDate, requiredCheckInDate } from "../chronology";
import type { NormalizedComponent } from "../types";

const base = {
  net: { amount: 100, currency: "USD" },
  taxes: { amount: 10, currency: "USD" },
  cancellation: { refundable: true },
};

const flight: NormalizedComponent = {
  ...base,
  id: "f1", kind: "flight", supplierKey: "air", externalId: "F1", title: "DEL-JFK",
  start: { at: "2026-09-28T16:30:00Z", timezone: "Asia/Kolkata", place: "DEL" },
  end: { at: "2026-09-29T09:00:00Z", timezone: "America/New_York", place: "JFK" },
};

const hotel: NormalizedComponent = {
  ...base,
  id: "h1", kind: "stay", supplierKey: "hotel", externalId: "H1", title: "New York Hotel",
  start: { at: "2026-09-29T19:00:00Z", timezone: "America/New_York", place: "NYC" },
  end: { at: "2026-10-02T15:00:00Z", timezone: "America/New_York", place: "NYC" },
};

describe("Phase 5 canonical chronological graph", () => {
  it("uses the actual destination arrival date", () => {
    expect(requiredCheckInDate(flight)).toBe("2026-09-29");
    expect(localDate(flight.end)).toBe("2026-09-29");
  });

  it("builds chronological nodes and temporal edges", () => {
    const graph = buildChronologicalTripGraph([hotel, flight]);
    expect(graph.nodes.map((n) => n.id)).toEqual(["f1", "h1"]);
    expect(graph.edges[0]).toEqual({ from: "f1", to: "h1", gapMinutes: 600 });
    expect(graph.destinationArrivalDate).toBe("2026-09-29");
    expect(graph.arrivalDatesByPlace).toEqual({ JFK: "2026-09-29" });
    expect(graph.issues).toEqual([]);
  });

  it("keeps hotel stays as containers while rejecting overlapping moving services", () => {
    const activity: NormalizedComponent = {
      ...base,
      id: "a1", kind: "activity", supplierKey: "activity", externalId: "A1", title: "City Tour",
      start: { at: "2026-10-01T10:00:00Z", timezone: "America/New_York", place: "NYC" },
      end: { at: "2026-10-01T13:00:00Z", timezone: "America/New_York", place: "NYC" },
    };
    const graph = buildChronologicalTripGraph([flight, hotel, activity]);
    expect(chronologyIsValid([flight, hotel, activity])).toBe(true);

    const overlapping: NormalizedComponent = {
      ...activity,
      id: "a2",
      start: { ...activity.start, at: "2026-10-01T11:00:00Z" },
      end: { ...activity.end, at: "2026-10-01T14:00:00Z" },
      title: "Overlapping Tour",
    };
    expect(chronologyIsValid([flight, hotel, activity, overlapping])).toBe(false);
  });

  it("preserves timezone semantics across a date boundary", () => {
    expect(localDate({
      at: "2026-10-01T23:30:00Z",
      timezone: "Asia/Tokyo",
      place: "TYO",
    })).toBe("2026-10-02");
  });
});

  it("matches each hotel to the transport arriving in that hotel city", () => {
    const secondArrival: NormalizedComponent = {
      ...flight,
      id: "f2",
      title: "JFK-CDG",
      start: { at: "2026-10-04T14:00:00Z", timezone: "America/New_York", place: "JFK" },
      end: { at: "2026-10-04T21:00:00Z", timezone: "Europe/Paris", place: "CDG" },
    };
    const parisHotel: NormalizedComponent = {
      ...hotel,
      id: "h2",
      start: { at: "2026-10-04T23:00:00Z", timezone: "Europe/Paris", place: "CDG" },
      end: { at: "2026-10-07T10:00:00Z", timezone: "Europe/Paris", place: "CDG" },
    };
    const issues = buildChronologicalTripGraph([flight, hotel, secondArrival, parisHotel]).issues;
    expect(issues.some((i) => i.code === "hotel-date-mismatch" && i.componentIds.includes("h2"))).toBe(false);
  });

  describe("trip window", () => {
    it("rejects transport that departs before the requested start", () => {
      const issues = checkTripWindow([flight], { departFrom: "2026-09-29", returnBy: "2026-10-05" });
      expect(issues.map((i) => i.code)).toContain("outside-trip-window");
    });

    it("rejects transport that arrives after the requested return date", () => {
      const late = { ...flight, id: "late", start: { ...flight.start, at: "2026-10-06T03:00:00Z" }, end: { ...flight.end, at: "2026-10-06T09:00:00Z" } };
      const issues = checkTripWindow([late], { departFrom: "2026-09-28", returnBy: "2026-10-05" });
      expect(issues.map((i) => i.code)).toContain("outside-trip-window");
    });
  });


describe("Phase 5 explicit multi-city and multi-modal sequencing", () => {
  it("creates deterministic segments across flight, transfer, rail and second-city arrival", () => {
    const transfer: NormalizedComponent = {
      ...base,
      id: "t1", kind: "transfer", supplierKey: "transfer", externalId: "T1", title: "JFK city transfer",
      start: { at: "2026-09-29T14:00:00Z", timezone: "America/New_York", place: "JFK" },
      end: { at: "2026-09-29T15:00:00Z", timezone: "America/New_York", place: "NYC" },
    };
    const rail: NormalizedComponent = {
      ...base,
      id: "r1", kind: "rail", supplierKey: "rail", externalId: "R1", title: "NYC-CDG rail connection",
      start: { at: "2026-10-04T08:00:00Z", timezone: "America/New_York", place: "NYC" },
      end: { at: "2026-10-04T18:00:00Z", timezone: "Europe/Paris", place: "CDG" },
    };
    const segments = buildJourneySegments([flight, transfer, hotel, rail]);
    expect(segments.map((s) => [s.fromPlace, s.toPlace, s.mode, s.continuity])).toEqual([
      ["JFK", "JFK", "transfer", "continuous"],
      ["JFK", "NYC", "rail", "location-discontinuity"],
    ]);
    expect(segments[0]?.gapMinutes).toBe(300);
    expect(segments[1]?.gapMinutes).toBe(2980);
  });

  it("marks a missing ground connection as transfer-required without inventing one", () => {
    const transfer = {
      ...hotel,
      id: "t2",
      kind: "transfer" as const,
      title: "Airport transfer",
      start: { at: "2026-09-29T14:00:00Z", timezone: "America/New_York", place: "JFK" },
      end: { at: "2026-09-29T15:00:00Z", timezone: "America/New_York", place: "NYC" },
    };
    const activity = {
      ...hotel,
      id: "a2",
      kind: "activity" as const,
      title: "NYC activity",
      start: { at: "2026-09-29T16:00:00Z", timezone: "America/New_York", place: "NYC" },
      end: { at: "2026-09-29T18:00:00Z", timezone: "America/New_York", place: "NYC" },
    };
    const segments = buildJourneySegments([flight, transfer, activity]);
    expect(segments[0]?.continuity).toBe("continuous");
    expect(segments[1]?.continuity).toBe("continuous");
  });
});
