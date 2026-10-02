// Deterministic validation of every AI-generated plan before execution.
import type { PlanStep, RiskLevel, ToolContext, ToolRegistry } from "../tools/fabric";
import { authorize, HIGH_RISK } from "../tools/fabric";
import { assertNoAuthorityClaims } from "../safety/authority";
import { emit } from "../router/telemetry";

export interface ValidatedStep extends PlanStep { evidence?: { source: string; ref: string }[] }
export interface PlanScope { tools: string[]; allowedRisk: RiskLevel[]; today?: string; maxSteps?: number }

const BYPASS_KEYS = /^(skip_?readiness|force|bypass\w*|override_?price|no_?revalidat\w*|approved|grant)$/i;
const DATE_PAIRS: [string, string][] = [["depart_date", "return_date"], ["check_in", "check_out"], ["departFrom", "returnBy"]];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function findBypass(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => findBypass(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (BYPASS_KEYS.test(k)) out.push(k); findBypass(x, out); }
  return out;
}

export function chronologyProblems(input: unknown, today: string): string[] {
  if (!input || typeof input !== "object") return [];
  const o = input as Record<string, unknown>;
  const p: string[] = [];
  for (const [a, b] of DATE_PAIRS) {
    const x = o[a], y = o[b];
    if (typeof x === "string" && ISO.test(x) && x < today) p.push(`${a}_in_past`);
    if (typeof x === "string" && typeof y === "string" && ISO.test(x) && ISO.test(y) && y < x) p.push(`${b}_before_${a}`);
  }
  return p;
}

export function validateAgentPlan(reg: ToolRegistry, steps: ValidatedStep[], ctx: ToolContext, scope: PlanScope) {
  const today = scope.today ?? new Date().toISOString().slice(0, 10);
  const problems: string[] = [];
  if (!steps.length) problems.push("empty_plan");
  if (steps.length > (scope.maxSteps ?? 8)) problems.push(`too_many_steps:${steps.length}`);
  steps.forEach((s, i) => {
    const spec = reg.get(s.tool);
    if (!spec) return void problems.push(`${i}:unknown_tool:${s.tool}`);
    if (!scope.tools.includes(s.tool)) problems.push(`${i}:${s.tool}:out_of_scope`);
    if (!scope.allowedRisk.includes(spec.risk)) problems.push(`${i}:${s.tool}:risk_not_allowed:${spec.risk}`);
    if (HIGH_RISK.has(spec.risk)) problems.push(`${i}:${s.tool}:requires_action_proposal`);
    const a = authorize(spec, ctx);
    if (!a.ok) problems.push(`${i}:${s.tool}:${a.reason}`);
    if (!spec.input.safeParse(s.input).success) problems.push(`${i}:${s.tool}:malformed_arguments`);
    const by = findBypass(s.input);
    if (by.length) problems.push(`${i}:${s.tool}:readiness_bypass:${by.join("|")}`);
    for (const c of chronologyProblems(s.input, today)) problems.push(`${i}:${s.tool}:chronology:${c}`);
    if (spec.risk === "QUOTE" && !(s.evidence?.length)) problems.push(`${i}:${s.tool}:missing_evidence`);
    if (s.rationale) { try { assertNoAuthorityClaims(s.rationale); } catch { problems.push(`${i}:${s.tool}:authority_claim`); } }
  });
  if (problems.length) emit({ type: "plan.rejected", correlationId: ctx.correlationId, sessionId: ctx.sessionId, reason: problems.join("|") });
  return { ok: problems.length === 0, problems };
}
