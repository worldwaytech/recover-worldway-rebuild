// Worldway Agent Runtime foundation (Phase 1): typed sessions, context, skills,
// sub-agents, execution policy, cancellation and tracing. No autonomous booking.
import type { TaskKind } from "../router/types";
import { emit, newCorrelationId, type TraceEvent, addTraceSink } from "../router/telemetry";
import { AI_ALLOWED_RISK, type PlanStep, type RiskLevel, type ToolContext, type ToolRegistry, validatePlan } from "../tools/fabric";

export interface AgentSession {
  id: string;
  correlationId: string;
  channel: "chat" | "voice" | "admin" | "api";
  userId: string | null;
  startedAt: string;
  abort: AbortController;
}

export interface AgentContext { session: AgentSession; tools: ToolRegistry; toolContext: ToolContext; facts: Record<string, unknown> }

export interface ExecutionPolicy {
  maxSteps: number;
  maxToolCalls: number;
  allowedRisk: ReadonlySet<RiskLevel>;
  /** Phase 1: always false. */
  autonomousBooking: false;
}
export const DEFAULT_POLICY: ExecutionPolicy = { maxSteps: 6, maxToolCalls: 12, allowedRisk: AI_ALLOWED_RISK, autonomousBooking: false };

export interface Skill<I = unknown, O = unknown> {
  name: string;
  task: TaskKind;
  description: string;
  run(input: I, ctx: AgentContext): Promise<O>;
}

export interface SubAgent { name: string; skills: string[]; handle(goal: string, ctx: AgentContext): Promise<{ text: string; steps: PlanStep[] }> }

/** Planner proposes; supervisor validates against the fabric before anything runs. */
export interface Planner { plan(goal: string, ctx: AgentContext): Promise<PlanStep[]> }
export interface Supervisor { review(steps: PlanStep[], ctx: AgentContext): { ok: boolean; problems: string[] } }

export const defaultSupervisor = (policy: ExecutionPolicy = DEFAULT_POLICY): Supervisor => ({
  review(steps, ctx) {
    const v = validatePlan(ctx.tools, steps, ctx.toolContext, policy.maxSteps);
    const risky = steps.filter((s) => { const t = ctx.tools.get(s.tool); return t && !policy.allowedRisk.has(t.risk); }).map((s) => `${s.tool}:risk_blocked`);
    return { ok: v.ok && risky.length === 0, problems: [...v.problems, ...risky] };
  },
});

export class SkillRegistry {
  private skills = new Map<string, Skill<any, any>>();
  register(s: Skill<any, any>) { if (this.skills.has(s.name)) throw new Error(`Duplicate skill ${s.name}`); this.skills.set(s.name, s); return this; }
  get(n: string) { return this.skills.get(n); }
  list() { return [...this.skills.values()]; }
}

export function createSession(channel: AgentSession["channel"], userId: string | null = null, parent?: AbortSignal): AgentSession {
  const abort = new AbortController();
  if (parent) { if (parent.aborted) abort.abort(parent.reason); else parent.addEventListener("abort", () => abort.abort(parent.reason), { once: true }); }
  return { id: crypto.randomUUID(), correlationId: newCorrelationId(), channel, userId, startedAt: new Date().toISOString(), abort };
}

/** Collects trace events for one session (for tests / admin views). */
export function traceSession(session: AgentSession) {
  const events: TraceEvent[] = [];
  const off = addTraceSink((e) => { if (e.correlationId === session.correlationId) events.push(e); });
  return { events, stop: off };
}

/** Runs a validated plan step by step with cancellation and a tool-call budget. */
export async function executePlan(steps: PlanStep[], ctx: AgentContext, policy: ExecutionPolicy = DEFAULT_POLICY, supervisor = defaultSupervisor(policy)) {
  const review = supervisor.review(steps, ctx);
  if (!review.ok) return { ok: false as const, problems: review.problems, results: [] };
  const results: { tool: string; ok: boolean; result?: unknown; error?: string }[] = [];
  for (const s of steps.slice(0, policy.maxToolCalls)) {
    ctx.session.abort.signal.throwIfAborted();
    try { results.push({ tool: s.tool, ok: true, result: await ctx.tools.invoke(s.tool, s.input, ctx.toolContext) }); }
    catch (e) { results.push({ tool: s.tool, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }); }
  }
  emit({ type: "policy.decision", correlationId: ctx.session.correlationId, outcome: "plan_executed", meta: { steps: results.length } });
  return { ok: true as const, problems: [], results };
}
