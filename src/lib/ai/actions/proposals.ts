// High-risk action gate. AI can only PROPOSE a BOOK/PAY/MODIFY/CANCEL/REFUND/HOLD
// action. Execution needs explicit approval by the right principal AND a fresh
// deterministic revalidation (Booking Readiness / engine checks) at execution time.
import { z } from "zod";
import { emit } from "../router/telemetry";
import type { Permission, RiskLevel, ToolContext, ToolRegistry } from "../tools/fabric";

export const GATED_ACTIONS = ["HOLD", "BOOK", "PAY", "MODIFY", "CANCEL", "REFUND"] as const;
export type GatedAction = (typeof GATED_ACTIONS)[number];

/** Who must approve each action (existing Worldway boundaries). */
export const REQUIRED_APPROVER: Record<GatedAction, Permission> = {
  HOLD: "authenticated", BOOK: "authenticated", PAY: "authenticated", MODIFY: "authenticated", CANCEL: "authenticated", REFUND: "staff",
};

export const EvidenceSchema = z.object({ source: z.enum(["tool_result", "engine", "journey_version", "booking_record"]), ref: z.string().min(1).max(200), observedAt: z.string() });

export interface DeterministicValidation { ok: boolean; checkedAt: string; checks: string[]; blockers: string[] }
export type ApprovalState = "pending" | "approved" | "rejected" | "expired" | "executed" | "failed";

export interface ActionProposal {
  proposal_id: string;
  action: GatedAction;
  tool: string;
  target: { kind: string; id: string };
  input: unknown;
  rationale: string;
  evidence: z.infer<typeof EvidenceSchema>[];
  deterministic_validation: DeterministicValidation | null;
  required_permission: Permission;
  approval_state: ApprovalState;
  approved_by: string | null;
  created_by: "ai" | "user" | "staff";
  expires_at: string;
}

const RANK: Record<Permission, number> = { public: 0, authenticated: 1, staff: 2, super_admin: 3 };

/** Revalidator = existing deterministic boundary (Booking Readiness, refund rules, …). */
export type Revalidator = (p: ActionProposal) => Promise<DeterministicValidation>;

export class ProposalError extends Error { constructor(public code: string) { super(code); } }

export function propose(input: { action: GatedAction; tool: string; target: { kind: string; id: string }; payload: unknown; rationale: string; evidence: ActionProposal["evidence"]; ttlMs?: number; createdBy?: ActionProposal["created_by"] }, now = Date.now()): ActionProposal {
  if (!GATED_ACTIONS.includes(input.action)) throw new ProposalError("not_gated_action");
  if (!input.evidence.length || !input.evidence.every((e) => EvidenceSchema.safeParse(e).success)) throw new ProposalError("missing_evidence");
  return {
    proposal_id: crypto.randomUUID(), action: input.action, tool: input.tool, target: input.target, input: input.payload,
    rationale: input.rationale.slice(0, 500), evidence: input.evidence, deterministic_validation: null,
    required_permission: REQUIRED_APPROVER[input.action], approval_state: "pending", approved_by: null,
    created_by: input.createdBy ?? "ai", expires_at: new Date(now + Math.min(input.ttlMs ?? 15 * 60_000, 60 * 60_000)).toISOString(),
  };
}

/** Approval must come from a real principal — never from AI. */
export function approve(p: ActionProposal, approver: { userId: string; permission: Permission; isAi?: boolean }, now = Date.now()): ActionProposal {
  if (approver.isAi) throw new ProposalError("ai_cannot_approve");
  if (p.approval_state !== "pending") throw new ProposalError(`not_pending:${p.approval_state}`);
  if (Date.parse(p.expires_at) <= now) return { ...p, approval_state: "expired" };
  if (RANK[approver.permission] < RANK[p.required_permission]) throw new ProposalError("insufficient_permission");
  return { ...p, approval_state: "approved", approved_by: approver.userId };
}

/**
 * Executes an approved proposal: revalidates NOW, then invokes the tool with a
 * one-shot grant. Any failed check stops execution.
 */
export async function executeProposal(p: ActionProposal, reg: ToolRegistry, ctx: ToolContext, revalidate: Revalidator, now = Date.now()) {
  const fail = (code: string, extra: Partial<ActionProposal> = {}) => {
    emit({ type: "policy.decision", correlationId: ctx.correlationId, tool: p.tool, risk: p.action, outcome: "proposal_blocked", reason: code });
    return { ok: false as const, code, proposal: { ...p, ...extra } };
  };
  if (p.approval_state !== "approved" || !p.approved_by) return fail("not_approved");
  if (Date.parse(p.expires_at) <= now) return fail("expired", { approval_state: "expired" });
  const spec = reg.get(p.tool);
  if (!spec) return fail("unknown_tool");
  if (spec.risk !== (p.action as RiskLevel)) return fail("risk_mismatch");
  const v = await revalidate(p);
  if (!v.ok) return fail(`revalidation_failed:${v.blockers.join(",")}`, { deterministic_validation: v, approval_state: "failed" });
  try {
    const result = await reg.invoke(p.tool, p.input, { ...ctx, highRiskGrant: { tool: p.tool, grantedBy: p.action === "REFUND" ? "staff_approval" : "booking_readiness" } });
    return { ok: true as const, result, proposal: { ...p, deterministic_validation: v, approval_state: "executed" as const } };
  } catch {
    return fail("execution_failed", { deterministic_validation: v, approval_state: "failed" });
  }
}

/** Adapter to the existing engine: blocks unless the supplier is production-certified for booking. */
export async function bookingReadinessRevalidator(supplierKey: string): Promise<Revalidator> {
  const [{ supplierRegistry }, { bookingBlockers }] = await Promise.all([import("@/lib/engine/suppliers/catalog.server"), import("@/lib/engine/capabilities")]);
  return async () => {
    const blockers = bookingBlockers(supplierRegistry().get(supplierKey));
    return { ok: blockers.length === 0, checkedAt: new Date().toISOString(), checks: ["booking_readiness"], blockers: blockers.map(String) };
  };
}
