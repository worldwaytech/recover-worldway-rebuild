import type { RiskLevel } from "../tools/fabric";
import { GATED_ACTIONS, type GatedAction, propose, type ActionProposal } from "../actions/proposals";

export const AGENT_ROLES = [
  "customer","concierge","trip_planner","inventory","ranking","pricing",
  "supplier","payment","booking","fulfilment","post_booking",
] as const;
export type AgentRole = typeof AGENT_ROLES[number];

export const COMMERCE_STAGES = [
  "customer","concierge","trip_planner","inventory","ranking","pricing",
  "supplier","payment","booking","fulfilment","post_booking",
] as const;
export type CommerceStage = typeof COMMERCE_STAGES[number];

export interface AgentMessage {
  id: string;
  from: AgentRole;
  to: AgentRole;
  type: "request" | "result" | "proposal" | "event";
  correlationId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface FinancialLimits {
  currency: string;
  maxTripTotal: number;
  maxSingleTransaction: number;
  maxSupplierExposure: number;
  requireApprovalAbove: number;
}

export interface AutonomyPolicy {
  enabled: boolean;
  maxStages: number;
  maxAgentMessages: number;
  maxFinancialExposure: number;
  financialLimits: FinancialLimits;
  allowedActions: readonly GatedAction[];
  requireHumanApprovalForMutation: boolean;
  requireFreshRevalidation: boolean;
  allowSupplierAgentCommerce: boolean;
}

export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  enabled: true,
  maxStages: 11,
  maxAgentMessages: 32,
  maxFinancialExposure: 0,
  financialLimits: {
    currency: "USD",
    maxTripTotal: 0,
    maxSingleTransaction: 0,
    maxSupplierExposure: 0,
    requireApprovalAbove: 0,
  },
  allowedActions: GATED_ACTIONS,
  requireHumanApprovalForMutation: true,
  requireFreshRevalidation: true,
  allowSupplierAgentCommerce: true,
};

export interface CommerceAgentState {
  correlationId: string;
  stage: CommerceStage;
  completed: CommerceStage[];
  facts: Record<string, unknown>;
  messages: AgentMessage[];
  proposals: ActionProposal[];
  blockers: string[];
  financialExposure: number;
}

export function createAutonomousCommerceState(correlationId: string, facts: Record<string, unknown> = {}): CommerceAgentState {
  return { correlationId, stage: "customer", completed: [], facts: { ...facts }, messages: [], proposals: [], blockers: [], financialExposure: 0 };
}

export function nextCommerceStage(state: CommerceAgentState): CommerceStage | null {
  const i = COMMERCE_STAGES.indexOf(state.stage);
  return i >= 0 && i + 1 < COMMERCE_STAGES.length ? COMMERCE_STAGES[i + 1] : null;
}

export function authorizeAgentHandoff(
  from: AgentRole,
  to: AgentRole,
  policy: AutonomyPolicy,
): { allowed: boolean; reason: string } {
  if (!policy.enabled) return { allowed: false, reason: "autonomy_disabled" };
  if (!AGENT_ROLES.includes(from) || !AGENT_ROLES.includes(to)) return { allowed: false, reason: "unknown_agent" };
  if (from === to) return { allowed: false, reason: "self_handoff" };
  return { allowed: true, reason: "allowed" };
}

export function recordAgentMessage(
  state: CommerceAgentState,
  message: Omit<AgentMessage, "id" | "createdAt">,
  policy: AutonomyPolicy,
): CommerceAgentState {
  if (state.messages.length >= policy.maxAgentMessages) {
    return { ...state, blockers: [...state.blockers, "agent_message_limit"] };
  }
  const handoff = authorizeAgentHandoff(message.from, message.to, policy);
  if (!handoff.allowed) return { ...state, blockers: [...state.blockers, handoff.reason] };
  return {
    ...state,
    messages: [...state.messages, { ...message, id: crypto.randomUUID(), createdAt: new Date().toISOString() }],
  };
}

export function enforceFinancialLimit(amount: number, policy: AutonomyPolicy): { allowed: boolean; reason: string } {
  if (!Number.isFinite(amount) || amount < 0) return { allowed: false, reason: "invalid_amount" };
  if (policy.maxFinancialExposure <= 0 || policy.financialLimits.maxSingleTransaction <= 0) {
    return { allowed: false, reason: "autonomous_financial_limit_zero" };
  }
  if (amount > policy.maxFinancialExposure) return { allowed: false, reason: "autonomy_exposure_limit" };
  if (amount > policy.financialLimits.maxSingleTransaction) return { allowed: false, reason: "single_transaction_limit" };
  return { allowed: true, reason: "within_limit" };
}

export function buildActionProposal(
  input: {
    action: GatedAction;
    tool: string;
    target: { kind: string; id: string };
    payload: unknown;
    rationale: string;
    evidence: { source: "tool_result" | "engine" | "journey_version" | "booking_record"; ref: string; observedAt: string }[];
  },
  policy: AutonomyPolicy,
  financialAmount = 0,
): { proposal?: ActionProposal; blockers: string[] } {
  const blockers: string[] = [];
  if (!policy.enabled) blockers.push("autonomy_disabled");
  if (!policy.allowedActions.includes(input.action)) blockers.push("action_not_allowed");
  if (policy.requireHumanApprovalForMutation) {
    // Proposal is allowed; execution remains gated by a real approver.
  }
  if (policy.requireFreshRevalidation && input.action !== "HOLD") {
    // Existing executeProposal performs the final deterministic revalidation.
  }
  if (["PAY","BOOK","REFUND"].includes(input.action)) {
    const limit = enforceFinancialLimit(financialAmount, policy);
    if (!limit.allowed) blockers.push(limit.reason);
  }
  if (blockers.length) return { blockers };
  return { proposal: propose({ ...input, createdBy: "ai" }) , blockers };
}

export interface RecoveryDecision {
  action: "replan" | "rebook" | "refund_proposal" | "human_escalation" | "continue";
  reason: string;
}

export function disruptionRecoveryDecision(input: {
  supplierFailure: boolean;
  inventoryChanged: boolean;
  priceChanged: boolean;
  customerApprovalRequired: boolean;
  refundEligible: boolean;
}): RecoveryDecision {
  if (input.supplierFailure && input.inventoryChanged) return { action: "replan", reason: "supplier_inventory_changed" };
  if (input.supplierFailure && !input.inventoryChanged) return { action: "rebook", reason: "supplier_failure_with_alternative_path" };
  if (input.priceChanged && input.customerApprovalRequired) return { action: "human_escalation", reason: "commercial_change_requires_customer_approval" };
  if (input.refundEligible) return { action: "refund_proposal", reason: "refund_eligibility_detected" };
  return { action: "continue", reason: "no_recovery_action_required" };
}

export function riskForStage(stage: CommerceStage): RiskLevel {
  if (["payment","booking"].includes(stage)) return "PAY";
  if (["fulfilment","post_booking"].includes(stage)) return "MODIFY";
  if (stage === "supplier") return "SEARCH";
  if (stage === "pricing") return "QUOTE";
  return "ANALYZE";
}
