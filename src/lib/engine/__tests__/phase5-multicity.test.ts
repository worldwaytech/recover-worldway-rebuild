import { describe, expect, it } from "vitest";
import { combineMultiCity } from "../suppliers/assembly.server";
import { buildChronologicalTripGraph, buildJourneySegments } from "../chronology";
import type { CanonicalOffer } from "../normalize";
import type { NormalizedComponent, TripRequirements } from "../types";
import { toComponent } from "../normalize";

const req: TripRequirements = {
  origin: "LHR",
  destinations: ["CDG", "FCO", "ATH"],
  departFrom: "2026-10-10",
  returnBy: "2026-10-20",
  adults: 2,
  children: 0,
  luxuryLevel: 5,
  interests: [],
};

const offer = (
  supplierKey: string,
  kind: CanonicalOffer["kind"],
  externalId: string,
  start: string,
  end: string,
  from: string,
  to: string,
  amount = 1000,
): CanonicalOffer => ({
  supplierKey,
  kind,
  externalId,
  title: externalId,
  refundable: true,
  revalidatedAt: "2026-10-09T00:00:00Z",
  start: { at: start, timezone: "Europe/Paris", place: from },
  end: { at: end, timezone: "Europe/Paris", place: to },
  net: { amount, currency: "EUR" },
});

describe("Phase 5 multi-city intelligence", () => {
  it("builds a chronological multi-city chain from actual transport timestamps", () => {
    const outbound = offer("airiq", "flight", "OUT", "2026-10-10T08:00:00Z", "2026-10-10T10:00:00Z", "LHR", "CDG", 900);
    const parisRome = offer("airiq", "flight", "PAR-ROM", "2026-10-13T09:00:00Z", "2026-10-13T11:00:00Z", "CDG", "FCO", 400);
    const romeAthens = offer("airiq", "flight", "ROM-ATH", "2026-10-16T09:00:00Z", "2026-10-16T11:00:00Z", "FCO", "ATH", 400);
    const inbound = offer("airiq", "flight", "RETURN", "2026-10-20T10:00:00Z", "2026-10-20T12:30:00Z", "ATH", "LHR", 900);

    const parisStay = offer("ratehawk", "stay", "PAR-HOTEL", "2026-10-10T14:00:00Z", "2026-10-13T07:00:00Z", "CDG", "CDG", 700);
    const romeStay = offer("ratehawk", "stay", "ROM-HOTEL", "2026-10-13T14:00:00Z", "2026-10-16T07:00:00Z", "FCO", "FCO", 700);
    const athensStay = offer("ratehawk", "stay", "ATH-HOTEL", "2026-10-16T14:00:00Z", "2026-10-20T07:00:00Z", "ATH", "ATH", 900);

    const [proposal] = combineMultiCity(
      req,
      [{
        transports: [outbound, parisRome, romeAthens, inbound],
        stays: [parisStay, romeStay, athensStay],
      }],
      "EUR",
      [],
      { EUR: 1 },
    );

    expect(proposal).toBeDefined();
    expect(proposal!.result.graph.map((x) => x.kind)).toEqual([
      "flight", "stay", "flight", "stay", "flight", "stay", "flight",
    ]);
    expect(proposal!.result.issues.some((x) => x.code === "hotel-date-mismatch")).toBe(false);
    expect(proposal!.result.issues.some((x) => x.code === "outside-trip-window")).toBe(false);
    expect(proposal!.result.journeySegments.map((x) => x.fromPlace + ">" + x.toPlace)).toEqual([
      "LHR>CDG", "CDG>FCO", "FCO>ATH", "ATH>LHR",
    ]);
  });

  it("hard-gates a multi-city package when a city hotel uses the wrong local arrival date", () => {
    const outbound = offer("airiq", "flight", "OUT", "2026-10-10T22:30:00Z", "2026-10-11T06:30:00Z", "LHR", "CDG");
    const parisRome = offer("airiq", "flight", "PAR-ROM", "2026-10-13T09:00:00Z", "2026-10-13T11:00:00Z", "CDG", "FCO");
    const inbound = offer("airiq", "flight", "RETURN", "2026-10-16T10:00:00Z", "2026-10-16T12:30:00Z", "FCO", "LHR");
    const wrongStay = offer("ratehawk", "stay", "BAD-HOTEL", "2026-10-12T14:00:00Z", "2026-10-13T07:00:00Z", "CDG", "CDG");

    const [proposal] = combineMultiCity(
      { ...req, destinations: ["CDG"], returnBy: "2026-10-16" },
      [{ transports: [outbound, parisRome, inbound], stays: [wrongStay] }],
      "EUR",
      [],
      { EUR: 1 },
    );

    expect(proposal!.result.issues.some((x) => x.code === "hotel-date-mismatch" && x.severity === "error")).toBe(true);
    expect(proposal!.result.bookable).toBe(false);
    expect(proposal!.readiness.bookable).toBe(false);
  });

  it("models flight → airport transfer → hotel → rail → hotel → cruise → aviation → return without inventing time", () => {
    const raw: CanonicalOffer[] = [
      offer("airiq", "flight", "F", "2026-10-10T18:00:00Z", "2026-10-11T02:00:00Z", "BOM", "DXB-AIR"),
      offer("worldway", "transfer", "T1", "2026-10-11T03:00:00Z", "2026-10-11T04:00:00Z", "DXB-AIR", "DXB-CITY"),
      offer("ratehawk", "stay", "H1", "2026-10-11T05:00:00Z", "2026-10-13T06:00:00Z", "DXB-CITY", "DXB-CITY"),
      offer("rail", "rail", "R", "2026-10-13T08:00:00Z", "2026-10-13T11:00:00Z", "DXB-CITY", "AUH-CITY"),
      offer("ratehawk", "stay", "H2", "2026-10-13T12:00:00Z", "2026-10-14T08:00:00Z", "AUH-CITY", "AUH-CITY"),
      offer("crystal", "cruise", "C", "2026-10-14T12:00:00Z", "2026-10-17T08:00:00Z", "AUH-CITY", "MCT-PORT"),
      offer("worldway-jets", "aviation", "A", "2026-10-18T08:00:00Z", "2026-10-18T16:00:00Z", "MCT-PORT", "BOM"),
    ];

    const components: NormalizedComponent[] = raw.map(toComponent);
    const graph = buildChronologicalTripGraph(components);
    const segments = buildJourneySegments(components);

    expect(graph.issues.filter((x) => x.severity === "error")).toEqual([]);
    expect(graph.edges).toHaveLength(components.length - 1);
    expect(graph.arrivalDatesByPlace["DXB-AIR"]).toBe("2026-10-11");
    expect(graph.arrivalDatesByPlace["AUH-CITY"]).toBe("2026-10-13");
    expect(graph.arrivalDatesByPlace["MCT-PORT"]).toBe("2026-10-17");
    expect(graph.finalDepartureDate).toBe("2026-10-18");
    expect(segments.map((x) => x.mode)).toEqual(["transfer", "rail", "aviation"]);
    expect(segments.every((x) => x.gapMinutes >= 0)).toBe(true);
  });
});
