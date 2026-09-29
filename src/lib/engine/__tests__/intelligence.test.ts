import { describe, it, expect } from "vitest";
import type { CanonicalOffer } from "../normalize";
import type { PipelineInput } from "../package";
import type { SupplierRegistration } from "../types";
import {
  buildDependencies, downstreamOf, transition, simulate, commitChange, rankAlternatives,
  detectDisruptions, replan, sequenceActivities, explainSimulation, verifyNarrative,
  permittedDNA, personaliseFactors, upcomingCheckpoints, type JourneyContext,
} from "../intelligence";
import { normalizeOffers } from "../normalize";

const prod = (key: string, kind: any): SupplierRegistration => ({ supplierKey: key, kinds: [kind], readiness: "production", reliability: 0.9, capabilities: [],
  grants: ["search", "availability", "price", "book"].map((c) => ({ capability: c as any, environment: "production", certified: true })) });
const registry = new Map([["air", prod("air", "flight")], ["car", prod("car", "transfer")], ["htl", prod("htl", "stay")], ["act", prod("act", "activity")]]);
const rev = "2026-09-01T00:00:00Z";
const L = "Europe/London";
const o = (sk: string, kind: any, id: string, s: string, e: string, sp: string, ep: string, amt: number, tz = L): CanonicalOffer => ({
  supplierKey: sk, kind, externalId: id, title: id, refundable: true, revalidatedAt: rev,
  start: { at: s, timezone: tz, place: sp }, end: { at: e, timezone: L, place: ep }, net: { amount: amt, currency: "USD" } });
const flight = o("air", "flight", "F1", "2026-10-10T16:30:00Z", "2026-10-11T03:30:00Z", "DEL", "LHR", 500, "Asia/Kolkata");
const transfer = o("car", "transfer", "T1", "2026-10-11T04:30:00Z", "2026-10-11T05:30:00Z", "LHR", "LON", 80);
const hotel = o("htl", "stay", "H1", "2026-10-11T14:00:00Z", "2026-10-14T10:00:00Z", "LON", "LON", 900);
const tour = o("act", "activity", "A1", "2026-10-12T09:00:00Z", "2026-10-12T12:00:00Z", "LON", "LON", 120);
const ctx: JourneyContext = { journeyId: "J", version: 1, state: "booked", offers: [flight, transfer, hotel, tour] };
const input: Omit<PipelineInput, "candidates"> = {
  requirements: { origin: "DEL", destinations: ["LON"], departFrom: "2026-10-10", returnBy: "2026-10-15", adults: 2, children: 0, luxuryLevel: 4, interests: [] },
  registry, currency: "USD", fx: { USD: 1 }, ruleFor: () => ({ markupPercent: 10, commissionPercent: 0, serviceFee: 0 }),
};

describe("journey dependencies + state", () => {
  it("flight → transfer → hotel → activity chain", () => {
    const deps = buildDependencies(normalizeOffers(ctx.offers).components);
    expect(downstreamOf("air:flight:F1", deps)).toEqual(expect.arrayContaining(["car:transfer:T1", "htl:stay:H1", "act:activity:A1"]));
  });
  it("rejects invalid transitions", () => {
    expect(transition("booked", "disrupted")).toBe("disrupted");
    expect(() => transition("completed", "booked")).toThrow();
  });
});

describe("what-if simulation + approval", () => {
  it("a later flight shows downstream impact, breaks the hotel date and needs approval", () => {
    const late = o("air", "flight", "F2", "2026-10-11T16:30:00Z", "2026-10-12T03:30:00Z", "DEL", "LHR", 450, "Asia/Kolkata");
    const s = simulate(ctx, { type: "replace", externalId: "F1", with: late }, input);
    expect(s.impacted.length).toBeGreaterThanOrEqual(3);
    expect(s.material).toContain("timing");
    expect(s.bookableAfter).toBe(false);
    expect(s.requiresApproval).toBe(true);
    expect(() => commitChange(ctx, s, null)).toThrow(/Approval/);
  });
  it("equivalent alternative ranks first and commits only with approval", () => {
    const same = o("act", "activity", "A2", "2026-10-12T09:30:00Z", "2026-10-12T12:30:00Z", "LON", "LON", 118);
    const far = o("act", "activity", "A3", "2026-10-13T15:00:00Z", "2026-10-13T18:00:00Z", "LON", "LON", 400);
    const [best] = rankAlternatives(ctx, "A1", [far, same], input);
    expect(best!.change.type === "replace" && best!.change.with.externalId).toBe("A2");
    const next = commitChange(ctx, best!, { approvedBy: "customer", at: rev });
    expect(next.version).toBe(2);
    expect(next.state).toBe("proposed");
  });
});

describe("disruption + replanning", () => {
  it("flight delay breaks connection-dependent components and replans from real alternatives only", () => {
    const [d] = detectDisruptions(ctx, [{ type: "delay", externalId: "F1", newStart: "2026-10-10T20:30:00Z", newEnd: "2026-10-11T07:30:00Z", source: "supplier-status" }]);
    expect(d!.severity).toBe("action_required");
    expect(d!.broken).toContain("car:transfer:T1");
    const later = o("car", "transfer", "T2", "2026-10-11T08:30:00Z", "2026-10-11T09:30:00Z", "LHR", "LON", 82);
    const r = replan(ctx, { ...d!, event: { type: "cancelled", externalId: "T1", source: "x" } }, [later], input);
    expect(r.requiresApproval).toBe(true);
    expect(r.options).toHaveLength(1);
  });
  it("cancellation marks the component and everything downstream", () => {
    const [d] = detectDisruptions(ctx, [{ type: "cancelled", externalId: "F1", source: "supplier-status" }]);
    expect(d!.broken.length).toBe(4);
  });
});

describe("sequencing + DNA + explanation", () => {
  const n = (x: CanonicalOffer) => normalizeOffers([x]).components[0]!;
  it("keeps rest after long-haul arrival and respects relaxed pace", () => {
    const early = n(o("act", "activity", "S1", "2026-10-11T05:00:00Z", "2026-10-11T07:00:00Z", "LON", "LON", 50));
    const ok = n(o("act", "activity", "S2", "2026-10-12T09:00:00Z", "2026-10-12T11:00:00Z", "LON", "LON", 50));
    const sameDay = n(o("act", "activity", "S3", "2026-10-12T13:00:00Z", "2026-10-12T15:00:00Z", "LON", "LON", 50));
    const dna = { consent: { preferences: true, history: false }, interests: [], avoid: [], pace: "relaxed" as const };
    const r = sequenceActivities(n(flight), n(hotel), [{ activityKey: "a", slots: [early, ok] }, { activityKey: "b", slots: [sameDay] }], dna);
    expect(r.chosen.map((c) => c.externalId)).toEqual(["S2"]);
    expect(r.unplaced).toHaveLength(1);
  });
  it("ignores preferences without consent and keeps feasibility dominant", () => {
    const d = permittedDNA({ consent: { preferences: false, history: false }, interests: ["wine"], avoid: [], prefersRefundable: true });
    expect(d.interests).toEqual([]);
    const f = personaliseFactors([{ factor: "Itinerary feasibility", weight: 0.3, value: 1 }, { factor: "Cancellation flexibility", weight: 0.1, value: 1 }, { factor: "Price", weight: 0.6, value: 1 }],
      { consent: { preferences: true, history: false }, interests: [], avoid: [], prefersRefundable: true });
    expect(f[0]!.weight).toBeGreaterThanOrEqual(0.3);
    expect(Math.round(f.reduce((s, x) => s + x.weight, 0) * 100)).toBe(100);
  });
  it("AI narrative may not state prices or times absent from engine facts", () => {
    const s = simulate(ctx, { type: "remove", externalId: "A1" }, input);
    const e = explainSimulation(s);
    expect(verifyNarrative(`Your price changes by ${s.priceDelta!.toFixed(2)}.`, e.facts).ok).toBe(true);
    expect(verifyNarrative("It now costs 99.00 and leaves at 07:45.", e.facts).ok).toBe(false);
  });
  it("post-booking checkpoints are derived from real supplier times", () => {
    expect(upcomingCheckpoints(ctx, "2026-10-09T00:00:00Z").map((c) => c.kind)).toEqual(["flight", "transfer", "stay"]);
  });
});
