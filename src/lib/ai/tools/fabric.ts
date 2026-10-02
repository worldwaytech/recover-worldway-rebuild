// Worldway Tool Fabric — every AI-callable tool is declared here with schemas,
// risk level, permission and audit requirements. Pure; execution is injected.
import type { z } from "zod";
import { emit } from "../router/telemetry";
import { scanForInjection, sanitizeUntrusted } from "../safety/content";
import { assertNoAuthorityClaims } from "../safety/authority";

export const RISK_LEVELS = ["READ", "SEARCH", "ANALYZE", "SIMULATE", "QUOTE", "HOLD", "MODIFY", "BOOK", "PAY", "CANCEL", "REFUND", "ADMIN"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Phase 1: AI may only run non-mutating tools. Mutations stay with deterministic flows. */
export const AI_ALLOWED_RISK: ReadonlySet<RiskLevel> = new Set(["READ", "SEARCH", "ANALYZE", "SIMULATE", "QUOTE"]);
export const HIGH_RISK: ReadonlySet<RiskLevel> = new Set(["HOLD", "MODIFY", "BOOK", "PAY", "CANCEL", "REFUND", "ADMIN"]);

export type Permission = "public" | "authenticated" | "staff" | "super_admin";
export type Scope = "commerce:read" | "commerce:quote" | "journey:read" | "journey:simulate" | "booking:write" | "payment:write" | "admin";

export interface ToolSpec<I = unknown, O = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  output?: z.ZodType<O>;
  risk: RiskLevel;
  permission: Permission;
  scopes: Scope[];
  audit: "none" | "trace" | "persist";
  /** Output contains supplier/web content that must be treated as untrusted. */
  untrustedOutput?: boolean;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
}

export interface ToolContext {
  correlationId: string;
  principal: { permission: Permission; scopes: Scope[]; userId?: string | null };
  signal?: AbortSignal;
  /** Explicit, deterministic authorisation for high-risk tools (e.g. booking readiness). Phase 1: never granted to AI. */
  highRiskGrant?: { tool: string; grantedBy: "booking_readiness" | "staff_approval" };
}

export class ToolDeniedError extends Error {
  constructor(public tool: string, public reason: string) { super(`Tool ${tool} denied: ${reason}`); }
}

const RANK: Record<Permission, number> = { public: 0, authenticated: 1, staff: 2, super_admin: 3 };

export function authorize(spec: ToolSpec<any, any>, ctx: ToolContext): { ok: true } | { ok: false; reason: string } {
  if (!RISK_LEVELS.includes(spec.risk)) return { ok: false, reason: "unknown_risk" };
  if (RANK[ctx.principal.permission] < RANK[spec.permission]) return { ok: false, reason: "permission" };
  if (!spec.scopes.every((s) => ctx.principal.scopes.includes(s))) return { ok: false, reason: "scope" };
  if (HIGH_RISK.has(spec.risk)) {
    if (!ctx.highRiskGrant || ctx.highRiskGrant.tool !== spec.name) return { ok: false, reason: "high_risk_requires_deterministic_grant" };
  } else if (!AI_ALLOWED_RISK.has(spec.risk)) return { ok: false, reason: "risk_not_allowed" };
  return { ok: true };
}

export class ToolRegistry {
  private tools = new Map<string, ToolSpec<any, any>>();
  register<I, O>(spec: ToolSpec<I, O>) {
    if (this.tools.has(spec.name)) throw new Error(`Duplicate tool ${spec.name}`);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(spec.name)) throw new Error(`Invalid tool name ${spec.name}`);
    this.tools.set(spec.name, spec);
    return this;
  }
  get(name: string) { return this.tools.get(name); }
  list() { return [...this.tools.values()]; }
  /** Tools a principal may see — the model is never offered tools it can't run. */
  visible(ctx: ToolContext) { return this.list().filter((t) => authorize(t, ctx).ok); }

  async invoke(name: string, raw: unknown, ctx: ToolContext): Promise<unknown> {
    const spec = this.tools.get(name);
    if (!spec) { emit({ type: "tool.denied", correlationId: ctx.correlationId, tool: name, reason: "unknown_tool" }); throw new ToolDeniedError(name, "unknown_tool"); }
    const auth = authorize(spec, ctx);
    emit({ type: "policy.decision", correlationId: ctx.correlationId, tool: name, risk: spec.risk, outcome: auth.ok ? "allow" : "deny", reason: auth.ok ? undefined : auth.reason });
    if (!auth.ok) throw new ToolDeniedError(name, auth.reason);

    // Tool-boundary injection hook on model-produced arguments.
    const flags = scanForInjection(JSON.stringify(raw ?? {}));
    if (flags.length) {
      emit({ type: "safety.flag", correlationId: ctx.correlationId, tool: name, outcome: "input_blocked", reason: flags.join(",") });
      throw new ToolDeniedError(name, "unsafe_input");
    }
    const parsed = spec.input.safeParse(raw);
    if (!parsed.success) {
      emit({ type: "tool.denied", correlationId: ctx.correlationId, tool: name, reason: "schema" });
      throw new ToolDeniedError(name, `invalid_input: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ").slice(0, 200)}`);
    }
    ctx.signal?.throwIfAborted();
    const t0 = Date.now();
    emit({ type: "tool.call", correlationId: ctx.correlationId, tool: name, risk: spec.risk });
    try {
      let out = await spec.execute(parsed.data, ctx);
      if (spec.output) {
        const o = spec.output.safeParse(out);
        if (!o.success) throw new ToolDeniedError(name, "invalid_output");
        out = o.data;
      }
      if (spec.untrustedOutput) out = sanitizeUntrusted(out, (f) => emit({ type: "safety.flag", correlationId: ctx.correlationId, tool: name, outcome: "output_neutralised", reason: f.join(",") }));
      emit({ type: "tool.result", correlationId: ctx.correlationId, tool: name, risk: spec.risk, ms: Date.now() - t0, outcome: "ok" });
      return out;
    } catch (e) {
      emit({ type: "tool.result", correlationId: ctx.correlationId, tool: name, risk: spec.risk, ms: Date.now() - t0, outcome: "error" });
      throw e;
    }
  }
}

/** Plan validation before execution: every step must exist, be authorised, and parse. */
export interface PlanStep { tool: string; input: unknown; rationale?: string }
export function validatePlan(reg: ToolRegistry, steps: PlanStep[], ctx: ToolContext, maxSteps = 12) {
  const problems: string[] = [];
  if (steps.length > maxSteps) problems.push(`too_many_steps:${steps.length}`);
  steps.forEach((s, i) => {
    const spec = reg.get(s.tool);
    if (!spec) return problems.push(`${i}:unknown_tool:${s.tool}`);
    const a = authorize(spec, ctx);
    if (!a.ok) problems.push(`${i}:${s.tool}:${a.reason}`);
    if (!spec.input.safeParse(s.input).success) problems.push(`${i}:${s.tool}:invalid_input`);
    if (s.rationale) { try { assertNoAuthorityClaims(s.rationale); } catch { problems.push(`${i}:${s.tool}:authority_claim`); } }
  });
  if (problems.length) emit({ type: "plan.rejected", correlationId: ctx.correlationId, reason: problems.join("|") });
  return { ok: problems.length === 0, problems };
}
