import { describe, it, expect } from "vitest";
import { combine } from "../suppliers/assembly.server";
import { airportTz, flightToCanonical, localToInstant, localDateIn } from "../suppliers/live-search.server";
import type { CanonicalOffer } from "../normalize";

const req = { origin: "BOM", destinations: ["CDG"], departFrom: "2026-12-12", returnBy: "2026-12-19", adults: 2, children: 0, luxuryLevel: 4 as const, interests: [] };

describe("live assembly", () => {
  it("converts local supplier times using real airport time zones", () => {
    expect(airportTz("BOM")!.tz).toBe("Asia/Kolkata");
    expect(localToInstant("2026-12-12 23:30", "Asia/Kolkata")).toBe("2026-12-12T18:00:00.000Z");
    const f = flightToCanonical({ offer_id: "WWF-B-1", airline: "AI", flight_numbers: ["AI143"], origin: "BOM", destination: "CDG", departure: "2026-12-12 23:30", arrival: "2026-12-13 06:10",
      stops: 0, duration_min: 610, cabin: "economy", refundable: true, seats_available: 4, total_price: 60000, currency: "INR", trip: "one_way" })!;
    expect(f.supplierKey).toBe("airiq");
    expect(f.end.timezone).toBe("Europe/Paris");
    expect(localDateIn(f.end.at, f.end.timezone)).toBe("2026-12-13");
    expect(f.revalidatedAt).toBeUndefined();
    expect(flightToCanonical({ ...({} as any), offer_id: "X-1" })).toBeNull();
  });

  it("hotel on actual (next-day) arrival date; search-only → never bookable; gaps on request", () => {
    const f = (id: string, s: string, e: string, from: string, to: string, tzA: string, tzB: string): CanonicalOffer => ({ supplierKey: "airiq", kind: "flight", externalId: id, title: id, refundable: true,
      start: { at: s, timezone: tzA, place: from }, end: { at: e, timezone: tzB, place: to }, net: { amount: 60000, currency: "INR" } });
    const out = f("F1", "2026-12-12T18:00:00Z", "2026-12-13T05:10:00Z", "BOM", "CDG", "Asia/Kolkata", "Europe/Paris");
    const back = f("F2", "2026-12-19T10:00:00Z", "2026-12-19T23:00:00Z", "CDG", "BOM", "Europe/Paris", "Asia/Kolkata");
    const hotel = (d: string): CanonicalOffer => ({ supplierKey: "ratehawk", kind: "stay", externalId: `H${d}`, title: "Hotel", refundable: true,
      start: { at: localToInstant(`${d} 00:00`, "Europe/Paris")!, timezone: "Europe/Paris", place: "CDG" }, end: { at: localToInstant("2026-12-19 00:00", "Europe/Paris")!, timezone: "Europe/Paris", place: "CDG" }, net: { amount: 90000, currency: "INR" } });
    const [p] = combine(req, [out], new Map([["2026-12-13", [hotel("2026-12-13")]]]), [back], "INR", []);
    expect(p!.result.graph.map((c) => c.kind)).toEqual(["flight", "stay", "flight"]);
    expect(p!.result.issues.some((i) => i.code === "hotel-date-mismatch")).toBe(false);
    expect(p!.result.pricing!.total).toBeGreaterThan(0); // AIR iQ 5% + RateHawk rule
    expect(p!.readiness.bookable).toBe(false);
    expect(p!.readiness.blockers).toContain("live revalidation required");
    expect(p!.onRequest.map((o) => o.kind)).toContain("transfer");
  });

  it("no hotel availability is marked on request, not invented", () => {
    const out: CanonicalOffer = { supplierKey: "up17", kind: "flight", externalId: "U1", title: "U1", refundable: false,
      start: { at: "2026-12-12T18:00:00Z", timezone: "Asia/Kolkata", place: "BOM" }, end: { at: "2026-12-13T05:10:00Z", timezone: "Europe/Paris", place: "CDG" }, net: { amount: 50000, currency: "INR" } };
    const [p] = combine(req, [out], new Map(), [], "INR", []);
    expect(p!.offers).toHaveLength(1);
    expect(p!.onRequest.map((o) => o.kind)).toEqual(expect.arrayContaining(["stay", "flight", "transfer"]));
    expect(p!.result.pricing).toBeNull(); // UP17 has no Worldway commercial rule → never 0%
  });
});
