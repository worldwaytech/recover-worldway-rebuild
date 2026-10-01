import { describe, it, expect } from "vitest";
import type { CanonicalOffer } from "../normalize";
import { normalizeOffers } from "../normalize";
import { runPackagePipeline, type PipelineInput } from "../package";
import type { SupplierRegistration } from "../types";
import {
  evaluateConstraints, constraints, componentEvidence, revalidationDue, channelReadiness, packageRisks,
  optimiseMarkup, suggestAncillaries, mergeInventory, packageAlternatives, explainTradeoff, learnFromOutcomes, normaliseConversation,
} from "../intelligence";

const prod = (key: string, kind: any): SupplierRegistration => ({ supplierKey: key, kinds: [kind], readiness: "production", reliability: 0.9, capabilities: [],
  grants: ["search", "availability", "price", "book"].map((c) => ({ capability: c as any, environment: "production", certified: true })) });
const uat: SupplierRegistration = { supplierKey: "u", kinds: ["stay"], readiness: "uat", reliability: 0.5, capabilities: [], grants: [] };
const registry = new Map([["air", prod("air", "flight")], ["htl", prod("htl", "stay")], ["car", prod("car", "transfer")], ["act", prod("act", "activity")], ["u", uat]]);
const NOW = "2026-09-01T00:10:00Z";
const rev = "2026-09-01T00:00:00Z";
const L = "Europe/London";
const o = (sk: string, kind: any, id: string, s: string, e: string, sp: string, ep: string, amt: number, extra: Partial<CanonicalOffer> = {}): CanonicalOffer => ({
  supplierKey: sk, kind, externalId: id, title: id, refundable: true, revalidatedAt: rev,
  start: { at: s, timezone: L, place: sp }, end: { at: e, timezone: L, place: ep }, net: { amount: amt, currency: "USD" }, ...extra });
const flight = o("air", "flight", "F1", "2026-10-10T16:30:00Z", "2026-10-11T03:30:00Z", "DEL", "LHR", 500);
const hotel = o("htl", "stay", "H1", "2026-10-11T14:00:00Z", "2026-10-14T10:00:00Z", "LON", "LON", 900, { quality: 5 });
const cheapHotel = o("htl", "stay", "H2", "2026-10-11T14:00:00Z", "2026-10-14T10:00:00Z", "LON", "LON", 400, { quality: 3, refundable: false });
const comps = normalizeOffers([flight, hotel]).components;
const input: Omit<PipelineInput, "candidates"> = {
  requirements: { origin: "DEL", destinations: ["LON"], departFrom: "2026-10-10", returnBy: "2026-10-15", adults: 2, children: 0, luxuryLevel: 4, interests: [] },
  registry, currency: "USD", fx: { USD: 1 }, ruleFor: () => ({ markupPercent: 10, commissionPercent: 0, serviceFee: 0 }),
};

describe("constraint tiers", () => {
  it("hard violation makes infeasible; soft outweighs any number of preferences", () => {
    const r = evaluateConstraints(comps, 1540, [constraints.budget(1000)]);
    expect(r.feasible).toBe(false);
    const a = evaluateConstraints(comps, 1540, [constraints.minQuality(0, "soft"), constraints.refundable("nice")]);
    const b = evaluateConstraints(comps, 1540, [constraints.minQuality(6, "soft"), constraints.refundable("preference")]);
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe("evidence + revalidation", () => {
  it("scores live certified parts high and uncertified/unrevalidated low", () => {
    expect(componentEvidence(comps[0]!, registry.get("air"), NOW).bookable).toBe(true);
    const [u] = normalizeOffers([o("u", "stay", "U1", "2026-10-11T14:00:00Z", "2026-10-12T10:00:00Z", "LON", "LON", 1, { revalidatedAt: undefined })]).components;
    const e = componentEvidence(u!, uat, NOW);
    expect(e.bookable).toBe(false);
    expect(e.confidence).toBeLessThan(0.2);
  });
  it("flags stale components for revalidation", () => {
    expect(revalidationDue(comps, NOW, 30)).toEqual([]);
    expect(revalidationDue(comps, "2026-09-01T02:00:00Z", 30)).toHaveLength(2);
  });
});

describe("channels, risks, margin", () => {
  const [pkg] = runPackagePipeline({ ...input, candidates: [{ id: "P", offers: [flight, hotel] }] });
  it("channel readiness reflects bookability and confidence", () => {
    const ev = pkg!.graph.map((c) => componentEvidence(c, registry.get(c.supplierKey), NOW));
    const r = channelReadiness(pkg!, ev);
    expect(r.find((x) => x.channel === "b2c")!.ready).toBe(pkg!.bookable);
  });
  it("detects passport validity and short connections", () => {
    const risks = packageRisks(comps, { passportExpiry: "2027-01-01", now: NOW });
    expect(risks.map((r) => r.code)).toContain("passport-validity");
    const f2 = o("air", "flight", "F2", "2026-10-11T04:00:00Z", "2026-10-11T06:00:00Z", "LHR", "CDG", 100);
    expect(packageRisks(normalizeOffers([flight, f2]).components, { now: NOW }).map((r) => r.code)).toContain("short-connection");
  });
  it("optimises markup without breaking the hard budget", () => {
    const r = optimiseMarkup(1000, 5, 15, comps, [constraints.budget(1100)]);
    expect(r).toEqual({ markupPercent: 10, total: 1100 });
    expect(optimiseMarkup(1000, 5, 15, comps, [constraints.budget(1000)])).toBeNull();
  });
});

describe("merchandising, inventory, alternatives, learning, inputs", () => {
  it("suggests only revalidated live ancillaries that fit gaps", () => {
    const t = o("car", "transfer", "T1", "2026-10-11T04:30:00Z", "2026-10-11T05:30:00Z", "LHR", "LON", 80);
    const stale = o("act", "activity", "A0", "2026-10-12T09:00:00Z", "2026-10-12T12:00:00Z", "LON", "LON", 50, { revalidatedAt: undefined });
    const s = suggestAncillaries(comps, [t, stale]);
    expect(s.map((x) => x.offer.externalId)).toEqual(["T1"]);
  });
  it("live inventory wins over contracted duplicates", () => {
    const m = mergeInventory([{ ...hotel, net: { amount: 1, currency: "USD" } }, cheapHotel], [hotel]);
    expect(m).toHaveLength(2);
    expect(m.find((x) => x.offer.externalId === "H1")!.source).toBe("live");
  });
  it("produces distinct labelled alternatives with trade-offs", () => {
    const pk = runPackagePipeline({ ...input, candidates: [{ id: "lux", offers: [flight, hotel] }, { id: "val", offers: [flight, cheapHotel] }] });
    const alts = packageAlternatives(pk);
    expect(alts.map((a) => a.pkg.id)).toContain("val");
    expect(new Set(alts.map((a) => a.pkg.id)).size).toBe(alts.length);
    expect(explainTradeoff(pk[0]!, pk[1]!).length).toBeGreaterThan(0);
  });
  it("learns supplier reliability from outcomes only", () => {
    const l = learnFromOutcomes([{ supplierKey: "air", kind: "flight", event: "booked" }, { supplierKey: "air", kind: "flight", event: "failed" }]);
    expect(l[0]!.bookingSuccess).toBe(0.5);
  });
  it("normalises WhatsApp exports", () => {
    expect(normaliseConversation("12/09/2026, 10:15 - Raj: Need Paris trip\n12/09/2026, 10:16 - Raj: <Media omitted>")).toBe("Need Paris trip");
  });
});
