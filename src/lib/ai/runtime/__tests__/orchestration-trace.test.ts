import { describe, expect, it, vi } from "vitest";
import { addTraceSink } from "../../router/telemetry";
import { OrchestrationTraceCollector, sanitizeOrchestrationEvidence } from "../orchestration-trace";

describe("orchestration trace evidence", () => {
  it("accepts only bounded opaque evidence references", () => {
    const result = sanitizeOrchestrationEvidence([
      { source: "travel-graph", reference: "edge:ist:123", observedAt: "2026-10-03T00:00:00Z", confidence: 1 },
      { source: "invalid", reference: "person@example.com", observedAt: "2026-10-03T00:00:00Z", confidence: 1 },
      { source: "invalid", reference: "abc", observedAt: "2026-10-03T00:00:00Z", confidence: 2 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("edge:ist:123");
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
