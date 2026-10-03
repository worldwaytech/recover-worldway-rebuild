// Worldway AI Orchestrator foundation (Post-Phase-16 Upgrade 1).
// Deterministic task-graph scheduling over the existing Tool Fabric/runtime.
// Planning-first: autonomous booking/payment/mutation remain disabled.

import { emit, newCorrelationId } from "../router/telemetry";
import { OrchestrationTraceCollector } from "./orchestration-trace";
import type { RiskLevel, ToolContext, ToolRegistry } from "../tools/fabric";

export type OrchestrationTaskKind = "tool" | "specialist" | "deterministic";

export type TaskState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "skipped"
  | "cancelled"
  | "timed_out";

export interface OrchestrationRequest {
  goal: string;
  tasks: OrchestrationTask[];
  policy?: Partial<ExecutionPolicy>;
  correlationId?: string;
}

export interface OrchestrationTask {
  id: string;
  kind: OrchestrationTaskKind;
  /** Stable dependency ids. A task cannot run until all dependencies complete. */
  dependsOn?: string[];
  /** Optional Tool Fabric invocation. Specialist tasks use the delegate adapter. */
  tool?: string;
  input?: unknown;
  specialist?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface TaskDependency {
  taskId: string;
  dependsOn: string;
}

export interface TaskBudget {
  maxSteps: number;
  maxToolCalls: number;
  timeoutMs: number;
}

export interface ExecutionPolicy extends TaskBudget {
  allowedRisk: ReadonlySet<RiskLevel>;
  autonomousBooking: false;
  failFast: boolean;
}

export const DEFAULT_ORCHESTRATION_POLICY: ExecutionPolicy = {
  maxSteps: 12,
  maxToolCalls: 12,
  timeoutMs: 180_000,
  allowedRisk: new Set(["READ", "SEARCH", "ANALYZE", "SIMULATE", "QUOTE"]),
  autonomousBooking: false,
  failFast: false,
};

export interface OrchestrationContext {
  correlationId: string;
  sessionId?: string;
  signal?: AbortSignal;
  toolContext: ToolContext;
  facts: Record<string, unknown>;
}

export interface TaskExecutionResult {
  taskId: string;
  state: TaskState;
  result?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface OrchestrationResult {
  ok: boolean;
  state: "completed" | "failed" | "blocked" | "cancelled" | "timed_out";
  correlationId: string;
  goal: string;
  results: TaskExecutionResult[];
  executedSteps: number;
  toolCalls: number;
  problems: string[];
  trace: ReturnType<OrchestrationTraceCollector["snapshot"]>;
}

export interface SpecialistDelegate {
  delegate(task: OrchestrationTask, ctx: OrchestrationContext): Promise<unknown>;
}

export interface TaskExecutor {
  execute(task: OrchestrationTask, ctx: OrchestrationContext): Promise<unknown>;
}

export class OrchestrationValidationError extends Error {}

function mergePolicy(policy?: Partial<ExecutionPolicy>): ExecutionPolicy {
  return {
    ...DEFAULT_ORCHESTRATION_POLICY,
    ...policy,
    allowedRisk: policy?.allowedRisk ?? DEFAULT_ORCHESTRATION_POLICY.allowedRisk,
    autonomousBooking: false,
  };
}

function validateGraph(tasks: OrchestrationTask[]): { ok: true; order: OrchestrationTask[] } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const byId = new Map<string, OrchestrationTask>();

  for (const task of tasks) {
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(task.id)) problems.push(`invalid_task_id:${task.id}`);
    if (byId.has(task.id)) problems.push(`duplicate_task:${task.id}`);
    byId.set(task.id, task);
    if (task.kind === "tool" && !task.tool) problems.push(`missing_tool:${task.id}`);
    if (task.kind === "specialist" && !task.specialist) problems.push(`missing_specialist:${task.id}`);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      if (!byId.has(dep)) problems.push(`missing_dependency:${task.id}->${dep}`);
      if (dep === task.id) problems.push(`self_dependency:${task.id}`);
    }
  }

  // Stable Kahn ordering: ties retain the request order.
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    indegree.set(task.id, (task.dependsOn ?? []).length);
    for (const dep of task.dependsOn ?? []) {
      const list = children.get(dep) ?? [];
      list.push(task.id);
      children.set(dep, list);
    }
  }

  const ready = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: OrchestrationTask[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const child of children.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) {
        const childIndex = tasks.findIndex((t) => t.id === child);
        const insertAt = ready.findIndex((queued) => tasks.findIndex((t) => t.id === queued) > childIndex);
        if (insertAt === -1) ready.push(child);
        else ready.splice(insertAt, 0, child);
      }
    }
  }

  if (order.length !== tasks.length) problems.push("dependency_cycle");
  return problems.length ? { ok: false, problems } : { ok: true, order };
}

export function validateOrchestrationRequest(request: OrchestrationRequest, policy: ExecutionPolicy = mergePolicy(request.policy)) {
  const problems: string[] = [];
  if (!request.goal.trim()) problems.push("empty_goal");
  if (!request.tasks.length) problems.push("empty_task_graph");
  if (request.tasks.length > policy.maxSteps) problems.push(`step_budget_exceeded:${request.tasks.length}`);
  if (policy.maxSteps <= 0 || policy.maxToolCalls < 0 || policy.timeoutMs <= 0) problems.push("invalid_budget");
  const graph = validateGraph(request.tasks);
  if (!graph.ok) problems.push(...graph.problems);
  return { ok: problems.length === 0, problems, order: graph.ok ? graph.order : [] };
}

function dependencyState(task: OrchestrationTask, results: Map<string, TaskExecutionResult>): TaskState | null {
  for (const dep of task.dependsOn ?? []) {
    const state = results.get(dep)?.state;
    if (state && state !== "completed") return state;
  }
  return null;
}

export class ToolFabricTaskExecutor implements TaskExecutor {
  constructor(private readonly tools: ToolRegistry) {}

  async execute(task: OrchestrationTask, ctx: OrchestrationContext) {
    if (task.kind !== "tool" || !task.tool) throw new OrchestrationValidationError(`Task ${task.id} is not a tool task`);
    return this.tools.invoke(task.tool, task.input, ctx.toolContext);
  }
}

export class SpecialistTaskExecutor implements TaskExecutor {
  constructor(private readonly delegate: SpecialistDelegate) {}

  execute(task: OrchestrationTask, ctx: OrchestrationContext) {
    if (task.kind !== "specialist" || !task.specialist) throw new OrchestrationValidationError(`Task ${task.id} is not a specialist task`);
    return this.delegate.delegate(task, ctx);
  }
}

export class DeterministicTaskExecutor implements TaskExecutor {
  constructor(private readonly run: (task: OrchestrationTask, ctx: OrchestrationContext) => Promise<unknown>) {}
  execute(task: OrchestrationTask, ctx: OrchestrationContext) {
    if (task.kind !== "deterministic") throw new OrchestrationValidationError(`Task ${task.id} is not a deterministic task`);
    return this.run(task, ctx);
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : "task_error";
}

export class WorldwayOrchestrator {
  constructor(
    private readonly executor: TaskExecutor,
    private readonly toolExecutor?: ToolFabricTaskExecutor,
  ) {}

  async run(request: OrchestrationRequest, baseContext: Omit<OrchestrationContext, "correlationId">): Promise<OrchestrationResult> {
    const policy = mergePolicy(request.policy);
    const correlationId = request.correlationId ?? baseContext.toolContext.correlationId ?? newCorrelationId();
    const context: OrchestrationContext = {
      ...baseContext,
      correlationId,
      toolContext: { ...baseContext.toolContext, correlationId, highRiskGrant: undefined },
    };
    const validation = validateOrchestrationRequest(request, policy);

    if (!validation.ok) {
      emit({ type: "plan.rejected", correlationId, sessionId: context.sessionId, reason: validation.problems.join("|") });
      return { ok: false, state: "blocked", correlationId, goal: request.goal, results: [], executedSteps: 0, toolCalls: 0, problems: validation.problems, trace: { correlationId, sessionId: context.sessionId, tasks: [], evidence: [] } };
    }

    // Phase 1/2 safety invariant: no autonomous booking/payment/mutation grant can enter orchestration.
    if (policy.autonomousBooking !== false) {
      return { ok: false, state: "blocked", correlationId, goal: request.goal, results: [], executedSteps: 0, toolCalls: 0, problems: ["autonomous_booking_must_remain_disabled"], trace: { correlationId, sessionId: context.sessionId, tasks: [], evidence: [] } };
    }

    const results = new Map<string, TaskExecutionResult>();
    const trace = new OrchestrationTraceCollector(correlationId, context.sessionId);
    const ordered = validation.order;
    let executedSteps = 0;
    let toolCalls = 0;
    const started = Date.now();

    emit({
      type: "policy.decision",
      correlationId,
      sessionId: context.sessionId,
      outcome: "orchestration_started",
      meta: { tasks: ordered.length, maxSteps: policy.maxSteps, maxToolCalls: policy.maxToolCalls },
    });

    for (const task of ordered) {
      if (Date.now() - started >= policy.timeoutMs) {
        results.set(task.id, { taskId: task.id, state: "timed_out" });
        for (const remaining of ordered.slice(ordered.indexOf(task) + 1)) {
          results.set(remaining.id, { taskId: remaining.id, state: "skipped", error: "orchestration_timeout" });
        }
        break;
      }

      if (context.signal?.aborted) {
        results.set(task.id, { taskId: task.id, state: "cancelled" });
        for (const remaining of ordered.slice(ordered.indexOf(task) + 1)) {
          results.set(remaining.id, { taskId: remaining.id, state: "skipped", error: "orchestration_cancelled" });
        }
        break;
      }

      const blockedBy = dependencyState(task, results);
      if (blockedBy) {
        results.set(task.id, { taskId: task.id, state: "blocked", error: `dependency_${blockedBy}` });
        if (policy.failFast) break;
        continue;
      }

      if (executedSteps >= policy.maxSteps) {
        results.set(task.id, { taskId: task.id, state: "blocked", error: "step_budget_exceeded" });
        if (policy.failFast) break;
        continue;
      }

      if (task.kind === "tool") {
        if (toolCalls >= policy.maxToolCalls) {
          results.set(task.id, { taskId: task.id, state: "blocked", error: "tool_call_budget_exceeded" });
          if (policy.failFast) break;
          continue;
        }
        toolCalls++;
      }

      const startedAt = new Date().toISOString();
      results.set(task.id, { taskId: task.id, state: "running", startedAt });
      trace.taskStarted(task.id, task.kind, startedAt);
      executedSteps++;

      try {
        const result = task.kind === "tool" && this.toolExecutor
          ? await this.toolExecutor.execute(task, context)
          : await this.executor.execute(task, context);
        const finishedAt = new Date().toISOString();
        results.set(task.id, { taskId: task.id, state: "completed", result, startedAt, finishedAt });
        trace.taskFinished(task.id, "completed", finishedAt, result);
      } catch (error) {
        const state: TaskState = context.signal?.aborted ? "cancelled" : "failed";
        const finishedAt = new Date().toISOString();
        results.set(task.id, { taskId: task.id, state, error: errorText(error), startedAt, finishedAt });
        trace.taskFinished(task.id, state, finishedAt);
        if (policy.failFast) {
          for (const remaining of ordered.slice(ordered.indexOf(task) + 1)) {
            results.set(remaining.id, { taskId: remaining.id, state: "skipped", error: `upstream_${state}` });
          }
          break;
        }
      }
    }

    const resultList: TaskExecutionResult[] = ordered.map((task) => results.get(task.id) ?? { taskId: task.id, state: "skipped" as const, error: "not_executed" });
    const problems = resultList.filter((r) => r.state !== "completed").map((r) => `${r.taskId}:${r.error ?? r.state}`);
    const timedOut = resultList.some((r) => r.state === "timed_out");
    const cancelled = resultList.some((r) => r.state === "cancelled");
    const failed = resultList.some((r) => r.state === "failed");
    const blocked = resultList.some((r) => r.state === "blocked");

    const state: OrchestrationResult["state"] = timedOut ? "timed_out" : cancelled ? "cancelled" : failed ? "failed" : blocked ? "blocked" : "completed";
    emit({
      type: "policy.decision",
      correlationId,
      sessionId: context.sessionId,
      outcome: state === "completed" ? "orchestration_complete" : "orchestration_stopped",
      reason: problems.slice(0, 3).join("|") || undefined,
      meta: { state, executedSteps, toolCalls },
    });

    return { ok: state === "completed", state, correlationId, goal: request.goal, results: resultList, executedSteps, toolCalls, problems, trace: trace.snapshot() };
  }
}
