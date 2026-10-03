// Worldway AI Orchestrator foundation (Post-Phase-16 Upgrade 1).
// Deterministic task-graph scheduling over the existing Tool Fabric/runtime.
// Planning-first: autonomous booking/payment/mutation remain disabled.

import { emit, newCorrelationId } from "../router/telemetry";
import { withRoute, type RouterDeps } from "../router/router";
import type { ModelSpec, TaskKind } from "../router/types";
import { OrchestrationTraceCollector } from "./orchestration-trace";
import {
  bindSpecialistSynthesisToDecisionContract,
  createWorldwayDecisionContract,
  validateWorldwayDecisionContract,
  type WorldwayDecisionKind,
} from "./decision-contract";
import type { RiskLevel, ToolContext, ToolRegistry } from "../tools/fabric";
import { buildSpecialistCoordinationEnvelope, type SpecialistAgentKey } from "./specialist-agents";
import { sanitizeOrchestrationEvidence } from "./orchestration-trace";
import { synthesizeSpecialistDecisions, type SpecialistDecisionSynthesisContract } from "./decision-synthesis";

export type OrchestrationTaskKind = "tool" | "specialist" | "deterministic" | "model";
export type TaskState = "pending" | "running" | "completed" | "failed" | "blocked" | "skipped" | "cancelled" | "timed_out";

export interface OrchestrationRequest {
  goal: string;
  tasks: OrchestrationTask[];
  policy?: Partial<ExecutionPolicy>;
  correlationId?: string;
}

export interface OrchestrationTask {
  id: string;
  kind: OrchestrationTaskKind;
  dependsOn?: string[];
  tool?: string;
  input?: unknown;
  specialist?: string;
  modelTask?: TaskKind;
  handoffFrom?: string;
  decisionContractFrom?: string;
  acceptedDecisionKinds?: WorldwayDecisionKind[];
  coordinationFrom?: string[];
  synthesizeSpecialistDecisions?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface TaskDependency { taskId: string; dependsOn: string; }
export interface TaskBudget { maxSteps: number; maxToolCalls: number; timeoutMs: number; }
export interface ExecutionPolicy extends TaskBudget { allowedRisk: ReadonlySet<RiskLevel>; autonomousBooking: false; failFast: boolean; }

export const DEFAULT_ORCHESTRATION_POLICY: ExecutionPolicy = {
  maxSteps: 12, maxToolCalls: 12, timeoutMs: 180_000,
  allowedRisk: new Set(["READ", "SEARCH", "ANALYZE", "SIMULATE", "QUOTE"]),
  autonomousBooking: false, failFast: false,
};

export interface OrchestrationContext {
  correlationId: string;
  sessionId?: string;
  signal?: AbortSignal;
  toolContext: ToolContext;
  facts: Record<string, unknown>;
}

export interface TaskExecutionResult {
  taskId: string; state: TaskState; result?: unknown; error?: string; startedAt?: string; finishedAt?: string;
}

export interface OrchestrationResult {
  ok: boolean; state: "completed" | "failed" | "blocked" | "cancelled" | "timed_out";
  correlationId: string; goal: string; results: TaskExecutionResult[];
  executedSteps: number; toolCalls: number; problems: string[];
  trace: ReturnType<OrchestrationTraceCollector["snapshot"]>;
}

export interface SpecialistDelegate { delegate(task: OrchestrationTask, ctx: OrchestrationContext): Promise<unknown>; }
export interface TaskExecutor { execute(task: OrchestrationTask, ctx: OrchestrationContext): Promise<unknown>; }
export class OrchestrationValidationError extends Error {}

function mergePolicy(policy?: Partial<ExecutionPolicy>): ExecutionPolicy {
  return { ...DEFAULT_ORCHESTRATION_POLICY, ...policy, allowedRisk: policy?.allowedRisk ?? DEFAULT_ORCHESTRATION_POLICY.allowedRisk, autonomousBooking: false };
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
    if (task.kind === "model" && !task.modelTask) problems.push(`missing_model_task:${task.id}`);
    if (task.handoffFrom && task.handoffFrom === task.id) problems.push(`self_handoff:${task.id}`);
    if (task.handoffFrom && task.kind !== "deterministic") problems.push(`handoff_target_must_be_deterministic:${task.id}`);
    if (task.decisionContractFrom && task.kind !== "deterministic") problems.push(`decision_contract_target_must_be_deterministic:${task.id}`);
    if (task.decisionContractFrom === task.id) problems.push(`decision_contract_self_reference:${task.id}`);
    if (task.decisionContractFrom && !(task.dependsOn ?? []).includes(task.decisionContractFrom)) problems.push(`decision_contract_must_depend_on_source:${task.id}->${task.decisionContractFrom}`);
    if (task.decisionContractFrom && !task.acceptedDecisionKinds?.length) problems.push(`decision_contract_missing_accepted_decision_kinds:${task.id}`);
    if (task.handoffFrom && !(task.dependsOn ?? []).includes(task.handoffFrom)) problems.push(`handoff_must_depend_on_source:${task.id}->${task.handoffFrom}`);
    if (task.handoffFrom && !(task.acceptedDecisionKinds?.length)) problems.push(`handoff_missing_accepted_decision_kinds:${task.id}`);
    if (task.acceptedDecisionKinds?.some((kind) => !["recommendation","classification","ranking","routing","explanation"].includes(kind))) problems.push(`invalid_decision_kind:${task.id}`);
    if (task.synthesizeSpecialistDecisions && task.kind !== "deterministic") problems.push(`synthesis_target_must_be_deterministic:${task.id}`);
    if (task.synthesizeSpecialistDecisions && !task.coordinationFrom?.length) problems.push(`synthesis_requires_coordination:${task.id}`);
    if (task.synthesizeSpecialistDecisions && !task.acceptedDecisionKinds?.length) problems.push(`synthesis_missing_accepted_decision_kinds:${task.id}`);
    if (task.coordinationFrom?.length) {
      if (task.kind !== "deterministic") problems.push(`coordination_target_must_be_deterministic:${task.id}`);
      if (task.coordinationFrom.length > 10) problems.push(`coordination_member_limit:${task.id}`);
      if (task.coordinationFrom.includes(task.id)) problems.push(`coordination_self_reference:${task.id}`);
      for (const member of task.coordinationFrom) if (!(task.dependsOn ?? []).includes(member)) problems.push(`coordination_must_depend_on_member:${task.id}->${member}`);
    }
  }
  for (const task of tasks) for (const dep of task.dependsOn ?? []) {
    if (!byId.has(dep)) problems.push(`missing_dependency:${task.id}->${dep}`);
    if (dep === task.id) problems.push(`self_dependency:${task.id}`);
  }
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    indegree.set(task.id, (task.dependsOn ?? []).length);
    for (const dep of task.dependsOn ?? []) children.set(dep, [...(children.get(dep) ?? []), task.id]);
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
        if (insertAt === -1) ready.push(child); else ready.splice(insertAt, 0, child);
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

export interface ValidatedModelOutput { output: Record<string, unknown>; evidence: unknown[]; }
export interface RoutedModelExecutorOptions {
  router?: RouterDeps;
  invoke: (model: ModelSpec, task: TaskKind, input: unknown, correlationId: string) => Promise<unknown>;
  validateOutput: (task: TaskKind, value: unknown, correlationId: string) => ValidatedModelOutput | null;
}
export class RoutedModelTaskExecutor implements TaskExecutor {
  constructor(private readonly options: RoutedModelExecutorOptions) {}
  execute(task: OrchestrationTask, ctx: OrchestrationContext) {
    if (task.kind !== "model" || !task.modelTask) throw new OrchestrationValidationError(`Task ${task.id} is not a model task`);
    return withRoute(task.modelTask, async (model) => {
      const raw = await this.options.invoke(model, task.modelTask!, task.input, ctx.correlationId);
      const validated = this.options.validateOutput(task.modelTask!, raw, ctx.correlationId);
      if (validated === null) throw new OrchestrationValidationError(`Model output validation failed for ${task.id}`);
      return { ...validated.output, evidence: validated.evidence };
    }, this.options.router, ctx.correlationId);
  }
}

export class DeterministicTaskExecutor implements TaskExecutor {
  constructor(private readonly run: (task: OrchestrationTask, ctx: OrchestrationContext) => Promise<unknown>) {}
  execute(task: OrchestrationTask, ctx: OrchestrationContext) {
    if (task.kind !== "deterministic") throw new OrchestrationValidationError(`Task ${task.id} is not a deterministic task`);
    return this.run(task, ctx);
  }
}

function errorText(error: unknown) { return error instanceof Error ? error.message.slice(0, 160) : "task_error"; }

function validatedSpecialistCoordination(task: OrchestrationTask, ordered: OrchestrationTask[], results: Map<string, TaskExecutionResult>, correlationId: string): OrchestrationTask {
  if (task.kind !== "deterministic" || !task.coordinationFrom?.length) return task;
  const specialistResults = [];
  for (const taskId of task.coordinationFrom) {
    const sourceTask = ordered.find((candidate) => candidate.id === taskId);
    const result = results.get(taskId);
    if (!sourceTask || sourceTask.kind !== "specialist" || !sourceTask.specialist || !result || result.state !== "completed" || !result.result || typeof result.result !== "object") throw new OrchestrationValidationError(`Invalid specialist coordination member for ${task.id}:${taskId}`);
    const value = result.result as Record<string, unknown>;
    specialistResults.push({ specialist: sourceTask.specialist as SpecialistAgentKey, taskId, state: "completed" as const, output: value.output, evidence: sanitizeOrchestrationEvidence(value.evidence) });
  }
  const envelope = buildSpecialistCoordinationEnvelope(correlationId, specialistResults);
  if (!envelope) throw new OrchestrationValidationError(`Specialist coordination envelope invalid for ${task.id}`);
  return { ...task, input: { ...(typeof task.input === "object" && task.input ? task.input as Record<string, unknown> : {}), specialistCoordination: envelope } };
}

function validatedSpecialistSynthesis(task: OrchestrationTask, coordinatedTask: OrchestrationTask, correlationId: string): OrchestrationTask {
  if (task.kind !== "deterministic" || !task.synthesizeSpecialistDecisions) return coordinatedTask;
  const input = coordinatedTask.input as Record<string, unknown>;
  const synthesis = synthesizeSpecialistDecisions(input.specialistCoordination as never, { expectedCorrelationId: correlationId });
  if (!synthesis) throw new OrchestrationValidationError(`Specialist decision synthesis invalid for ${task.id}`);
  if (synthesis.status !== "ready") throw new OrchestrationValidationError(`Specialist decision synthesis not executable for ${task.id}:${synthesis.status}`);
  return { ...coordinatedTask, input: { ...input, specialistSynthesis: synthesis } };
}

function validatedDecisionContractHandoff(task: OrchestrationTask, sourceTask: OrchestrationTask | undefined, source: TaskExecutionResult | undefined, correlationId: string): OrchestrationTask {
  if (task.kind !== "deterministic" || !task.decisionContractFrom) return task;
  if (!sourceTask || sourceTask.kind !== "deterministic") throw new OrchestrationValidationError(`Decision contract source must be deterministic for ${task.id}`);
  if (!source || source.state !== "completed" || !source.result || typeof source.result !== "object" || Array.isArray(source.result)) {
    throw new OrchestrationValidationError(`Invalid decision contract source for ${task.id}`);
  }
  if (!task.acceptedDecisionKinds?.length) throw new OrchestrationValidationError(`Decision contract handoff kinds not declared for ${task.id}`);
  const value = source.result as Record<string, unknown>;
  const validated = validateWorldwayDecisionContract(value.decisionContract, {
    expectedCorrelationId: correlationId,
    expectedSourceTaskId: sourceTask.id,
    acceptedDecisionKinds: task.acceptedDecisionKinds,
  });
  if (!validated) throw new OrchestrationValidationError(`Decision contract handoff validation failed for ${task.id}`);
  return { ...task, input: { ...(typeof task.input === "object" && task.input ? task.input as Record<string, unknown> : {}), decisionContract: validated } };
}

function validatedModelHandoff(task: OrchestrationTask, sourceTask: OrchestrationTask | undefined, source: TaskExecutionResult | undefined, correlationId: string): OrchestrationTask {
  if (task.kind !== "deterministic" || !task.handoffFrom) return task;
  if (!sourceTask || sourceTask.kind !== "model") throw new OrchestrationValidationError(`Model handoff source must be a model task for ${task.id}`);
  if (!source || source.state !== "completed" || !source.result || typeof source.result !== "object") throw new OrchestrationValidationError(`Invalid model handoff source for ${task.id}`);
  if (!task.acceptedDecisionKinds?.length) throw new OrchestrationValidationError(`Model handoff decision kinds not declared for ${task.id}`);
  const value = source.result as Record<string, unknown>;
  const decisionKind = typeof value.decisionKind === "string" ? value.decisionKind : "recommendation";
  const contract = createWorldwayDecisionContract({
    decisionKind: decisionKind as WorldwayDecisionKind, decision: value.decision, confidence: value.confidence, evidence: value.evidence,
    correlationId, sourceTaskId: source.id, constraints: value.constraints, expiresAt: value.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (!contract) throw new OrchestrationValidationError(`Model handoff decision contract invalid for ${task.id}`);
  const validated = validateWorldwayDecisionContract(contract, { expectedCorrelationId: correlationId, expectedSourceTaskId: source.id, acceptedDecisionKinds: task.acceptedDecisionKinds });
  if (!validated) throw new OrchestrationValidationError(`Model handoff decision contract integrity check failed for ${task.id}`);
  return { ...task, input: { ...(typeof task.input === "object" && task.input ? task.input as Record<string, unknown> : {}), modelDecision: validated } };
}

function validatedSpecialistDecisionBinding(task: OrchestrationTask, executedTask: OrchestrationTask, result: unknown, correlationId: string): unknown {
  if (task.kind !== "deterministic" || !task.synthesizeSpecialistDecisions) return result;
  if (!task.acceptedDecisionKinds?.length) throw new OrchestrationValidationError(`Synthesis decision kinds not declared for ${task.id}`);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new OrchestrationValidationError(`Deterministic synthesis consumer returned invalid result for ${task.id}`);
  const value = result as Record<string, unknown>;
  const input = executedTask.input as Record<string, unknown>;
  const synthesis = input.specialistSynthesis as SpecialistDecisionSynthesisContract | undefined;
  if (!synthesis) throw new OrchestrationValidationError(`Specialist synthesis missing at decision binding for ${task.id}`);
  const decisionKind = typeof value.decisionKind === "string" ? value.decisionKind : null;
  if (!decisionKind) throw new OrchestrationValidationError(`Deterministic decision kind missing for ${task.id}`);
  const contract = bindSpecialistSynthesisToDecisionContract({
    synthesis,
    decisionKind: decisionKind as WorldwayDecisionKind,
    decision: value.decision,
    confidence: value.confidence,
    correlationId,
    sourceTaskId: task.id,
    acceptedDecisionKinds: task.acceptedDecisionKinds,
    constraints: value.constraints,
    expiresAt: value.expiresAt,
  });
  if (!contract) throw new OrchestrationValidationError(`Specialist synthesis decision contract invalid for ${task.id}`);
  return { ...value, decisionContract: contract };
}

export class WorldwayOrchestrator {
  constructor(private readonly executor: TaskExecutor, private readonly toolExecutor?: ToolFabricTaskExecutor) {}

  async run(request: OrchestrationRequest, baseContext: Omit<OrchestrationContext, "correlationId">): Promise<OrchestrationResult> {
    const policy = mergePolicy(request.policy);
    const correlationId = request.correlationId ?? baseContext.toolContext.correlationId ?? newCorrelationId();
    const context: OrchestrationContext = { ...baseContext, correlationId, toolContext: { ...baseContext.toolContext, correlationId, highRiskGrant: undefined } };
    const validation = validateOrchestrationRequest(request, policy);
    if (!validation.ok) {
      emit({ type: "plan.rejected", correlationId, sessionId: context.sessionId, reason: validation.problems.join("|") });
      return { ok: false, state: "blocked", correlationId, goal: request.goal, results: [], executedSteps: 0, toolCalls: 0, problems: validation.problems, trace: { correlationId, sessionId: context.sessionId, tasks: [], evidence: [] } };
    }
    if (policy.autonomousBooking !== false) {
      return { ok: false, state: "blocked", correlationId, goal: request.goal, results: [], executedSteps: 0, toolCalls: 0, problems: ["autonomous_booking_must_remain_disabled"], trace: { correlationId, sessionId: context.sessionId, tasks: [], evidence: [] } };
    }
    const results = new Map<string, TaskExecutionResult>();
    const trace = new OrchestrationTraceCollector(correlationId, context.sessionId);
    const ordered = validation.order;
    let executedSteps = 0;
    let toolCalls = 0;
    const started = Date.now();
    const consumedModelHandoffs = new Set<string>();
    emit({ type: "policy.decision", correlationId, sessionId: context.sessionId, outcome: "orchestration_started", meta: { tasks: ordered.length, maxSteps: policy.maxSteps, maxToolCalls: policy.maxToolCalls } });
    for (const task of ordered) {
      if (Date.now() - started >= policy.timeoutMs) {
        results.set(task.id, { taskId: task.id, state: "timed_out" });
        for (const remaining of ordered.slice(ordered.indexOf(task) + 1)) results.set(remaining.id, { taskId: remaining.id, state: "skipped", error: "orchestration_timeout" });
        break;
      }
      if (context.signal?.aborted) {
        results.set(task.id, { taskId: task.id, state: "cancelled" });
        for (const remaining of ordered.slice(ordered.indexOf(task) + 1)) results.set(remaining.id, { taskId: remaining.id, state: "skipped", error: "orchestration_cancelled" });
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
        if (task.handoffFrom) {
          if (consumedModelHandoffs.has(task.handoffFrom)) throw new OrchestrationValidationError(`Model decision replay rejected for ${task.id}`);
          consumedModelHandoffs.add(task.handoffFrom);
        }
        const coordinatedTask = validatedSpecialistCoordination(task, ordered, results, correlationId);
        const synthesizedTask = validatedSpecialistSynthesis(task, coordinatedTask, correlationId);
        const decisionContractTask = validatedDecisionContractHandoff(
          synthesizedTask,
          synthesizedTask.decisionContractFrom ? ordered.find((candidate) => candidate.id === synthesizedTask.decisionContractFrom) : undefined,
          synthesizedTask.decisionContractFrom ? results.get(synthesizedTask.decisionContractFrom) : undefined,
          correlationId,
        );
        const executionTask = validatedModelHandoff(decisionContractTask, decisionContractTask.handoffFrom ? ordered.find((candidate) => candidate.id === decisionContractTask.handoffFrom) : undefined, decisionContractTask.handoffFrom ? results.get(decisionContractTask.handoffFrom) : undefined, correlationId);
        const rawResult = executionTask.kind === "tool" && this.toolExecutor ? await this.toolExecutor.execute(executionTask, context) : await this.executor.execute(executionTask, context);
        const result = validatedSpecialistDecisionBinding(task, executionTask, rawResult, correlationId);
        const finishedAt = new Date().toISOString();
        results.set(task.id, { taskId: task.id, state: "completed", result, startedAt, finishedAt });
        trace.taskFinished(task.id, "completed", finishedAt, result);
      } catch (error) {
        const state: TaskState = context.signal?.aborted ? "cancelled" : "failed";
        const finishedAt = new Date().toISOString();
        results.set(task.id, { taskId: task.id, state, error: errorText(error), startedAt, finishedAt });
        trace.taskFinished(task.id, state, finishedAt);
        if (policy.failFast) {
          for (const remaining of ordered.slice(ordered.indexOf(task) + 1)) results.set(remaining.id, { taskId: remaining.id, state: "skipped", error: `upstream_${state}` });
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
    emit({ type: "policy.decision", correlationId, sessionId: context.sessionId, outcome: state === "completed" ? "orchestration_complete" : "orchestration_stopped", reason: problems.slice(0, 3).join("|") || undefined, meta: { state, executedSteps, toolCalls } });
    return { ok: state === "completed", state, correlationId, goal: request.goal, results: resultList, executedSteps, toolCalls, problems, trace: trace.snapshot() };
  }
}
