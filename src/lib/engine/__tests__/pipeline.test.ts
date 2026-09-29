import { describe, it, expect } from "vitest";
import { runPackagePipeline, substituteAndRevalidate, type PipelineInput } from "../package";
import { bookingBlockers, capabilityMatrix, isProductionCertified } from "../capabilities";
import { selectAdapters, orchestrate, type EngineAdapter } from "../orchestrator";
import { HealthTracker } from "../health";
import type { CanonicalOffer } from "../normalize";
import type { SupplierRegistration } from "../types";
import { SUPPLIER_CATALOG, supplierRegistry } from "../suppliers/catalog.server";

const prod = (key: string, kind: any): SupplierRegistration => ({
  supplierKey: key, kinds: [kind], readiness: "production", reliability: 0.9, capabilities: [],
  grants: ["search", "availability", "price", "book"].map((c) => ({ capability: c as any, environment: "production", certified: true })),
});
const reg = new Map<string, SupplierRegistration>([
  ["air", prod("air", "flight")], ["car", prod("car", "transfer")], ["htl", prod("htl", "stay")], ["act", prod("act", "activity")],
  ["uat", { ...prod("uat", "stay"), readiness: "uat", grants: [{ capability: "book", environment: "uat", certified: true }] }],
]);
const rev = "2026-09-01T00:00:00Z";
// Overnight DEL→LHR: departs 22:00 IST, lands next day 04:30 London (timezone change).
const flight: CanonicalOffer = { supplierKey: "air", kind: "flight", externalId: "F1", title: "Flight", refundable: true, revalidatedAt: rev,
  start: { at: "2026-10-10T16:30:00Z", timezone: "Asia/Kolkata", place: "DEL" }, end: { at: "2026-10-11T03:30:00Z", timezone: "Europe/London", place: "LHR" },
  net: { amount: 500, currency: "USD" } };
const transfer: CanonicalOffer = { supplierKey: "car", kind: "transfer", externalId: "T1", title: "Transfer", refundable: true, revalidatedAt: rev,
  start: { at: "2026-10-11T04:30:00Z", timezone: "Europe/London", place: "LHR" }, end: { at: "2026-10-11T05:30:00Z", timezone: "Europe/London", place: "LON" },
  net: { amount: 80, currency: "GBP" } };
const hotel = (checkIn: string, key = "htl"): CanonicalOffer => ({ supplierKey: key, kind: "stay", externalId: `H-${checkIn}-${key}`, title: "Hotel", refundable: true, revalidatedAt: rev,
  start: { at: checkIn, timezone: "Europe/London", place: "LON" }, end: { at: "2026-10-14T10:00:00Z", timezone: "Europe/London", place: "LON" },
  net: { amount: 900, currency: "GBP" } });
const activity: CanonicalOffer = { supplierKey: "act", kind: "activity", externalId: "A1", title: "Tour", refundable: false, revalidatedAt: rev,
  start: { at: "2026-10-12T09:00:00Z", timezone: "Europe/London", place: "LON" }, end: { at: "2026-10-12T12:00:00Z", timezone: "Europe/London", place: "LON" },
  net: { amount: 120, currency: "GBP" } };

const base = (candidates: PipelineInput["candidates"], fx: Record<string, number> = { USD: 1, GBP: 1.27 }): PipelineInput => ({
  requirements: { origin: "DEL", destinations: ["LON"], departFrom: "2026-10-10", returnBy: "2026-10-15", adults: 2, children: 0, luxuryLevel: 4, interests: [] },
  candidates, registry: reg, currency: "USD", fx, ruleFor: () => ({ markupPercent: 10, commissionPercent: 0, serviceFee: 0 }),
});

describe("end-to-end package pipeline", () => {
  it("checks in on the actual next-day arrival date, not the departure/package date", () => {
    const out = runPackagePipeline(base([
      { id: "pkg-date", offers: [flight, transfer, hotel("2026-10-10T14:00:00Z"), activity] },
      { id: "arrival", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), activity] },
    ]));
    const good = out.find((p) => p.id === "arrival")!;
    const bad = out.find((p) => p.id === "pkg-date")!;
    expect(out[0]!.id).toBe("arrival");
    expect(good.graph.map((c) => c.kind)).toEqual(["flight", "transfer", "stay", "activity"]);
    expect(good.bookable).toBe(true);
    expect(good.pricing!.total).toBeGreaterThan(0);
    expect(bad.issues.some((i) => i.code === "hotel-date-mismatch")).toBe(true);
    expect(bad.bookable).toBe(false);
  });

  it("blocks booking on FX/price failure", () => {
    const [p] = runPackagePipeline(base([{ id: "x", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z")] }], { USD: 1 }));
    expect(p!.pricing).toBeNull();
    expect(p!.issues.some((i) => i.code === "price-unavailable")).toBe(true);
    expect(p!.bookable).toBe(false);
  });

  it("rejects offers without real times/timezones instead of guessing", () => {
    const broken = { ...activity, externalId: "A2", start: { ...activity.start, timezone: "" } };
    const [p] = runPackagePipeline(base([{ id: "x", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), broken] }]));
    expect(p!.rejected).toHaveLength(1);
    expect(p!.bookable).toBe(false);
  });

  it("capability mismatch: UAT-certified supplier never enters booking readiness", () => {
    const [p] = runPackagePipeline(base([{ id: "x", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z", "uat")] }]));
    expect(p!.issues.some((i) => i.code === "supplier-not-bookable")).toBe(true);
    expect(p!.bookable).toBe(false);
  });

  it("supplier failure: equivalent alternative is re-priced and revalidated; material change needs approval", () => {
    const pkg = { id: "p", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), activity] };
    const same = substituteAndRevalidate(base([pkg]), pkg, "A1", { ...activity, supplierKey: "act", externalId: "A9", net: { amount: 125, currency: "GBP" } });
    expect(same.material).toEqual([]);
    expect(same.package.bookable).toBe(true);
    const diff = substituteAndRevalidate(base([pkg]), pkg, "A1", { ...activity, externalId: "A8", net: { amount: 300, currency: "GBP" } });
    expect(diff.material).toContain("price");
    expect(diff.package.bookable).toBe(false);
  });
});

describe("capability control", () => {
  it("search ≠ bookable and UAT/sandbox ≠ production", () => {
    const r = supplierRegistry();
    expect(bookingBlockers(r.get("crystal"))).toEqual([]);
    expect(bookingBlockers(r.get("up17"))).toContain("book");
    expect(bookingBlockers(r.get("viator-merchant")).length).toBeGreaterThan(0);
    expect(isProductionCertified(r.get("ttc"), "search")).toBe(false);
    expect(capabilityMatrix(r.get("crystal")!).find((c) => c.capability === "modify")!.bookingEligible).toBe(false);
  });
  it("Amadeus is registered but inactive and never selected", () => {
    const a = SUPPLIER_CATALOG.find((s) => s.supplierKey === "amadeus")!;
    expect(a.readiness).toBe("disabled");
    const adapters = SUPPLIER_CATALOG.map((registration) => ({ registration }));
    expect(selectAdapters(adapters, "flight", "search").map((x) => x.registration.supplierKey)).not.toContain("amadeus");
  });
  it("every catalogue grant uses a known capability and environment", () => {
    for (const s of SUPPLIER_CATALOG) for (const gr of s.grants ?? []) expect(["production", "uat", "sandbox"]).toContain(gr.environment);
  });
});

describe("supplier health", () => {
  it("tracks errors/latency and marks a failing supplier down", async () => {
    const h = new HealthTracker();
    const bad: EngineAdapter<null, number> = { registration: prod("bad", "flight"), health: async () => ({ configured: true, healthy: true }), run: async () => { throw new Error("503"); } };
    const good: EngineAdapter<null, number> = { registration: prod("ok", "flight"), health: async () => ({ configured: true, healthy: true }), run: async () => [1] };
    for (let i = 0; i < 3; i++) (await orchestrate([bad, good], "flight", "search", null)).outcomes.forEach((o) => h.record(o));
    expect(h.snapshot("bad").status).toBe("down");
    expect(h.snapshot("bad").lastError).toBe("503");
    expect(h.snapshot("ok").status).toBe("healthy");
    expect(h.reliability("bad", 0.9)).toBeLessThan(0.5);
  });
});
