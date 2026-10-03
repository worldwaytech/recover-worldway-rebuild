import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../tools/fabric";
import { createWorldwayOrchestratorRuntime } from "../worldway-orchestrator-runtime";

const context = () => ({
  sessionId: "session-test",
  facts: {},
  toolContext: {
    correlationId: "wwai-test",
    context: "agent_runtime" as const,
    principal: { permission: "public" as const, scopes: [] },
  },
});

describe("Worldway specialist orchestration runtime", () => {
  it("routes specialist tasks through the bounded registry", async () => {
    const runtime = createWorldwayOrchestratorRuntime({ tools: new ToolRegistry() });
    runtime.specialists.register("destination_intelligence", {
      handle: async (invocation) => ({ recommendation: "shoulder", objective: invocation.objective }),
    });
    const result = await runtime.orchestrator.run({
      goal: "destination analysis",
      tasks: [{ id: "destination", kind: "specialist", specialist: "destination_intelligence", input: { objective: "analyse destination timing" } }],
    }, context());
    expect(result.ok).toBe(true);
    expect(result.results[0].result).toMatchObject({ specialist: "destination_intelligence", state: "completed", output: { recommendation: "shoulder" } });
  });

  it("keeps specialist execution separate from Tool Fabric mutations", async () => {
    const runtime = createWorldwayOrchestratorRuntime({ tools: new ToolRegistry() });
    runtime.specialists.register("booking_fulfilment", { handle: async () => ({ readiness: "review_only" }) });
    const result = await runtime.orchestrator.run({
      goal: "booking readiness analysis",
      tasks: [{ id: "booking", kind: "specialist", specialist: "booking_fulfilment", input: { objective: "assess readiness" } }],
    }, context());
    expect(result.ok).toBe(true);
    expect(result.results[0].result).toMatchObject({ output: { readiness: "review_only" } });
  });
});
