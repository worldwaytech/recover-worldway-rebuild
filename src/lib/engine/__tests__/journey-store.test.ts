import { describe, it, expect } from "vitest";
import { JourneyService, type JourneyRepo, type JourneyRow, type SimulationRow, type VersionRow, type EventRow } from "../intelligence/store";
import { healthAdvisories } from "../intelligence/disruption";
import type { CanonicalOffer } from "../normalize";
import type { SupplierRegistration } from "../types";

// In-memory repo that mimics the DB (append-only versions/approvals/events) and
// can be "restarted" by building a new service over the same stored rows.
function memoryRepo() {
  const s = { j: [] as JourneyRow[], v: [] as VersionRow[], sim: [] as SimulationRow[], a: [] as any[], e: [] as EventRow[] };
  let n = 0;
  const repo: JourneyRepo = {
    insertJourney: async (j) => { const r = { ...j, id: `j${++n}` }; s.j.push(r); return r; },
    getJourney: async (id) => s.j.find((x) => x.id === id) ?? null,
    updateJourney: async (id, p, ev) => { const r = s.j.find((x) => x.id === id); if (!r || r.current_version !== ev) return false; Object.assign(r, p); return true; },
    insertVersion: async (v) => { if (s.v.some((x) => x.journey_id === v.journey_id && x.version === v.version)) throw new Error("dup"); s.v.push(structuredClone(v)); },
    getVersion: async (j, ver) => structuredClone(s.v.find((x) => x.journey_id === j && x.version === ver) ?? null),
    insertSimulation: async (x) => { const r = { ...x, id: `s${++n}` }; s.sim.push(r); return r; },
    getSimulation: async (id) => s.sim.find((x) => x.id === id) ?? null,
    setSimulationStatus: async (id, st) => { s.sim.find((x) => x.id === id)!.status = st; },
    insertApproval: async (a) => { s.a.push(a); },
    insertEvent: async (e) => { s.e.push(e); },
  };
  return { repo, s };
}
const prod = (key: string, kind: any): SupplierRegistration => ({ supplierKey: key, kinds: [kind], readiness: "production", reliability: 0.9, capabilities: [],
  grants: ["search", "availability", "price", "book"].map((c) => ({ capability: c as any, environment: "production", certified: true })) });
const registry = new Map([["air", prod("air", "flight")], ["htl", prod("htl", "stay")], ["act", prod("act", "activity")], ["car", prod("car", "transfer")]]);
const L = "Europe/London";
const o = (sk: string, kind: any, id: string, s: string, e: string, sp: string, ep: string, amt: number): CanonicalOffer => ({ supplierKey: sk, kind, externalId: id, title: id, refundable: true, revalidatedAt: "2026-09-01T00:00:00Z", start: { at: s, timezone: L, place: sp }, end: { at: e, timezone: L, place: ep }, net: { amount: amt, currency: "USD" } });
const offers = [
  o("air", "flight", "F1", "2026-10-10T16:30:00Z", "2026-10-11T03:30:00Z", "DEL", "LHR", 500),
  o("car", "transfer", "T1", "2026-10-11T04:30:00Z", "2026-10-11T05:30:00Z", "LHR", "LON", 80),
  o("htl", "stay", "H1", "2026-10-11T14:00:00Z", "2026-10-14T10:00:00Z", "LON", "LON", 900),
  o("act", "activity", "A1", "2026-10-12T09:00:00Z", "2026-10-12T12:00:00Z", "LON", "LON", 120),
];
const req = { origin: "DEL", destinations: ["LON"], departFrom: "2026-10-10", returnBy: "2026-10-15", adults: 2, children: 0, luxuryLevel: 4 as const, interests: [] };
const env = (j: JourneyRow) => ({ requirements: req, registry, currency: j.currency, fx: { USD: 1 }, ruleFor: () => ({ markupPercent: 0, commissionPercent: 0, serviceFee: 0 }) });

describe("persistent journey intelligence", () => {
  it("persists versions, simulations, approvals and audit; survives restart; supports rollback", async () => {
    const { repo, s } = memoryRepo();
    const j = await new JourneyService(repo, env).create("u1", offers, "USD", req);
    const alt = o("act", "activity", "A2", "2026-10-12T09:30:00Z", "2026-10-12T12:30:00Z", "LON", "LON", 118);
    const sim = await new JourneyService(repo, env).simulate(j.id, { type: "replace", externalId: "A1", with: alt }, "u1");
    expect(sim.status).toBe("pending");
    expect(sim.price_delta).toBe(-2);
    // "Restart": a brand-new service instance over the same stored data.
    const r = await new JourneyService(repo, env).decide(sim.id, "approved", "u1");
    expect(r).toMatchObject({ applied: true, version: 2 });
    expect(s.v.map((v) => v.version)).toEqual([1, 2]);
    expect(s.a).toHaveLength(1);
    // Rollback is itself a simulated, approval-gated change that adds v3.
    const rb = await new JourneyService(repo, env).simulate(j.id, { type: "rollback", toVersion: 1 }, "u1");
    expect(rb.requires_approval).toBe(true);
    await new JourneyService(repo, env).decide(rb.id, "approved", "u1");
    const v3 = s.v.find((v) => v.version === 3)!;
    expect(v3.offers.map((x) => x.externalId)).toContain("A1");
    expect(v3.reason).toBe("rollback to v1");
    expect(s.e.map((e) => e.event_type)).toEqual(["created", "simulated", "change_applied", "simulated", "change_applied"]);
  });

  it("stale simulations are superseded, not applied; rejected changes leave the journey unchanged", async () => {
    const { repo, s } = memoryRepo();
    const svc = new JourneyService(repo, env);
    const j = await svc.create("u1", offers, "USD", req);
    const a = await svc.simulate(j.id, { type: "remove", externalId: "A1" }, "u1");
    const b = await svc.simulate(j.id, { type: "remove", externalId: "T1" }, "u1");
    await svc.decide(a.id, "approved", "u1");
    await expect(svc.decide(b.id, "approved", "u1")).rejects.toThrow(/re-simulate/);
    expect(s.sim.find((x) => x.id === b.id)!.status).toBe("superseded");
    const c = await svc.simulate(j.id, { type: "remove", externalId: "H1" }, "u1");
    await svc.decide(c.id, "rejected", "u1");
    expect(s.j[0]!.current_version).toBe(2);
  });

  it("refuses to apply changes that fail audit and never sets booked outside the booking engine", async () => {
    const { repo } = memoryRepo();
    const svc = new JourneyService(repo, env);
    const j = await svc.create("u1", offers, "USD", req);
    const late = o("air", "flight", "F9", "2026-10-11T16:30:00Z", "2026-10-12T03:30:00Z", "DEL", "LHR", 450);
    const sim = await svc.simulate(j.id, { type: "replace", externalId: "F1", with: late }, "u1");
    await expect(svc.decide(sim.id, "approved", "u1")).rejects.toThrow(/fails audit/);
    await svc.setState(j.id, "proposed", "u1");
    await svc.setState(j.id, "approved", "u1");
    await expect(svc.setState(j.id, "booked", "u1")).rejects.toThrow(/booking engine/);
  });

  it("disruption advisories come only from stored supplier health", () => {
    const ctx = { journeyId: "j", version: 1, state: "booked" as const, offers };
    const adv = healthAdvisories(ctx, [{ supplier_key: "air", status: "down", last_checked_at: "2026-09-29T00:00:00Z" }, { supplier_key: "htl", status: "healthy" }]);
    expect(adv).toEqual([{ componentId: "air:flight:F1", supplierKey: "air", status: "down", action: "prepare_alternatives", since: "2026-09-29T00:00:00Z" }]);
    expect(healthAdvisories(ctx, [])).toEqual([]);
  });
});

import { SUPPLIER_CATALOG, liveStatus } from "../suppliers/catalog.server";
import { bookingBlockers } from "../capabilities";
import { commercialRuleFor } from "../suppliers/commercial.server";
import { runPackagePipeline } from "../package";
describe("commercial rules + live status", () => {
  it("LIVE suppliers are Crystal, UP17, AIR iQ, Viator (+ aviation); only Crystal is bookable; Amadeus off", () => {
    const live = SUPPLIER_CATALOG.filter((s) => liveStatus(s) === "LIVE").map((s) => s.supplierKey).sort();
    expect(live).toEqual(["airiq", "crystal", "private-aviation", "travelshop", "up17", "viator-affiliate"]);
    expect(SUPPLIER_CATALOG.filter((s) => !bookingBlockers(s).length).map((s) => s.supplierKey)).toEqual(["crystal"]);
    expect(liveStatus(SUPPLIER_CATALOG.find((s) => s.supplierKey === "amadeus")!)).toBe("OFF");
  });
  it("uses real Worldway rules and blocks pricing when a supplier has no rule (never 0%)", () => {
    expect(commercialRuleFor({ supplierKey: "airiq" })!.markupPercent).toBe(5);
    expect(commercialRuleFor({ supplierKey: "crystal" })!.markupPercent).toBe(10);
    expect(commercialRuleFor({ supplierKey: "gadventures" })).toBeNull();
    const noRule = offers.map((o) => ({ ...o, supplierKey: "gadventures" }));
    const [p] = runPackagePipeline({ requirements: req, registry, currency: "USD", fx: { USD: 1 }, ruleFor: commercialRuleFor, candidates: [{ id: "x", offers: noRule }] });
    expect(p!.pricing).toBeNull();
    expect(p!.bookable).toBe(false);
    expect(p!.issues.some((i) => /commercial rule/.test(i.message))).toBe(true);
  });
});
