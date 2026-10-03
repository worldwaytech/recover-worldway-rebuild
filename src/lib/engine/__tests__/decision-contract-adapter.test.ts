import { describe, expect, it } from "vitest";
import { projectDecisionContractToRankingProfile } from "../decision-contract-adapter";

const base = {
  contractVersion: "1.0" as const,
  decisionKind: "ranking" as const,
  decision: "rank for the traveller",
  confidence: 0.9,
  evidence: [{ source: "test", reference: "contract:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
  correlationId: "wwai-test",
  sourceTaskId: "decision-step",
  constraints: [] as string[],
  expiresAt: "2099-01-01T00:00:00Z",
};

describe("decision contract engine adapter", () => {
  it("projects only explicit bounded ranking hints", () => {
    const profile = projectDecisionContractToRankingProfile({
      ...base,
      constraints: [
        "ranking.weight.luxury=0.8",
        "ranking.weight.price=1",
        "ranking.weight.reliability=0.4",
      ],
    });
    expect(profile).toEqual({ weights: { luxury: 0.8, price: 1, reliability: 0.4 } });
  });

  it("ignores untrusted or unsupported constraint syntax", () => {
    const profile = projectDecisionContractToRankingProfile({
      ...base,
      constraints: [
        "ranking.weight.price=2",
        "ranking.weight.margin=0.7",
        "price=0",
        "ranking.weight.unknown=1",
        "ranking.weight.luxury=-1",
      ],
    });
    expect(profile).toEqual({ weights: { margin: 0.7 } });
  });

  it("rejects non-ranking decisions", () => {
    expect(() => projectDecisionContractToRankingProfile({
      ...base,
      decisionKind: "routing",
    })).toThrow("decision_contract_not_ranking_compatible");
  });
});
