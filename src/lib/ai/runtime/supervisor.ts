// Supervisor + Planner (Phase 2). Deterministic planning over skills; every plan is
// validated before execution; step/loop/time limits; no high-risk execution.
import type { ToolContext, ToolRegistry, RiskLevel } from "../tools/fabric";
import { emit } from "../router/telemetry";
import { createSession, type AgentSession } from "./runtime";
import { chooseSpecialists, type SpecialistConfig } from "./agents";
import { skill, type SkillGoal } from "./skills";
import { validateAgentPlan, type ValidatedStep } from "./plan-validation";
import { buildTravelAgentContext, type TravelAgentContext } from "./travel-context";

export interface RunLimits { maxSkills: number; maxSteps: number; maxToolCalls: number; timeoutMs: number }
export const DEFAULT_LIMITS: RunLimits = { maxSkills: 4, maxSteps: 8, maxToolCalls: 8, timeoutMs: 180_000 };
const READ_ONLY: RiskLevel[] = ["READ", "SEARCH", "ANALYZE", "SIMULATE", "QUOTE"];

export interface SkillOutcome { skill: string; specialist: string; ok: boolean; problems?: string[]; results?: unknown[]; analysis?: unknown }
export interface SupervisorResult {
  sessionId: string;
  correlationId: string;
  specialists: string[];
  unavailable: { id: string; note?: string }[];
  outcomes: SkillOutcome[];
  cancelled: boolean;
  travelContext?: TravelAgentContext;
}

export class Planner {
  /** Selects skills for chosen specialists, de-duplicated, within limits. */
  plan(specialists: SpecialistConfig[], limits: RunLimits) {
    const seen = new Set<string>();
    const out: { specialist: SpecialistConfig; skill: string }[] = [];
    for (const sp of specialists) {
      for (const s of sp.skills) {
        if (!seen.has(s) && out.length < limits.maxSkills) {
          seen.add(s);
          out.push({ specialist: sp, skill: s });
        }
      }
    }
    return out;
  }
}

export class Supervisor {
  constructor(private tools: ToolRegistry, private limits: RunLimits = DEFAULT_LIMITS, private planner = new Planner()) {}

  async run(
    task: string,
    goal: SkillGoal,
    base: Omit<ToolContext, "correlationId" | "context" | "sessionId">,
    parent?: AbortSignal,
    travelContext?: TravelAgentContext,
  ): Promise<SupervisorResult> {
    const session: AgentSession = createSession("api", base.principal.userId ?? null, parent, this.limits.timeoutMs);
    const ctx: ToolContext = {
      ...base,
      correlationId: session.correlationId,
      sessionId: session.id,
      context: "agent_runtime",
      signal: session.abort.signal,
      highRiskGrant: undefined,
    };
    const { chosen, unavailable } = chooseSpecialists(task);
    const effectiveGoal: SkillGoal = travelContext ? { ...goal, travelContext } : goal;

    emit({
      type: "policy.decision",
      correlationId: ctx.correlationId,
      sessionId: session.id,
      outcome: "specialists_chosen",
      meta: { chosen: chosen.map((c) => c.id).join(","), unavailable: unavailable.length },
    });

    const outcomes: SkillOutcome[] = [];
    let toolCalls = 0;
    try {
      for (const { specialist, skill: name } of this.planner.plan(chosen, this.limits)) {
        session.abort.signal.throwIfAborted();
        const s = skill(name);
        if (!s) {
          outcomes.push({ skill: name, specialist: specialist.id, ok: false, problems: ["unknown_skill"] });
          continue;
        }
        const allowedRisk = s.allowedRisk.filter((r) => specialist.allowedRisk.includes(r) && READ_ONLY.includes(r));
        if (s.analyze) {
          outcomes.push({ skill: name, specialist: specialist.id, ok: true, analysis: await s.analyze(effectiveGoal) });
          continue;
        }
        let steps: ValidatedStep[] = [];
        try {
          steps = s.plan!(effectiveGoal);
        } catch {
          outcomes.push({ skill: name, specialist: specialist.id, ok: false, problems: ["insufficient_requirements"] });
          continue;
        }
        const v = validateAgentPlan(this.tools, steps, ctx, { tools: s.tools, allowedRisk, maxSteps: this.limits.maxSteps });
        if (!v.ok) {
          outcomes.push({ skill: name, specialist: specialist.id, ok: false, problems: v.problems });
          continue;
        }
        const results: unknown[] = [];
        for (const st of steps) {
          if (++toolCalls > this.limits.maxToolCalls) {
            outcomes.push({ skill: name, specialist: specialist.id, ok: false, problems: ["tool_call_limit"] });
            break;
          }
          try {
            results.push(await this.tools.invoke(st.tool, st.input, ctx));
          } catch (e) {
            results.push({ ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "error" });
          }
        }
        outcomes.push({ skill: name, specialist: specialist.id, ok: true, results });
      }
    } catch (e) {
      if (!session.abort.signal.aborted) throw e;
    }

    const cancelled = session.abort.signal.aborted;
    if (!cancelled) session.abort.abort();
    emit({
      type: "policy.decision",
      correlationId: ctx.correlationId,
      sessionId: session.id,
      outcome: cancelled ? "run_cancelled" : "run_complete",
      meta: { skills: outcomes.length, toolCalls },
    });
    return {
      sessionId: session.id,
      correlationId: session.correlationId,
      specialists: chosen.map((c) => c.id),
      unavailable: unavailable.map((u) => ({ id: u.id, note: u.note })),
      outcomes,
      cancelled,
      travelContext,
    };
  }

  /** Server-side convenience entrypoint: load consented memory before planning. */
  async runWithTravelMemory(
    task: string,
    goal: SkillGoal,
    base: Omit<ToolContext, "correlationId" | "context" | "sessionId">,
    db: { from: (table: string) => any },
    parent?: AbortSignal,
  ): Promise<SupervisorResult> {
    if (!base.principal.userId) return this.run(task, goal, base, parent);
    const travelContext = await buildTravelAgentContext(db, base.principal.userId);
    return this.run(task, goal, base, parent, travelContext);
  }
}
