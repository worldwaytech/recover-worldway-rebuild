import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/flights/flight-adapters.server", () => ({ flightOfferSupplier: () => null, flightOfferHandle: () => null }));
import { reconcile } from "../suppliers/revalidate.server";
import { classifyOffer, isFresh } from "../classify";
import { revalidateProposals, combine, readinessOf } from "../suppliers/assembly.server";
import { up17HotelsToCanonical } from "../suppliers/live-search.server";
import { registrationFor } from "../suppliers/catalog.server";
import type { CanonicalOffer } from "../normalize";

const req = { origin: "DEL", destinations: ["BOM"], departFrom: "2026-10-15", returnBy: "2026-10-18", adults: 2, children: 0, luxuryLevel: 3 as const, interests: [] };
const fl = (id: string, s: string, e: string, from: string, to: string, sk = "airiq"): CanonicalOffer => ({ supplierKey: sk, kind: "flight", externalId: id, title: id, refundable: false,
  start: { at: s, timezone: "Asia/Kolkata", place: from }, end: { at: e, timezone: "Asia/Kolkata", place: to }, net: { amount: 5000, currency: "INR" } });

describe("revalidation", () => {
  it("confirms, refreshes changed prices and rejects missing offers — never invents", () => {
    const o = fl("A", "2026-10-15T04:00:00Z", "2026-10-15T06:10:00Z", "DEL", "BOM");
    const now = new Date().toISOString();
    expect(reconcile(o, { found: true, net: 5000, currency: "INR" }, now).result.status).toBe("confirmed");
    const ch = reconcile(o, { found: true, net: 5400, currency: "INR" }, now);
    expect(ch.result.status).toBe("changed");
    expect(ch.offer!.net.amount).toBe(5400);
    const gone = reconcile(o, { found: false }, now);
    expect(gone.offer).toBeNull();
    expect(gone.result.status).toBe("rejected");
  });

  it("expired revalidation blocks readiness", () => {
    expect(isFresh(new Date(Date.now() - 20 * 60_000).toISOString())).toBe(false);
    const [p] = combine(req, [{ ...fl("A", "2026-10-15T04:00:00Z", "2026-10-15T06:10:00Z", "DEL", "BOM"), revalidatedAt: new Date(Date.now() - 30 * 60_000).toISOString() }], new Map(), [], "INR", []);
    expect(p!.readiness.blockers.join()).toMatch(/revalidation expired/);
  });

  it("changed price keeps package non-bookable; rejected offer marked UNAVAILABLE", async () => {
    const out = fl("A", "2026-10-15T04:00:00Z", "2026-10-15T06:10:00Z", "DEL", "BOM");
    const back = fl("B", "2026-10-18T10:00:00Z", "2026-10-18T12:10:00Z", "BOM", "DEL");
    const shortlist = combine(req, [out], new Map(), [back], "INR", []);
    const r = await revalidateProposals(req, shortlist, "INR", [], async (offers) => offers.map((o) =>
      reconcile(o, o.externalId === "A" ? { found: true, net: 5600, currency: "INR" } : { found: false, reason: "Fare sold out" }, new Date().toISOString())));
    const p = r.proposals[0]!;
    expect(p.offers.map((o) => o.externalId)).toEqual(["A"]);
    expect(p.readiness.blockers).toContain("price changed — customer approval required");
    expect(p.readiness.bookable).toBe(false);
    expect(p.onRequest.find((x) => x.ref === "B")?.status).toBe("UNAVAILABLE");
    expect(p.result.pricing!.total).toBeGreaterThan(5600); // AIR iQ markup applied once on refreshed net
  });
});

describe("classification", () => {
  const o = fl("A", "2026-10-15T04:00:00Z", "2026-10-15T06:10:00Z", "DEL", "BOM", "up17");
  it("LIVE → AVAILABLE after revalidation; uncertified booking never BOOKABLE", () => {
    const up17 = registrationFor("up17");
    expect(classifyOffer(o, up17)).toBe("LIVE");
    expect(classifyOffer({ ...o, revalidatedAt: new Date().toISOString() }, up17, { priced: true })).toBe("AVAILABLE");
    expect(classifyOffer(o, up17, { rejected: true })).toBe("UNAVAILABLE");
  });
  it("sandbox/UAT suppliers are ON_REQUEST; Crystal can be BOOKABLE only when revalidated and priced", () => {
    expect(classifyOffer({ ...o, supplierKey: "ratehawk", revalidatedAt: new Date().toISOString() }, registrationFor("ratehawk"), { priced: true })).toBe("ON_REQUEST");
    const c = { ...o, supplierKey: "crystal", kind: "cruise" as const };
    expect(classifyOffer(c, registrationFor("crystal"), { priced: false })).toBe("LIVE");
    expect(classifyOffer({ ...c, revalidatedAt: new Date().toISOString() }, registrationFor("crystal"), { priced: false })).toBe("AVAILABLE");
    expect(classifyOffer({ ...c, revalidatedAt: new Date().toISOString() }, registrationFor("crystal"), { priced: true })).toBe("BOOKABLE");
    expect(registrationFor("amadeus").readiness).toBe("disabled");
  });
});

describe("live hotels", () => {
  it("UP17 hotels map to date-anchored stays at the destination time zone; no price → dropped", () => {
    const s = up17HotelsToCanonical([{ hotelCode: "H1", name: "Sea View", starRating: 4, totalPrice: 9000, currency: "INR", rooms: [{ refundable: true }] },
      { hotelCode: "H2", name: "No price", starRating: 3, totalPrice: null, currency: "INR", rooms: [] }], "BOM", "2026-10-15", "2026-10-18", new Date().toISOString());
    expect(s).toHaveLength(1);
    expect(s[0]!.start.at).toBe("2026-10-14T18:30:00.000Z");
    expect(s[0]!.supplierKey).toBe("up17");
    // No approved UP17 commercial rule → package is not priced (never 0%).
    const [p] = combine(req, [fl("A", "2026-10-15T04:00:00Z", "2026-10-15T06:10:00Z", "DEL", "BOM")], new Map([["2026-10-15", s]]), [], "INR", []);
    expect(p!.result.pricing).toBeNull();
    expect(readinessOf(p!.offers, p!.result).bookable).toBe(false);
  });
});
