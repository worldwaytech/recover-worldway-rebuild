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
      { id: "a", kind: "deterministic" },
      { id: "b", kind: "tool", tool: "read_value", input: { value: "b" } },
      { id: "c", kind: "tool", tool: "read_value", input: { value: "c" } },
    ];
    const result = await orchestrator.run(
      { goal: "budget", tasks, policy: { ...DEFAULT_ORCHESTRATION_POLICY, maxSteps: 3, maxToolCalls: 1 } },
      context(),
    );
    expect(result.toolCalls).toBe(1);
    expect(result.results.find((r) => r.taskId === "c")?.state).toBe("blocked");
    expect(result.results.find((r) => r.taskId === "c")?.error).toBe("tool_call_budget_exceeded");
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
});
