import { describe, expect, it } from "vitest";
import { addTraceSink } from "../../router/telemetry";
import { OrchestrationTraceCollector, sanitizeOrchestrationEvidence } from "../orchestration-trace";

describe("orchestration trace evidence", () => {
  it("accepts only bounded opaque evidence references", () => {
    const result = sanitizeOrchestrationEvidence([
      { source: "travel-graph", reference: "edge:ist:123", observedAt: "2026-10-03T00:00:00Z", confidence: 1 },
      { source: "invalid", reference: "person@example.com", observedAt: "2026-10-03T00:00:00Z", confidence: 1 },
      { source: "invalid", reference: "abc", observedAt: "2026-10-03T00:00:00Z", confidence: 2 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].reference).toBe("edge:ist:123");
    expect(result[1].reference).toBe("abc");
    expect(result[1].confidence).toBe(1);
  });

  it("rejects future-dated and inconsistent expiry evidence", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    const result = sanitizeOrchestrationEvidence([
      { source: "test", reference: "future", observedAt: "2026-10-04T00:00:00Z", confidence: 1 },
      { source: "test", reference: "bad-expiry", observedAt: "2026-10-03T10:00:00Z", expiresAt: "2026-10-03T09:00:00Z", confidence: 1 },
      { source: "test", reference: "valid", observedAt: "2026-10-03T10:00:00Z", expiresAt: "2026-10-03T13:00:00Z", confidence: 1 },
    ], now);
    expect(result.map((item) => item.reference)).toEqual(["valid"]);
  });

  it("records lifecycle and provenance without payloads", () => {
    const events: unknown[] = [];
    const off = addTraceSink((event) => events.push(event));
    const trace = new OrchestrationTraceCollector("corr-1", "session-1");
    trace.taskStarted("search", "tool", "2026-10-03T00:00:00Z");
    trace.taskFinished("search", "completed", "2026-10-03T00:00:01Z", {
      evidence: [{ source: "inventory", reference: "offer:123", observedAt: "2026-10-03T00:00:00Z", confidence: 0.95 }],
      payload: "not-traced",
    });
    off();
    const snapshot = trace.snapshot();
    expect(snapshot.evidence[0].items[0].reference).toBe("offer:123");
    expect(JSON.stringify(snapshot)).not.toContain("not-traced");
    expect(events.some((event: any) => event.type === "orchestration.evidence")).toBe(true);
  });

  it("bounds provenance volume", () => {
    const evidence = Array.from({ length: 40 }, (_, i) => ({
      source: "inventory", reference: "offer:" + i, observedAt: "2026-10-03T00:00:00Z", confidence: 0.5,
    }));
    expect(sanitizeOrchestrationEvidence(evidence)).toHaveLength(32);
  });
});
