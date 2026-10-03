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
    expect(good.journeySegments.map((s) => [s.fromPlace, s.toPlace, s.mode, s.continuity])).toEqual([
      ["LHR", "LHR", "transfer", "continuous"],
      ["LON", "LON", "activity", "continuous"],
    ]);
    expect(good.journeySegments[0]?.gapMinutes).toBe(60);
    expect(good.bookable).toBe(true);
    expect(good.pricing!.total).toBeGreaterThan(0);
    expect(bad.issues.some((i) => i.code === "hotel-date-mismatch")).toBe(true);
    expect(bad.bookable).toBe(false);
  });

  it("marks the deterministic Phase 7 optimized shortlist without removing ranked candidates", () => {
    const candidates = [100, 120, 140, 160].map((amount, index) => ({
      id: `opt-${index + 1}`,
      offers: [
        flight,
        transfer,
        { ...hotel("2026-10-11T14:00:00Z"), externalId: `H-opt-${index + 1}`, net: { amount, currency: "GBP" } },
      ],
    }));
    const out = runPackagePipeline(base(candidates));
    expect(out).toHaveLength(4);
    expect(out.filter((p) => p.optimized)).toHaveLength(3);
    expect(out.filter((p) => p.optimized).map((p) => p.id)).toEqual(["opt-1", "opt-2", "opt-3"]);
    const disabled = runPackagePipeline({ ...base(candidates), optimization: { enabled: false } });
    expect(disabled.every((p) => p.optimized)).toBe(true);
  });

  it("consumes a bounded optimization profile while keeping deterministic selection and booking authority", () => {
    const candidates = [
      {
        id: "a-standard",
        offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), { ...activity, externalId: "A-standard", title: "Standard Tour" }],
      },
      {
        id: "z-preferred",
        offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), { ...activity, externalId: "A-preferred", title: "Preferred Activity" }],
      },
    ];
    const out = runPackagePipeline({
      ...base(candidates),
      optimization: {
        limit: 1,
        profile: { weights: { preference: 1 }, kindPreferences: { activity: 1 }, interests: ["preferred"] },
      },
    });
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.id === "z-preferred")!.optimized).toBe(true);
    expect(out.find((p) => p.id === "a-standard")!.optimized).toBe(false);
    expect(out.every((p) => p.bookable)).toBe(true);

    const blocked = runPackagePipeline({
      ...base([{
        id: "blocked",
        offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), activity],
      }]),
      optimization: {
        limit: 1,
        profile: { weights: { preference: 1 }, kindPreferences: { activity: 1 } },
      },
      orchestration: {
        trip: base(candidates).requirements,
        requiredKinds: ["flight", "insurance"],
        preferredKinds: ["activity"],
        optionalKinds: [],
        insurance: "required",
        visa: "not-requested",
      },
    });
    expect(blocked[0]!.optimized).toBe(true);
    expect(blocked[0]!.bookable).toBe(false);
    expect(blocked[0]!.issues.some((issue) => issue.code === "missing-required-product" && /insurance/i.test(issue.message))).toBe(true);
  });

  it("consumes bounded ranking profile without changing deterministic booking authority", () => {
    const candidates = [
      { id: "luxury", offers: [flight, transfer, { ...hotel("2026-10-11T14:00:00Z"), externalId: "H-luxury", quality: 5 }] },
      { id: "reliable", offers: [flight, transfer, { ...hotel("2026-10-11T14:00:00Z", "low"), externalId: "H-reliable", quality: 3 }] },
    ];
    const reliabilityRegistry = new Map(reg).set("low", { ...prod("low", "stay"), reliability: 0.1 });
    const luxury = runPackagePipeline({ ...base(candidates), registry: reliabilityRegistry, ranking: { weights: { luxury: 1 } } });
    const reliabilityWeighted = runPackagePipeline({ ...base(candidates), registry: reliabilityRegistry, ranking: { weights: { reliability: 1 } } });
    expect(luxury[0]!.id).toBe("luxury");
    expect(reliabilityWeighted[0]!.id).toBe("luxury");
    expect(reliabilityWeighted.find((p) => p.id === "reliable")!.bookable).toBe(true);
    expect(luxury.find((p) => p.id === "reliable")!.bookable).toBe(true);
  });


  it("consumes bounded pricing signals while preserving deterministic pricing policy", () => {
    const candidate = { id: "dynamic-price", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z")] };
    const policy = {
      currency: "USD" as const,
      channel: "customer_b2c" as const,
      baseRule: { markupPercent: 10, commissionPercent: 0, serviceFee: 0 },
      minimumMarginPercent: 5,
      maxDynamicMarkupDeltaPercent: 10,
    };
    const baseline = runPackagePipeline({ ...base([candidate]), pricingPolicy: policy, pricingNow: "2026-10-03T00:00:00Z" });
    const signaled = runPackagePipeline({
      ...base([candidate]),
      pricingPolicy: policy,
      pricingSignalsFor: () => ({ demandIndex: 0.9, inventoryPressure: 0.9, conversionIndex: 0.9, leadTimeDays: 1 }),
      pricingNow: "2026-10-03T00:00:00Z",
    });
    expect(signaled[0]!.pricing!.total).toBeGreaterThan(baseline[0]!.pricing!.total);
    expect(signaled[0]!.pricing!.total).toBeLessThan(baseline[0]!.pricing!.total * 1.11);
    expect(signaled[0]!.bookable).toBe(true);
  });
  it("audits bounded decision consumption across ranking, pricing and orchestration without changing commerce authority", () => {
    const candidate = {
      id: "decision-audit",
      offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), activity],
    };
    const profile = {
      trip: base([candidate]).requirements,
      requiredKinds: ["flight" as const],
      preferredKinds: ["activity" as const],
      optionalKinds: [],
      insurance: "not-requested" as const,
      visa: "not-requested" as const,
    };
    const policy = {
      currency: "USD" as const,
      channel: "customer_b2c" as const,
      baseRule: { markupPercent: 10, commissionPercent: 0, serviceFee: 0 },
      minimumMarginPercent: 5,
      maxDynamicMarkupDeltaPercent: 10,
    };
    const out = runPackagePipeline({
      ...base([candidate]),
      orchestration: profile,
      ranking: { weights: { preference: 1, luxury: 0.5 } },
      pricingPolicy: policy,
      pricingSignalsFor: () => ({ demandIndex: 0.8, inventoryPressure: 0.7, conversionIndex: 0.6, leadTimeDays: 2 }),
      pricingNow: "2026-10-03T00:00:00Z",
    });
    const pkg = out[0]!;

    expect(pkg.bookable).toBe(true);
    expect(pkg.optimized).toBe(true);
    expect(pkg.pricing).not.toBeNull();
    expect(pkg.pricing!.total).toBeGreaterThan(0);
    expect(pkg.issues.some((issue) => issue.code === "missing-required-product")).toBe(false);
    expect(pkg.graph.map((item) => item.kind)).toEqual(["flight", "transfer", "stay", "activity"]);
    expect(pkg.itinerary.length).toBeGreaterThan(0);
  });

  it("keeps deterministic hard requirements authoritative when preference inputs are present", () => {
    const candidate = {
      id: "hard-requirement-audit",
      offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), activity],
    };
    const profile = {
      trip: base([candidate]).requirements,
      requiredKinds: ["flight" as const, "insurance" as const],
      preferredKinds: ["activity" as const],
      optionalKinds: [],
      insurance: "required" as const,
      visa: "not-requested" as const,
    };
    const [pkg] = runPackagePipeline({ ...base([candidate]), orchestration: profile, ranking: { weights: { preference: 1 } } });
    expect(pkg!.issues.some((issue) => issue.code === "missing-required-product" && /insurance/i.test(issue.message))).toBe(true);
    expect(pkg!.bookable).toBe(false);
  });

  it("blocks a package that falls outside the requested trip window", () => {
    const lateReturn = { ...flight, externalId: "F-late", start: { ...flight.start, at: "2026-10-16T03:30:00Z" }, end: { ...flight.end, at: "2026-10-16T11:00:00Z" } };
    const out = runPackagePipeline(base([
      { id: "late-return", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), lateReturn] },
    ]));
    const pkg = out[0]!;
    expect(pkg.issues.some((i) => i.code === "outside-trip-window")).toBe(true);
    expect(pkg.bookable).toBe(false);
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


  it("propagates canonical chronology violations into package readiness", () => {
    const overlappingActivity: CanonicalOffer = {
      ...activity,
      externalId: "A-overlap",
      start: { ...activity.start, at: "2026-10-12T10:00:00Z" },
      end: { ...activity.end, at: "2026-10-12T13:00:00Z" },
    };
    const out = runPackagePipeline(base([
      { id: "chronology-invalid", offers: [flight, transfer, hotel("2026-10-11T14:00:00Z"), activity, overlappingActivity] },
    ]));
    const pkg = out[0]!;
    expect(pkg.issues.some((i) => i.code === "overlap")).toBe(true);
    expect(pkg.bookable).toBe(false);
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

import { snapshotFromEvents } from "../suppliers/health-store.server";
describe("persisted supplier health", () => {
  it("rebuilds the same snapshot from stored events after a restart", () => {
    const rows = ["used", "failed", "failed", "failed"].map((outcome, i) => ({ supplier_key: "x", outcome, latency_ms: 100 * (i + 1), detail: outcome === "failed" ? "503" : null, created_at: `2026-09-29T00:0${i}:00Z` }));
    const { snapshot, reliability } = snapshotFromEvents("x", rows, 0.9);
    expect(snapshot.status).toBe("down");
    expect(snapshot.calls).toBe(4);
    expect(snapshot.lastError).toBe("503");
    expect(reliability).toBeLessThan(0.9);
  });
  it("only Crystal is production-bookable in the catalogue", () => {
    expect(SUPPLIER_CATALOG.filter((s) => bookingBlockers(s).length === 0).map((s) => s.supplierKey)).toEqual(["crystal"]);
  });
});
