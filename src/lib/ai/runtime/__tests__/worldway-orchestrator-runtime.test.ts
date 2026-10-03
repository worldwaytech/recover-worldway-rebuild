import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../tools/fabric";
import { buildWorldwayOrchestrationContext } from "../context-bridge";
import { EMPTY_TRAVELER_PROFILE, buildPersonalizationContext } from "../../../engine/intelligence/traveler-profile";
import { createWorldwayOrchestratorRuntime } from "../worldway-orchestrator-runtime";

function context() {
  const consent = { preferences: true, history: true };
  return buildWorldwayOrchestrationContext({
    base: {
      sessionId: "session-test", facts: {},
      toolContext: { correlationId: "wwai-test", context: "agent_runtime" as const, principal: { permission: "public" as const, scopes: [] } },
    },
    traveller: {
      travellerId: "traveller-test", consent,
      profile: EMPTY_TRAVELER_PROFILE,
      personalization: buildPersonalizationContext(EMPTY_TRAVELER_PROFILE, consent, []),
      memories: [],
    },
  });
}

describe("Worldway specialist orchestration runtime", () => {
  it("routes specialist tasks through the bounded registry", async () => {
    const runtime = createWorldwayOrchestratorRuntime({ tools: new ToolRegistry() });
    runtime.specialists.register("destination_intelligence", {
      handle: async (invocation, specialistContext) => ({
        recommendation: "shoulder",
        objective: invocation.objective,
        travellerId: specialistContext.traveller.travellerId,
        evidence: [{ source: "destination_knowledge", reference: "dest:ist:season", observedAt: "2026-10-03T00:00:00Z", confidence: 0.9 }],
      }),
    });

    const result = await runtime.orchestrator.run({
      goal: "destination analysis",
      tasks: [{
        id: "destination",
        kind: "specialist",
        specialist: "destination_intelligence",
        input: { objective: "analyse destination timing" },
      }],
    }, context());

    expect(result.ok).toBe(true);
    expect(result.results[0].result).toMatchObject({
      specialist: "destination_intelligence",
      state: "completed",
      output: { recommendation: "shoulder", travellerId: "traveller-test" },
      evidence: [{ reference: "dest:ist:season" }],
    });
    expect(result.trace.evidence[0].items[0].reference).toBe("dest:ist:season");
  });

  it("routes model tasks through the explicit model boundary", async () => {
    const calls: unknown[] = [];
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      model: { router: { env: { LOVABLE_API_KEY: "test-key" } }, invoke: async (model, task, input, correlationId) => {
        calls.push({ model, task, input, correlationId });
        return { model: model.id, task, correlationId };
      } },
    });

    const result = await runtime.orchestrator.run({
      goal: "model analysis",
      tasks: [{ id: "model-step", kind: "model", modelTask: "concierge_chat", input: { prompt: "analyse itinerary" } }],
    }, context());

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ task: "concierge_chat", input: { prompt: "analyse itinerary" }, correlationId: "wwai-test" });
    expect(result.results[0].result).toMatchObject({ task: "concierge_chat", correlationId: "wwai-test" });
  });

  it("blocks model tasks when the routed model boundary is not configured", async () => {
    const runtime = createWorldwayOrchestratorRuntime({ tools: new ToolRegistry() });
    const result = await runtime.orchestrator.run({
      goal: "model analysis",
      tasks: [{ id: "model-step", kind: "model", modelTask: "concierge_chat", input: { prompt: "analyse itinerary" } }],
    }, context());
    expect(result.ok).toBe(false);
    expect(result.results[0].state).toBe("failed");
    expect(result.results[0].error).toBe("model_executor_not_configured");
  });

  it("keeps specialist execution separate from Tool Fabric mutations", async () => {
    const runtime = createWorldwayOrchestratorRuntime({ tools: new ToolRegistry() });
    runtime.specialists.register("booking_fulfilment", {
      handle: async () => ({ readiness: "review_only" }),
    });

    const result = await runtime.orchestrator.run({
      goal: "booking readiness analysis",
      tasks: [{
        id: "booking",
        kind: "specialist",
        specialist: "booking_fulfilment",
        input: { objective: "assess readiness" },
      }],
    }, context());

    expect(result.ok).toBe(true);
    expect(result.results[0].result).toMatchObject({
      output: { readiness: "review_only" },
    });
  });
});
