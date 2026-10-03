import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../tools/fabric";
import { buildWorldwayOrchestrationContext } from "../context-bridge";
import { EMPTY_TRAVELER_PROFILE, buildPersonalizationContext } from "../../../engine/intelligence/traveler-profile";
import { createWorldwayOrchestratorRuntime } from "../worldway-orchestrator-runtime";
import type { NormalizedComponent } from "../../../engine/types";

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
      }, validateOutput: (_task, value) => {
        const output = value as Record<string, unknown>;
        return typeof output?.task === "string" && typeof output?.correlationId === "string" ? { output, evidence: [{ source: "model-test", reference: "model:validated", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }] } : null;
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
    expect(result.trace.evidence[0].items[0].reference).toBe("model:validated");
  });

  it("fails closed when model output does not pass validation", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      model: { router: { env: { LOVABLE_API_KEY: "test-key" } }, invoke: async () => ({ unsafe: true }), validateOutput: () => null },
    });
    const result = await runtime.orchestrator.run({
      goal: "model analysis",
      tasks: [{ id: "model-step", kind: "model", modelTask: "concierge_chat", input: { prompt: "analyse itinerary" } }],
    }, context());
    expect(result.ok).toBe(false);
    expect(result.results[0].state).toBe("failed");
    expect(result.results[0].error).toContain("Model output validation failed");
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
  it("accepts only a validated decision contract at the deterministic runtime boundary", async () => {
    const runtime = createWorldwayOrchestratorRuntime({ tools: new ToolRegistry(), deterministic: async (task) => task.input });
    const result = await runtime.orchestrator.run({
      goal: "validated decision",
      tasks: [{ id: "decision-step", kind: "deterministic", acceptedDecisionKinds: ["recommendation"], input: {
        decisionContract: {
          contractVersion: "1.0", decisionKind: "recommendation", decision: "use itinerary", confidence: 0.9,
          evidence: [{ source: "runtime-test", reference: "decision:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
          correlationId: "wwai-test", sourceTaskId: "decision-step", constraints: [], expiresAt: "2099-01-01T00:00:00Z",
        },
      }}],
    }, context());
    expect(result.ok).toBe(true);
    expect(result.results[0].result).toMatchObject({ decisionContract: { decision: "use itinerary", sourceTaskId: "decision-step" } });
  });

  it("projects a validated ranking decision contract into bounded engine ranking input", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => task.input,
    });
    const result = await runtime.orchestrator.run({
      goal: "ranking decision",
      tasks: [{
        id: "decision-step",
        kind: "deterministic",
        metadata: { decisionContractProjection: "ranking" },
        acceptedDecisionKinds: ["ranking"],
        input: {
          decisionContract: {
            contractVersion: "1.0", decisionKind: "ranking", decision: "rank luxury options", confidence: 0.9,
            evidence: [{ source: "runtime-test", reference: "ranking:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test", sourceTaskId: "decision-step",
            constraints: ["ranking.weight.luxury=0.8", "ranking.weight.price=1", "ranking.weight.unknown=0.9"],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(true);
    expect(result.results[0].result).toMatchObject({
      rankingProfile: { weights: { luxury: 0.8, price: 1 } },
    });
    expect((result.results[0].result as Record<string, unknown>).rankingProfile).not.toHaveProperty("weights.unknown");
  });

  it("projects only bounded optimization preferences into deterministic optimization input", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => task.input,
    });
    const result = await runtime.orchestrator.run({
      goal: "optimization decision",
      tasks: [{
        id: "decision-step",
        kind: "deterministic",
        metadata: { decisionContractProjection: "optimization" },
        acceptedDecisionKinds: ["recommendation"],
        input: {
          decisionContract: {
            contractVersion: "1.0", decisionKind: "recommendation", decision: "prefer experiences", confidence: 0.9,
            evidence: [{ source: "runtime-test", reference: "optimization:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test", sourceTaskId: "decision-step",
            constraints: [
              "optimization.weight.preference=1",
              "optimization.preference.kind.activity=1",
              "optimization.limit=1",
              "optimization.select.package=preferred",
              "optimization.weight.unknown=0.9",
            ],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(true);
    const output = result.results[0].result as Record<string, any>;
    expect(output.optimizationProfile).toEqual({
      weights: { preference: 1 },
      kindPreferences: { activity: 1 },
    });
    expect(output.optimizationProfile).not.toHaveProperty("limit");
    expect(output.optimizationProfile).not.toHaveProperty("select");
  });

  it("projects post-booking modification through the deterministic boundary", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => task.input,
    });
    const component = {
      id: "flight-1",
      kind: "flight" as const,
      supplierKey: "air",
      externalId: "F1",
      title: "DEL-IST",
      amount: 500,
      currency: "USD",
    };
    const result = await runtime.orchestrator.run({
      goal: "post-booking modification",
      tasks: [{
        id: "modify-step",
        kind: "deterministic",
        metadata: { decisionContractProjection: "post-booking-modification" },
        acceptedDecisionKinds: ["recommendation"],
        input: {
          bookingId: "WWB-t1-1",
          bookingStatus: "Ticketed",
          bookingComponents: [component],
          supplierCapabilities: { air: ["modify", "revalidate"] },
          decisionContract: {
            contractVersion: "1.0", decisionKind: "recommendation", decision: "move the flight", confidence: 0.9,
            evidence: [{ source: "runtime-test", reference: "modify:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test", sourceTaskId: "modify-step",
            constraints: [
              "postbooking.modification.component=flight-1",
              "postbooking.modification.date=2026-10-20",
              "postbooking.modification.amount=999999",
              "postbooking.modification.providerRef=unsafe",
            ],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(true);
    const output = result.results[0].result as Record<string, any>;
    expect(output.modificationIntent.componentIds).toEqual(["flight-1"]);
    expect(output.modificationIntent.changes).toEqual({ date: "2026-10-20" });
    expect(output.modificationIntent.readiness.ready).toBe(true);
    expect(output.modificationIntent.requiresRevalidation).toBe(true);
    expect(output.modificationIntent.requiresCommercialRequote).toBe(true);
    expect(output.modificationIntent.requiresApproval).toBe(true);
  });

  it("consumes bounded orchestration preferences without changing hard requirements", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => task.input,
    });
    const result = await runtime.orchestrator.run({
      goal: "orchestration preference decision",
      tasks: [{
        id: "decision-step",
        kind: "deterministic",
        metadata: { decisionContractProjection: "orchestration" },
        acceptedDecisionKinds: ["recommendation"],
        input: {
          orchestration: {
            trip: { origin: "DEL", destinations: ["IST"], departFrom: "2026-10-20", returnBy: "2026-10-28", adults: 2, children: 0, luxuryLevel: 5, interests: [] },
            requiredKinds: ["flight"],
            preferredKinds: ["stay"],
            optionalKinds: [],
            insurance: "not-requested",
            visa: "not-requested",
          },
          decisionContract: {
            contractVersion: "1.0", decisionKind: "recommendation", decision: "prefer experiences", confidence: 0.9,
            evidence: [{ source: "runtime-test", reference: "orchestration:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test", sourceTaskId: "decision-step",
            constraints: ["orchestration.prefer.kind.activity", "orchestration.prefer.kind.flight"],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(true);
    const output = result.results[0].result as Record<string, unknown>;
    expect(output.orchestrationPreferences).toEqual({ preferredKinds: ["activity", "flight"] });
    expect((output.orchestration as { requiredKinds: string[]; preferredKinds: string[] }).requiredKinds).toEqual(["flight"]);
    expect((output.orchestration as { preferredKinds: string[] }).preferredKinds).toEqual(["stay", "activity", "flight"]);
  });

  it("keeps pricing advisory signals bounded and rejects authority-shaped fields", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => task.input,
    });
    const result = await runtime.orchestrator.run({
      goal: "pricing boundary",
      tasks: [{
        id: "pricing-step",
        kind: "deterministic",
        metadata: { decisionContractProjection: "pricing" },
        acceptedDecisionKinds: ["recommendation"],
        input: {
          decisionContract: {
            contractVersion: "1.0", decisionKind: "recommendation", decision: "pricing guidance", confidence: 0.9,
            evidence: [{ source: "runtime-test", reference: "pricing:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test", sourceTaskId: "pricing-step",
            constraints: [
              "pricing.signal.demandIndex=0.8",
              "pricing.signal.inventoryPressure=1",
              "pricing.signal.leadTimeDays=30",
              "pricing.amount=1",
              "pricing.currency=INR",
              "pricing.finalQuote=999",
            ],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(true);
    const output = result.results[0].result as Record<string, any>;
    expect(output.pricingSignals).toEqual({
      demandIndex: 0.8,
      inventoryPressure: 1,
      leadTimeDays: 30,
    });
    expect(output.pricingSignals).not.toHaveProperty("amount");
    expect(output.pricingSignals).not.toHaveProperty("finalQuote");
    expect(output.pricingSignals).not.toHaveProperty("currency");
  });

  it("keeps orchestration preferences additive and cannot alter hard requirements", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => task.input,
    });
    const result = await runtime.orchestrator.run({
      goal: "orchestration boundary",
      tasks: [{
        id: "orchestration-step",
        kind: "deterministic",
        metadata: { decisionContractProjection: "orchestration" },
        acceptedDecisionKinds: ["recommendation"],
        input: {
          orchestration: {
            trip: { origin: "DEL", destinations: ["IST"], departFrom: "2026-10-20", returnBy: "2026-10-28", adults: 2, children: 0, luxuryLevel: 5, interests: [] },
            requiredKinds: ["flight"],
            preferredKinds: ["stay"],
            optionalKinds: [],
            insurance: "not-requested",
            visa: "not-requested",
          },
          decisionContract: {
            contractVersion: "1.0", decisionKind: "recommendation", decision: "preference guidance", confidence: 0.9,
            evidence: [{ source: "runtime-test", reference: "orchestration:authority:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test", sourceTaskId: "orchestration-step",
            constraints: [
              "orchestration.prefer.kind.activity",
              "orchestration.required.kind.cruise",
              "orchestration.insurance.required=true",
            ],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(true);
    const output = result.results[0].result as Record<string, any>;
    expect(output.orchestration.requiredKinds).toEqual(["flight"]);
    expect(output.orchestration.preferredKinds).toEqual(["stay", "activity"]);
    expect(output.orchestration.insurance).toBe("not-requested");
    expect(output.orchestration).not.toHaveProperty("requiredKinds.1");
  });

  it("uses the deterministic booking readiness engine without granting booking authority", async () => {
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => task.input,
    });
    const component: NormalizedComponent = {
      id: "flight-1",
      kind: "flight",
      supplierKey: "air",
      externalId: "F1",
      title: "DEL-IST",
      net: { amount: 500, currency: "USD" },
      taxes: { amount: 50, currency: "USD" },
      cancellation: { refundable: true },
      start: { at: "2026-10-20T05:00:00Z", timezone: "Asia/Kolkata", place: "DEL" },
      end: { at: "2026-10-20T10:00:00Z", timezone: "Europe/Istanbul", place: "IST" },
    };
    const result = await runtime.orchestrator.run({
      goal: "booking readiness",
      tasks: [{
        id: "booking-readiness",
        kind: "deterministic",
        metadata: { decisionContractProjection: "booking-readiness" },
        acceptedDecisionKinds: ["recommendation"],
        input: {
          bookingComponents: [component],
          supplierCapabilities: { air: ["revalidate"] },
          decisionContract: {
            contractVersion: "1.0", decisionKind: "recommendation", decision: "prepare booking readiness check", confidence: 0.9,
            evidence: [{ source: "runtime-test", reference: "booking:readiness:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test", sourceTaskId: "booking-readiness",
            constraints: ["booking.readiness.check=true", "booking.capability.book=true"],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(true);
    const output = result.results[0].result as Record<string, any>;
    expect(output.bookingReadiness.request).toEqual({ check: true });
    expect(output.bookingReadiness.readiness.ready).toBe(false);
    expect(output.bookingReadiness.readiness.reasons).toContain("flight-1: supplier booking capability missing");
  });

  it("rejects legacy raw model decisions before deterministic execution", async () => {
    let executed = false;
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => { executed = true; return task.input; },
    });
    const result = await runtime.orchestrator.run({
      goal: "raw model decision",
      tasks: [{ id: "decision-step", kind: "deterministic", acceptedDecisionKinds: ["recommendation"], input: {
        modelDecision: { decision: "use itinerary", confidence: 0.9, evidence: [] },
      }}],
    }, context());
    expect(result.ok).toBe(false);
    expect(executed).toBe(false);
    expect(result.results[0].error).toContain("raw_model_decision_rejected");
  });

  it("rejects malformed structurally unsafe contracts before deterministic execution", async () => {
    let executed = false;
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => { executed = true; return task.input; },
    });

    const result = await runtime.orchestrator.run({
      goal: "malformed decision",
      tasks: [{
        id: "decision-step",
        kind: "deterministic",
        acceptedDecisionKinds: ["recommendation"],
        input: {
          decisionContract: {
            contractVersion: "1.0",
            decisionKind: "recommendation",
            decision: "use itinerary",
            confidence: 9,
            evidence: [{ source: "runtime-test", reference: "decision:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
            correlationId: "wwai-test",
            sourceTaskId: "decision-step",
            constraints: [123],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      }],
    }, context());

    expect(result.ok).toBe(false);
    expect(executed).toBe(false);
    expect(result.results[0].error).toContain("decision_contract_runtime_validation_failed");
  });

  it("rejects an expired or mismatched decision contract before deterministic execution", async () => {
    let executed = false;
    const runtime = createWorldwayOrchestratorRuntime({
      tools: new ToolRegistry(),
      deterministic: async (task) => { executed = true; return task.input; },
    });
    const result = await runtime.orchestrator.run({
      goal: "invalid decision",
      tasks: [{ id: "decision-step", kind: "deterministic", acceptedDecisionKinds: ["recommendation"], input: {
        decisionContract: {
          contractVersion: "1.0", decisionKind: "recommendation", decision: "use itinerary", confidence: 0.9,
          evidence: [{ source: "runtime-test", reference: "decision:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
          correlationId: "wrong-correlation", sourceTaskId: "decision-step", constraints: [], expiresAt: "2020-01-01T00:00:00Z",
        },
      }}],
    }, context());
    expect(result.ok).toBe(false);
    expect(executed).toBe(false);
    expect(result.results[0].error).toContain("decision_contract_runtime_validation_failed");
  });

});
