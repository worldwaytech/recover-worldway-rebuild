import { describe, it, expect } from "vitest";
import { toRequirements, planEdits, type ExtractedIntent } from "../intent";
import { safeUrl } from "../sources.server";
import { buildFacts, deterministicExplanation } from "../explain";
import { verifyNarrative } from "@/lib/engine/intelligence/explain";

const base: ExtractedIntent = { intent: "new_trip", origin: "DEL", destinations: ["London"], departFrom: "2026-12-10", returnBy: "2026-12-17", adults: 2, children: null,
  budgetAmount: null, budgetCurrency: null, luxuryLevel: null, interests: ["museums"], pace: null, edits: [], question: null };

describe("AI requirement extraction is post-processed deterministically", () => {
  it("builds requirements, fills from consented DNA only", () => {
    const r = toRequirements(base, { consent: { preferences: true, history: false }, interests: ["wine"], avoid: [], luxuryLevel: 5 }, "2026-10-01");
    expect(r.requirements).toMatchObject({ origin: "DEL", adults: 2, children: 0, luxuryLevel: 5, interests: ["museums", "wine"] });
    const n = toRequirements(base, { consent: { preferences: false, history: false }, interests: ["wine"], avoid: [], luxuryLevel: 5 }, "2026-10-01");
    expect(n.requirements!.luxuryLevel).toBe(3);
    expect(n.requirements!.interests).toEqual(["museums"]);
  });
  it("detects missing information and invalid dates instead of guessing", () => {
    const r = toRequirements({ ...base, origin: null, departFrom: "next month", adults: null }, undefined, "2026-10-01");
    expect(r.requirements).toBeNull();
    expect(r.missing).toEqual(expect.arrayContaining(["origin", "departFrom", "adults"]));
    expect(r.questions.length).toBe(3);
    expect(toRequirements({ ...base, departFrom: "2020-01-01" }, undefined, "2026-10-01").problems).toContain("departFrom is in the past");
  });
  it("edits: only real component refs are simulated; new inventory must come from live search", () => {
    const plans = planEdits([
      { action: "remove", componentRef: "A1", productType: "activity", detail: "drop the tour" },
      { action: "remove", componentRef: "INVENTED", productType: null, detail: "x" },
      { action: "replace", componentRef: "H1", productType: "hotel", detail: "a nicer hotel" },
      { action: "rollback", componentRef: null, productType: null, detail: "go back to version 1" },
    ], ["A1", "H1"], 3);
    expect(plans.map((p) => p.kind)).toEqual(["simulate", "unresolved", "needs_inventory", "simulate"]);
  });
});

describe("grounding + safety", () => {
  it("explanations only allow engine facts", () => {
    const f = buildFacts({ current_version: 2, currency: "INR", state: "draft" }, { bookable: false, pricing: { total: 5460, currency: "INR" }, issues: [], graph: [{ kind: "flight" }] }, null);
    expect(verifyNarrative("Your total is 5460.00 INR.", f.allowed).ok).toBe(true);
    expect(verifyNarrative("Only 4999 today!", f.allowed).ok).toBe(false);
    expect(deterministicExplanation(f)).toMatch(/not yet bookable/);
  });
  it("blocks unsafe URLs", () => {
    expect(() => safeUrl("http://example.com")).toThrow();
    expect(() => safeUrl("https://127.0.0.1/x")).toThrow();
    expect(() => safeUrl("https://192.168.1.2/")).toThrow();
    expect(safeUrl("https://example.com/trip").hostname).toBe("example.com");
  });
});
