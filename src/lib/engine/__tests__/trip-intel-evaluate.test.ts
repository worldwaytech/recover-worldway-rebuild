import { describe, it, expect } from "vitest";
import type { CanonicalOffer } from "../normalize";
import { runPackagePipeline, type PipelineInput } from "../package";
import type { SupplierRegistration } from "../types";
import { evaluateProposals } from "../intelligence/evaluate";
import { normaliseConversation } from "../intelligence/commerce";

const prod = (key: string, kind: any): SupplierRegistration => ({ supplierKey: key, kinds: [kind], readiness: "production", reliability: 0.9, capabilities: [],
  grants: ["search", "availability", "price", "book"].map((c) => ({ capability: c as any, environment: "production", certified: true })) });
const registry = new Map([["air", prod("air", "flight")], ["htl", prod("htl", "stay")]]);
const L = "Europe/London";
const NOW = "2026-09-01T00:10:00Z";
const o = (sk: string, kind: any, id: string, s: string, e: string, sp: string, ep: string, amt: number, extra: Partial<CanonicalOffer> = {}): CanonicalOffer => ({
  supplierKey: sk, kind, externalId: id, title: id, refundable: true, revalidatedAt: "2026-09-01T00:00:00Z",
  start: { at: s, timezone: L, place: sp }, end: { at: e, timezone: L, place: ep }, net: { amount: amt, currency: "USD" }, ...extra });
const flight = o("air", "flight", "F1", "2026-10-10T16:30:00Z", "2026-10-11T03:30:00Z", "DEL", "LHR", 500);
const hotel = o("htl", "stay", "H1", "2026-10-11T14:00:00Z", "2026-10-14T10:00:00Z", "LON", "LON", 900, { quality: 5 });
const cheap = o("htl", "stay", "H2", "2026-10-11T14:00:00Z", "2026-10-14T10:00:00Z", "LON", "LON", 400, { quality: 3, refundable: false });
const base: Omit<PipelineInput, "candidates"> = {
  requirements: { origin: "DEL", destinations: ["LON"], departFrom: "2026-10-10", returnBy: "2026-10-15", adults: 2, children: 0, luxuryLevel: 4, interests: [] },
  registry, currency: "USD", fx: { USD: 1 }, ruleFor: () => ({ markupPercent: 10, commissionPercent: 0, serviceFee: 0 }),
};
const pkgs = runPackagePipeline({ ...base, candidates: [
  { id: "A", offers: [flight, hotel] },
  { id: "B", offers: [flight, cheap] },
] });
const props = pkgs.map((p) => ({ id: p.id, result: p, bookable: p.bookable }));

describe("trip intelligence pipeline", () => {
  it("labels unique alternatives and evaluates every proposal", () => {
    const r = evaluateProposals({ proposals: props, registry, now: NOW });
    expect(r).toHaveLength(2);
    const labels = r.map((x) => x.label).filter(Boolean);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Recommended");
    for (const x of r) expect(x.channels.map((c) => c.channel)).toEqual(["b2c", "b2b", "b2b2c"]);
  });
  it("a hard budget makes an over-budget proposal not bookable, without changing its price", () => {
    const before = props.map((p) => p.result.pricing?.total);
    const r = evaluateProposals({ proposals: props, registry, now: NOW, budget: 1000 });
    const a = r.find((x) => x.proposalId === "A")!;
    expect(a.constraints.feasible).toBe(false);
    expect(a.bookable).toBe(false);
    expect(props.map((p) => p.result.pricing?.total)).toEqual(before);
  });
  it("stale prices are queued for recheck and lower confidence", () => {
    const later = "2026-09-01T03:00:00Z";
    const r = evaluateProposals({ proposals: props, registry, now: later });
    expect(r[0]!.recheckDue.length).toBeGreaterThan(0);
    expect(r[0]!.minConfidence).toBeLessThan(evaluateProposals({ proposals: props, registry, now: NOW })[0]!.minConfidence);
  });
  it("learning adjusts confidence only, never price", () => {
    const low = evaluateProposals({ proposals: props, registry, now: NOW, learned: new Map([["htl", 0.1]]) });
    const norm = evaluateProposals({ proposals: props, registry, now: NOW });
    expect(low[0]!.minConfidence).toBeLessThan(norm[0]!.minConfidence);
    expect(props[0]!.result.pricing?.total).toBe(pkgs[0]!.pricing?.total);
  });
  it("passport validity is an error risk that blocks booking", () => {
    const r = evaluateProposals({ proposals: props, registry, now: NOW, passportExpiry: "2026-12-01" });
    expect(r.every((x) => x.risks.some((k) => k.code === "passport-validity") && !x.bookable)).toBe(true);
  });
  it("never bookable when the engine said not bookable", () => {
    const r = evaluateProposals({ proposals: props.map((p) => ({ ...p, bookable: false })), registry, now: NOW });
    expect(r.every((x) => !x.bookable)).toBe(true);
  });
  it("normalises WhatsApp exports for the request reader", () => {
    const t = normaliseConversation("[01/10/2026, 10:15] Raj: Jaipur 3 nights\n01/10/2026, 10:16 - Raj: <Media omitted>\n");
    expect(t).toBe("Jaipur 3 nights");
  });
});
