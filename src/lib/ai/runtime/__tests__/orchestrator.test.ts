import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ORCHESTRATION_POLICY,
  ToolFabricTaskExecutor,
  WorldwayOrchestrator,
  validateOrchestrationRequest,
  type OrchestrationTask,
} from "../orchestrator";
import { ToolRegistry, type ToolSpec } from "../../tools/fabric";
import { z } from "zod";

function toolRegistry() {
  const registry = new ToolRegistry();
  const spec: ToolSpec<{ value: string }, string> = {
    name: "read_value",
    version: "1.0.0",
    description: "Test read tool",
    input: z.object({ value: z.string() }),
    output: z.string(),
    risk: "READ",
    permission: "public",
    scopes: ["commerce:read"],
    audit: "trace",
    contexts: ["agent_runtime"],
    requiresAuth: false,
    timeoutMs: 2_000,
    retries: 0,
    execute: async ({ value }) => value,
  };
  registry.register(spec);
  return registry;
}

function context() {
  return {
    sessionId: "session-test",
    facts: {},
    toolContext: {
      correlationId: "wwai-test",
      context: "agent_runtime" as const,
      principal: { permission: "public" as const, scopes: ["commerce:read" as const], userId: null },
    },
  };
}

describe("Worldway AI Orchestrator foundation", () => {
  it("validates dependency graphs and produces deterministic ordering", () => {
    const tasks: OrchestrationTask[] = [
      { id: "final", kind: "deterministic", dependsOn: ["second"] },
      { id: "first", kind: "deterministic" },
      { id: "second", kind: "deterministic", dependsOn: ["first"] },
    ];
    const v = validateOrchestrationRequest({ goal: "plan", tasks });
    expect(v.ok).toBe(true);
    expect(v.order.map((t) => t.id)).toEqual(["first", "second", "final"]);
  });

  it("rejects missing dependencies and cycles before execution", () => {
    expect(validateOrchestrationRequest({
      goal: "plan",
      tasks: [{ id: "a", kind: "deterministic", dependsOn: ["missing"] }],
    }).problems).toContain("missing_dependency:a->missing");

    expect(validateOrchestrationRequest({
      goal: "plan",
      tasks: [
        { id: "a", kind: "deterministic", dependsOn: ["b"] },
        { id: "b", kind: "deterministic", dependsOn: ["a"] },
      ],
    }).problems).toContain("dependency_cycle");
  });

  it("enforces step and tool-call budgets", async () => {
    const run = vi.fn(async () => "ok");
    const executor = { execute: run };
    const orchestrator = new WorldwayOrchestrator(executor, new ToolFabricTaskExecutor(toolRegistry()));
    const tasks: OrchestrationTask[] = [
      { id: "task-a", kind: "deterministic" },
      { id: "task-b", kind: "tool", tool: "read_value", input: { value: "b" } },
      { id: "task-c", kind: "tool", tool: "read_value", input: { value: "c" } },
    ];
    const result = await orchestrator.run(
      { goal: "budget", tasks, policy: { ...DEFAULT_ORCHESTRATION_POLICY, maxSteps: 3, maxToolCalls: 1 } },
      context(),
    );
    expect(result.toolCalls).toBe(1);
    expect(result.results.find((r) => r.taskId === "task-c")?.state).toBe("blocked");
    expect(result.results.find((r) => r.taskId === "task-c")?.error).toBe("tool_call_budget_exceeded");
  });

  it("routes tool tasks through Tool Fabric and preserves its authorization boundary", async () => {
    const registry = toolRegistry();
    const execute = vi.spyOn(registry, "invoke");
    const orchestrator = new WorldwayOrchestrator(
      { execute: async () => "wrong-path" },
      new ToolFabricTaskExecutor(registry),
    );
    const result = await orchestrator.run({
      goal: "read",
      tasks: [{ id: "read", kind: "tool", tool: "read_value", input: { value: "hello" } }],
    }, context());

    expect(result.ok).toBe(true);
    expect(result.results[0].result).toBe("hello");
    expect(execute).toHaveBeenCalledWith(
      "read_value",
      { value: "hello" },
      expect.objectContaining({ context: "agent_runtime" }),
    );
  });

  it("never carries a high-risk grant into orchestration", async () => {
    const registry = toolRegistry();
    const captured: unknown[] = [];
    const execute = vi.spyOn(registry, "invoke").mockImplementation(async (_name, _input, ctx) => {
      captured.push(ctx.highRiskGrant);
      return "ok";
    });
    const orchestrator = new WorldwayOrchestrator(new ToolFabricTaskExecutor(registry), new ToolFabricTaskExecutor(registry));
    await orchestrator.run({
      goal: "safe",
      tasks: [{ id: "read", kind: "tool", tool: "read_value", input: { value: "x" } }],
    }, { ...context(), toolContext: { ...context().toolContext, highRiskGrant: { tool: "read_value", grantedBy: "staff_approval" } } });

    expect(captured).toEqual([undefined]);
    execute.mockRestore();
  });

  it("blocks malformed orchestration without executing tasks", async () => {
    const execute = vi.fn(async () => "should-not-run");
    const orchestrator = new WorldwayOrchestrator({ execute }, undefined);
    const result = await orchestrator.run({
      goal: "",
      tasks: [{ id: "a", kind: "deterministic" }],
    }, context());

    expect(result.ok).toBe(false);
    expect(result.state).toBe("blocked");
    expect(execute).not.toHaveBeenCalled();
  });

  it("propagates dependency failure into an explicit recovery state", async () => {
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => {
        if (task.id === "first") throw new Error("supplier_unavailable");
        return "ok";
      },
    });
    const result = await orchestrator.run({
      goal: "recover",
      tasks: [
        { id: "first", kind: "deterministic" },
        { id: "second", kind: "deterministic", dependsOn: ["first"] },
      ],
    }, context());

    expect(result.state).toBe("failed");
    expect(result.results.find((r) => r.taskId === "first")?.state).toBe("failed");
    expect(result.results.find((r) => r.taskId === "second")?.state).toBe("blocked");
  });
  it("returns an auditable task trace with bounded provenance", async () => {
    const orchestrator = new WorldwayOrchestrator({
      execute: async () => ({
        value: "ok",
        evidence: [{ source: "travel-graph", reference: "edge:ist:123", observedAt: "2026-10-03T00:00:00Z", confidence: 0.9 }],
      }),
    });
    const result = await orchestrator.run({
      goal: "trace",
      tasks: [{ id: "inspect", kind: "deterministic" }],
    }, context());

    expect(result.ok).toBe(true);
    expect(result.trace.tasks[0]).toMatchObject({ taskId: "inspect", state: "completed", evidenceCount: 1 });
    expect(result.trace.evidence[0].items[0].reference).toBe("edge:ist:123");
  });


  it("passes only provenance-bound model output into deterministic handoff tasks", async () => {
    const captured: unknown[] = [];
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => {
        if (task.kind === "model") {
          return { decisionKind: "recommendation", decision: "review", confidence: 0.92, constraints: ["deterministic-only"], expiresAt: "2099-01-01T00:00:00Z", evidence: [{ source: "model-test", reference: "model:validated", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }] };
        }
        captured.push(task.input);
        return "accepted";
      },
    });
    const result = await orchestrator.run({
      goal: "handoff",
      tasks: [
        { id: "model-step", kind: "model", modelTask: "concierge_chat" },
        { id: "deterministic-step", kind: "deterministic", dependsOn: ["model-step"], handoffFrom: "model-step", acceptedDecisionKinds: ["recommendation"] },
      ],
    }, context());
    expect(result.ok).toBe(true);
    expect(captured[0]).toMatchObject({ modelDecision: { contractVersion: "1.0", decision: "review", confidence: 0.92, correlationId: "wwai-test", evidence: [{ reference: "model:validated" }] } });
  });

  it("blocks model handoff when the typed decision contract is invalid", async () => {
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => task.kind === "model" ? { decision: "missing-proof" } : "must-not-run",
    });
    const result = await orchestrator.run({
      goal: "invalid-handoff",
      tasks: [
        { id: "model-step", kind: "model", modelTask: "concierge_chat" },
        { id: "deterministic-step", kind: "deterministic", dependsOn: ["model-step"], handoffFrom: "model-step", acceptedDecisionKinds: ["recommendation"] },
      ],
    }, context());
    expect(result.ok).toBe(false);
    expect(result.results.find((r) => r.taskId === "deterministic-step")?.state).toBe("failed");
    expect(result.results.find((r) => r.taskId === "deterministic-step")?.error).toContain("decision contract invalid");
  });
  it("synthesizes coordinated specialists before deterministic execution", async () => {
    const captured: unknown[] = [];
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => {
        if (task.kind === "specialist") {
          return { specialist: task.specialist, output: { recommendation: task.id === "flight-step" ? "keep" : "keep" }, evidence: [{ source: "synthesis-test", reference: task.id, observedAt: "2026-10-03T00:00:00Z", confidence: 1 }] };
        }
        captured.push(task.input);
        return "accepted";
      },
    });
    const result = await orchestrator.run({
      goal: "synthesize",
      tasks: [
        { id: "flight-step", kind: "specialist", specialist: "flight_intelligence", input: { objective: "assess" } },
        { id: "hotel-step", kind: "specialist", specialist: "hotel_intelligence", input: { objective: "assess" } },
        { id: "decision-step", kind: "deterministic", dependsOn: ["flight-step", "hotel-step"], coordinationFrom: ["flight-step", "hotel-step"], synthesizeSpecialistDecisions: true, acceptedDecisionKinds: ["recommendation"] },
      ],
    }, context());
    expect(result.ok).toBe(true);
    expect(captured[0]).toMatchObject({ specialistSynthesis: { contractVersion: "1.0", status: "ready", correlationId: "wwai-test" } });
  });

  it("fails closed when coordinated specialist findings conflict", async () => {
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => task.kind === "specialist"
        ? { output: { recommendation: task.id === "flight-step" ? "keep" : "reject" }, evidence: [{ source: "conflict-test", reference: task.id, observedAt: "2026-10-03T00:00:00Z", confidence: 1 }] }
        : "must-not-run",
    });
    const result = await orchestrator.run({
      goal: "conflict",
      tasks: [
        { id: "flight-step", kind: "specialist", specialist: "flight_intelligence", input: { objective: "assess" } },
        { id: "hotel-step", kind: "specialist", specialist: "hotel_intelligence", input: { objective: "assess" } },
        { id: "decision-step", kind: "deterministic", dependsOn: ["flight-step", "hotel-step"], coordinationFrom: ["flight-step", "hotel-step"], synthesizeSpecialistDecisions: true },
      ],
    }, context());
    expect(result.ok).toBe(false);
    expect(result.results.find((item) => item.taskId === "decision-step")?.state).toBe("failed");
    expect(result.results.find((item) => item.taskId === "decision-step")?.error).toContain("not executable");
  });

  it("binds deterministic output to the unified decision contract after specialist synthesis", async () => {
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => task.kind === "specialist"
        ? { output: { recommendation: "review" }, evidence: [{ source: "binding-test", reference: task.id, observedAt: "2026-10-03T00:00:00Z", confidence: 1 }] }
        : { decisionKind: "recommendation", decision: "use deterministic itinerary", confidence: 0.93, expiresAt: "2099-01-01T00:00:00Z" },
    });
    const result = await orchestrator.run({
      goal: "bind synthesis",
      tasks: [
        { id: "flight-step", kind: "specialist", specialist: "flight_intelligence", input: { objective: "assess" } },
        { id: "hotel-step", kind: "specialist", specialist: "hotel_intelligence", input: { objective: "assess" } },
        { id: "decision-step", kind: "deterministic", dependsOn: ["flight-step", "hotel-step"], coordinationFrom: ["flight-step", "hotel-step"], synthesizeSpecialistDecisions: true, acceptedDecisionKinds: ["recommendation"] },
      ],
    }, context());
    expect(result.ok).toBe(true);
    expect(result.results.find((item) => item.taskId === "decision-step")?.result).toMatchObject({
      decisionContract: { contractVersion: "1.0", decisionKind: "recommendation", decision: "use deterministic itinerary", sourceTaskId: "decision-step", correlationId: "wwai-test" },
    });
  });

  it("fails closed when synthesis decision output is incomplete", async () => {
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => task.kind === "specialist"
        ? { output: { recommendation: "review" }, evidence: [{ source: "binding-test", reference: task.id, observedAt: "2026-10-03T00:00:00Z", confidence: 1 }] }
        : { decisionKind: "recommendation" },
    });
    const result = await orchestrator.run({
      goal: "invalid binding",
      tasks: [
        { id: "flight-step", kind: "specialist", specialist: "flight_intelligence", input: { objective: "assess" } },
        { id: "hotel-step", kind: "specialist", specialist: "hotel_intelligence", input: { objective: "assess" } },
        { id: "decision-step", kind: "deterministic", dependsOn: ["flight-step", "hotel-step"], coordinationFrom: ["flight-step", "hotel-step"], synthesizeSpecialistDecisions: true, acceptedDecisionKinds: ["recommendation"] },
      ],
    }, context());
    expect(result.ok).toBe(false);
    expect(result.results.find((item) => item.taskId === "decision-step")?.error).toContain("decision contract invalid");
  });

});



  it("rejects a handoff when the deterministic consumer does not declare decision kinds", () => {
    const result = validateOrchestrationRequest({
      goal: "handoff-policy",
      tasks: [
        { id: "model-step", kind: "model", modelTask: "concierge_chat" },
        { id: "deterministic-step", kind: "deterministic", dependsOn: ["model-step"], handoffFrom: "model-step" },
      ],
    });
    expect(result.problems).toContain("handoff_missing_accepted_decision_kinds:deterministic-step");
  });

  it("rejects replay of the same model decision into two deterministic consumers", async () => {
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => task.kind === "model"
        ? { decisionKind: "recommendation", decision: "review", confidence: 0.9, expiresAt: "2099-01-01T00:00:00Z", evidence: [{ source: "model-test", reference: "model:validated", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }] }
        : "accepted",
    });
    const result = await orchestrator.run({
      goal: "replay",
      tasks: [
        { id: "model-step", kind: "model", modelTask: "concierge_chat" },
        { id: "deterministic-a", kind: "deterministic", dependsOn: ["model-step"], handoffFrom: "model-step", acceptedDecisionKinds: ["recommendation"] },
        { id: "deterministic-b", kind: "deterministic", dependsOn: ["model-step"], handoffFrom: "model-step", acceptedDecisionKinds: ["recommendation"] },
      ],
    }, context());
    expect(result.ok).toBe(false);
    expect(result.results.find((r) => r.taskId === "deterministic-b")?.error).toContain("replay rejected");
  });


  it("passes only a bounded specialist coordination envelope to deterministic consumers", async () => {
    const captured: unknown[] = [];
    const orchestrator = new WorldwayOrchestrator({
      execute: async (task) => {
        if (task.kind === "specialist") {
          return {
            specialist: task.specialist,
            taskId: task.id,
            state: "completed",
            output: { assessment: task.id },
            evidence: [{ source: "specialist-test", reference: task.id, observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
          };
        }
        captured.push(task.input);
        return "accepted";
      },
    });
    const result = await orchestrator.run({
      goal: "coordinate specialists",
      tasks: [
        { id: "flight-step", kind: "specialist", specialist: "flight_intelligence", input: { objective: "assess flights" } },
        { id: "hotel-step", kind: "specialist", specialist: "hotel_intelligence", input: { objective: "assess hotels" } },
        { id: "decision-step", kind: "deterministic", dependsOn: ["flight-step", "hotel-step"], coordinationFrom: ["flight-step", "hotel-step"] },
      ],
    }, context());
    expect(result.ok).toBe(true);
    const input = captured[0] as Record<string, unknown>;
    const envelope = input.specialistCoordination as Record<string, unknown>;
    expect(envelope.contractVersion).toBe("1.0");
    expect(envelope.correlationId).toBe(result.correlationId);
    expect((envelope.members as unknown[]).length).toBe(2);
  });

  it("rejects specialist coordination that bypasses dependency declaration", () => {
    const result = validateOrchestrationRequest({
      goal: "invalid coordination",
      tasks: [
        { id: "flight-step", kind: "specialist", specialist: "flight_intelligence", input: { objective: "assess" } },
        { id: "decision-step", kind: "deterministic", coordinationFrom: ["flight-step"] },
      ],
    });
    expect(result.problems).toContain("coordination_must_depend_on_member:decision-step->flight-step");
  });
