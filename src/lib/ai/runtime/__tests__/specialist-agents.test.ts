import { describe, expect, it } from "vitest";
import { buildSpecialistCoordinationEnvelope, SPECIALIST_AGENT_DEFINITIONS, SPECIALIST_AGENT_KEYS, SpecialistAgentRegistry } from "../specialist-agents";
import { buildWorldwayOrchestrationContext } from "../context-bridge";
import { EMPTY_TRAVELER_PROFILE, buildPersonalizationContext } from "../../../engine/intelligence/traveler-profile";

function context() {
  const consent = { preferences: true, history: true };
  const personalization = buildPersonalizationContext(EMPTY_TRAVELER_PROFILE, consent, []);
  return buildWorldwayOrchestrationContext({
    base: {
      sessionId: "session-test", facts: {},
      toolContext: { correlationId: "c1", context: "agent_runtime" as const, principal: { permission: "public" as const, scopes: [] } },
    },
    traveller: {
      travellerId: "traveller-test", consent, profile: EMPTY_TRAVELER_PROFILE,
      personalization, memories: [],
    },
  });
}

describe("Specialist Agent Framework", () => {
  it("defines ten bounded non-mutating specialist domains", () => {
    expect(SPECIALIST_AGENT_KEYS).toHaveLength(10);
    expect(SPECIALIST_AGENT_DEFINITIONS.every((x) => !x.canMutateCommerce && x.requiresDeterministicHandoff)).toBe(true);
  });

  it("requires a registered handler and explicit objective", async () => {
    const registry = new SpecialistAgentRegistry();
    const ctx = context();
    const rejected = await registry.delegate({ id:"flight-plan", kind:"specialist", specialist:"flight_intelligence", input:{ objective:"Assess route" } }, ctx);
    expect(rejected.reason).toBe("specialist_handler_not_registered");
    registry.register("flight_intelligence", { async handle(invocation) { return { mode:"plan", objective:invocation.objective }; } });
    const completed = await registry.delegate({ id:"flight-plan", kind:"specialist", specialist:"flight_intelligence", input:{ objective:"Assess route" } }, ctx);
    expect(completed.state).toBe("completed");
  });

  it("exposes Knowledge to specialists only as a frozen advisory context", async () => {
    const registry = new SpecialistAgentRegistry().register("destination_intelligence", {
      async handle(_invocation, specialistContext) {
        expect(specialistContext.knowledge.authority).toBe("advisory_only");
        expect(specialistContext.knowledge.executionAuthority).toBe(false);
        expect(Object.isFrozen(specialistContext.knowledge)).toBe(true);
        expect(Object.isFrozen(specialistContext.knowledge.facts)).toBe(true);
        expect(() => {
          (specialistContext.knowledge as unknown as { executionAuthority: boolean }).executionAuthority = true;
        }).toThrow();
        return { mode: "analyze", recommendation: "use advisory evidence" };
      },
    });
    const result = await registry.delegate({
      id: "destination-check",
      kind: "specialist",
      specialist: "destination_intelligence",
      input: { objective: "Assess destination context" },
    }, context());
    expect(result.state).toBe("completed");
  });

  it("rejects a forged Knowledge authority contract", async () => {
    const registry = new SpecialistAgentRegistry().register("risk_trust", {
      async handle() { return { recommendation: "should never run" }; },
    });
    const valid = context();
    const forged = {
      ...valid,
      knowledge: {
        ...valid.knowledge,
        authority: "execution" as const,
        executionAuthority: true as const,
      },
    };
    const result = await registry.delegate({
      id: "forged-context",
      kind: "specialist",
      specialist: "risk_trust",
      input: { objective: "Assess trust" },
    }, forged as never);
    expect(result.state).toBe("rejected");
    expect(result.reason).toBe("worldway_context_required");
  });

  it("rejects an empty objective", async () => {
    const registry = new SpecialistAgentRegistry().register("risk_trust", { async handle() { return {}; } });
    const contextValue = context();
    const result = await registry.delegate({ id:"risk-check", kind:"specialist", specialist:"risk_trust", input:{ objective:"" } }, contextValue);
    expect(result.reason).toBe("empty_objective");
  });

  it("rejects unknown specialist names", async () => {
    const registry = new SpecialistAgentRegistry();
    const contextValue = context();
    await expect(registry.delegate({ id:"x", kind:"specialist", specialist:"unknown" as never, input:{ objective:"x" } }, contextValue)).rejects.toThrow("unknown_specialist");
  });
});

  it("sanitizes specialist authority fields at coordination ingress", () => {
    const envelope = buildSpecialistCoordinationEnvelope("corr-ingress", [{
      specialist: "risk_trust",
      taskId: "risk-step",
      state: "completed",
      output: {
        recommendation: "review",
        executionAuthority: true,
        payment: { execute: true },
        nested: { booking: true, safe: "kept" },
      },
      evidence: [{ source: "test", reference: "risk-step", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
    }]);
    expect(envelope?.members[0].output).toEqual({
      recommendation: "review",
      nested: { safe: "kept" },
    });
    expect(JSON.stringify(envelope)).not.toContain("executionAuthority");
    expect(JSON.stringify(envelope)).not.toContain("payment");
    expect(JSON.stringify(envelope)).not.toContain("booking");
  });


  it("builds a bounded coordination envelope with correlation binding", () => {
    const envelope = buildSpecialistCoordinationEnvelope("corr-test", [
      {
        specialist: "flight_intelligence",
        taskId: "flight-step",
        state: "completed",
        output: { recommendation: "review" },
        evidence: [{ source: "test", reference: "flight-step", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
      },
      {
        specialist: "hotel_intelligence",
        taskId: "hotel-step",
        state: "completed",
        output: { recommendation: "review" },
        evidence: [{ source: "test", reference: "hotel-step", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
      },
    ]);
    expect(envelope?.contractVersion).toBe("1.0");
    expect(envelope?.correlationId).toBe("corr-test");
    expect(envelope?.members).toHaveLength(2);
  });
