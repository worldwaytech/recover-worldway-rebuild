import { describe, expect, it } from "vitest";
import { SPECIALIST_AGENT_DEFINITIONS, SPECIALIST_AGENT_KEYS, SpecialistAgentRegistry } from "../specialist-agents";

describe("Specialist Agent Framework", () => {
  it("defines ten bounded non-mutating specialist domains", () => {
    expect(SPECIALIST_AGENT_KEYS).toHaveLength(10);
    expect(SPECIALIST_AGENT_DEFINITIONS.every((x) => !x.canMutateCommerce && x.requiresDeterministicHandoff)).toBe(true);
  });

  it("requires a registered handler and explicit objective", async () => {
    const registry = new SpecialistAgentRegistry();
    const context = {
      correlationId: "c1",
      toolContext: { correlationId: "c1", context: "agent_runtime" as const, principal: { permission: "public" as const, scopes: [] } },
      facts: {},
    };
    const rejected = await registry.delegate({ id:"flight-plan", kind:"specialist", specialist:"flight_intelligence", input:{ objective:"Assess route" } }, context);
    expect(rejected.reason).toBe("specialist_handler_not_registered");
    registry.register("flight_intelligence", { async handle(invocation) { return { mode:"plan", objective:invocation.objective }; } });
    const completed = await registry.delegate({ id:"flight-plan", kind:"specialist", specialist:"flight_intelligence", input:{ objective:"Assess route" } }, context);
    expect(completed.state).toBe("completed");
  });

  it("rejects an empty objective", async () => {
    const registry = new SpecialistAgentRegistry().register("risk_trust", { async handle() { return {}; } });
    const context = { correlationId:"c1", toolContext:{ correlationId:"c1", context:"agent_runtime" as const, principal:{ permission:"public" as const, scopes:[] } }, facts:{} };
    const result = await registry.delegate({ id:"risk-check", kind:"specialist", specialist:"risk_trust", input:{ objective:"" } }, context);
    expect(result.reason).toBe("empty_objective");
  });

  it("rejects unknown specialist names", async () => {
    const registry = new SpecialistAgentRegistry();
    const context = { correlationId:"c1", toolContext:{ correlationId:"c1", context:"agent_runtime" as const, principal:{ permission:"public" as const, scopes:[] } }, facts:{} };
    await expect(registry.delegate({ id:"x", kind:"specialist", specialist:"unknown" as never, input:{ objective:"x" } }, context)).rejects.toThrow("unknown_specialist");
  });
});
