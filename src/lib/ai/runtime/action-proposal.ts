import { z } from "zod";
import type { RiskLevel } from "../tools/fabric";
import { HIGH_RISK } from "../tools/fabric";
import { assertNoAuthorityClaims } from "../safety/authority";

export const PROPOSAL_ACTIONS = ["HOLD","MODIFY","BOOK","PAY","CANCEL","REFUND"] as const;
export type ProposalAction = (typeof PROPOSAL_ACTIONS)[number];

export const ActionProposalSchema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum(PROPOSAL_ACTIONS),
  target: z.string().min(1).max(200),
  rationale: z.string().min(1).max(1000),
  evidence: z.array(z.string().min(1).max(240)).max(20),
  deterministic_validation: z.object({
    valid: z.boolean(),
    checked_at: z.string().datetime(),
    checks: z.array(z.string().max(160)).max(50),
  }),
  required_permission: z.enum(["authenticated","staff","super_admin"]),
  approval_state: z.enum(["proposed","approved","rejected","expired"]),
  expires_at: z.string().datetime(),
});
export type ActionProposal = z.infer<typeof ActionProposalSchema>;

export function validateActionProposal(proposal: unknown): ActionProposal {
  const parsed = ActionProposalSchema.parse(proposal);
  assertNoAuthorityClaims(parsed.rationale);
  if (!parsed.deterministic_validation.valid) {
    throw new Error("action_proposal_requires_deterministic_validation");
  }
  if (new Date(parsed.expires_at).getTime() <= Date.now()) {
    throw new Error("action_proposal_expired");
  }
  return parsed;
}

export function riskRequiresProposal(risk: RiskLevel): boolean {
  return HIGH_RISK.has(risk);
}

export function canExecuteProposal(proposal: ActionProposal): boolean {
  return proposal.approval_state === "approved"
    && proposal.deterministic_validation.valid
    && new Date(proposal.expires_at).getTime() > Date.now();
}
