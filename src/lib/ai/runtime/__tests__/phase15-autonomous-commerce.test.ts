import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTONOMY_POLICY,
  buildActionProposal,
  createAutonomousCommerceState,
  enforceFinancialLimit,
  nextCommerceStage,
  recordAgentMessage,
  disruptionRecoveryDecision,
  riskForStage,
} from "../autonomous-commerce";

describe("Worldway Phase 15 autonomous intelligence", () => {
  it("coordinates the deterministic commerce sequence", () => {
    const s = createAutonomousCommerceState("c1");
    expect(nextCommerceStage(s)).toBe("concierge");
    expect(riskForStage("pricing")).toBe("QUOTE");
    expect(riskForStage("booking")).toBe("PAY");
  });

  it("keeps autonomous financial authority disabled by default", () => {
    expect(enforceFinancialLimit(1, DEFAULT_AUTONOMY_POLICY).allowed).toBe(false);
    const p = buildActionProposal({
      action: "BOOK", tool: "book", target: { kind: "booking", id: "b1" }, payload: {},
      rationale: "book after deterministic readiness", evidence: [{ source: "engine", ref: "readiness:1", observedAt: new Date().toISOString() }],
    }, DEFAULT_AUTONOMY_POLICY, 100);
    expect(p.proposal).toBeUndefined();
    expect(p.blockers).toContain("autonomous_financial_limit_zero");
  });

  it("limits agent-to-agent message fanout", () => {
    const policy = { ...DEFAULT_AUTONOMY_POLICY, maxAgentMessages: 1 };
    let s = createAutonomousCommerceState("c1");
    s = recordAgentMessage(s, { from: "customer", to: "concierge", type: "request", correlationId: "c1", payload: {} }, policy);
    s = recordAgentMessage(s, { from: "concierge", to: "trip_planner", type: "request", correlationId: "c1", payload: {} }, policy);
    expect(s.messages).toHaveLength(1);
    expect(s.blockers).toContain("agent_message_limit");
  });

  it("never treats supplier failure as a reason to silently charge", () => {
    expect(disruptionRecoveryDecision({ supplierFailure: true, inventoryChanged: true, priceChanged: false, customerApprovalRequired: false, refundEligible: false }).action).toBe("replan");
    expect(disruptionRecoveryDecision({ supplierFailure: false, inventoryChanged: false, priceChanged: true, customerApprovalRequired: true, refundEligible: false }).action).toBe("human_escalation");
  });
});
