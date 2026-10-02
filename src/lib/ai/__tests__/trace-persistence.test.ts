import { describe, expect, it } from "vitest";
import { traceEventToRow } from "../router/trace-persistence.server";

describe("AI trace persistence", () => {
  it("keeps only safe operational fields", () => {
    const row = traceEventToRow({
      type: "model.call",
      correlationId: "wwai-test",
      actor: "not-a-user-id",
      task: "travel-planning",
      provider: "test-provider",
      model: "test-model",
      ms: 42,
      inputTokens: 10,
      outputTokens: 20,
      costCredits: 0.12,
      validation: "passed",
      meta: { safe: "ok" },
      at: "2026-10-02T00:00:00.000Z",
    });

    expect(row.actor_id).toBeNull();
    expect(row.request_id).toBe("wwai-test");
    expect(row.latency_ms).toBe(42);
    expect(row.input_tokens).toBe(10);
    expect(row.output_tokens).toBe(20);
    expect(row.metadata).toEqual({ safe: "ok" });
  });

  it("never turns an email-shaped actor into an actor id", () => {
    const row = traceEventToRow({
      type: "tool.call",
      correlationId: "wwai-test",
      actor: "customer@example.com",
      tool: "search_hotels",
      risk: "SEARCH",
      at: "2026-10-02T00:00:00.000Z",
    });

    expect(row.actor_id).toBeNull();
    expect(row.tool_names).toEqual(["search_hotels"]);
    expect(row.tool_risks).toEqual(["SEARCH"]);
  });
});
