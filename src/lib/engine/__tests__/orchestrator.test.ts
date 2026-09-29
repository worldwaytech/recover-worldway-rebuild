import { describe, it, expect } from "vitest";
import { orchestrate, selectAdapters, type EngineAdapter } from "../orchestrator";

const mk = (key: string, o: Partial<{ readiness: any; health: boolean; fail: boolean; rows: number[] }> = {}): EngineAdapter<null, number> => ({
  registration: { supplierKey: key, kinds: ["flight"], capabilities: ["search"], readiness: o.readiness ?? "production", reliability: 0.5 },
  health: async () => ({ configured: true, healthy: o.health ?? true }),
  run: async () => { if (o.fail) throw new Error("boom"); return o.rows ?? [1]; },
});

describe("orchestrator", () => {
  it("never selects blocked adapters", () => {
    expect(selectAdapters([mk("a", { readiness: "blocked" }), mk("b")], "flight", "search").map((a) => a.registration.supplierKey)).toEqual(["b"]);
  });
  it("fails over when one adapter errors or is unhealthy", async () => {
    const r = await orchestrate([mk("a", { fail: true }), mk("b", { rows: [7] }), mk("c", { health: false })], "flight", "search", null);
    expect(r.results).toEqual([7]);
    expect(Object.fromEntries(r.outcomes.map((o) => [o.supplierKey, o.status]))).toEqual({ a: "failed", b: "used", c: "skipped" });
  });
});
