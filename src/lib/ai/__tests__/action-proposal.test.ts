import { describe, expect, it } from "vitest";
import { canExecuteProposal, validateActionProposal } from "../runtime/action-proposal";

const base = {
  proposal_id: "00000000-0000-4000-8000-000000000001",
  action: "BOOK" as const,
  target: "journey-123",
  rationale: "Prepare the requested booking after deterministic validation.",
  evidence: ["Worldway package audit"],
  deterministic_validation: {
    valid: true,
    checked_at: "2026-10-02T00:00:00.000Z",
    checks: ["chronology"],
  },
  required_permission: "authenticated" as const,
  approval_state: "approved" as const,
  expires_at: "2099-01-01T00:00:00.000Z",
};

describe("high-risk action proposals", () => {
  it("requires deterministic validation and approval", () => {
    expect(canExecuteProposal(validateActionProposal(base))).toBe(true);
    expect(canExecuteProposal(validateActionProposal({...base, approval_state:"proposed"}))).toBe(false);
  });

  it("rejects authority claims in AI rationale", () => {
    expect(() => validateActionProposal({...base, rationale:"Booking is confirmed."})).toThrow();
  });
});
