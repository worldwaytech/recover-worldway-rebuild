import { describe, expect, it } from "vitest";
import {
  createWorldwayDecisionContract,
  isWorldwayDecisionContract,
} from "../decision-contract";

const evidence = [
  {
    source: "travel-graph",
    reference: "edge:ist:123",
    observedAt: "2026-10-03T00:00:00Z",
    confidence: 0.9,
    expiresAt: "2026-10-04T00:00:00Z",
  },
];

describe("Worldway typed decision contract", () => {
  it("creates a bounded provenance-backed contract", () => {
    const contract = createWorldwayDecisionContract({
      decisionKind: "recommendation",
      decision: "Use the validated itinerary",
      confidence: 0.94,
      evidence,
      correlationId: "wwai-test",
      constraints: ["deterministic-only"],
    });

    expect(contract).not.toBeNull();
    expect(contract).toMatchObject({
      contractVersion: "1.0",
      decisionKind: "recommendation",
      decision: "Use the validated itinerary",
      confidence: 0.94,
      correlationId: "wwai-test",
      constraints: ["deterministic-only"],
    });
    expect(contract?.evidence[0]).toEqual(evidence[0]);
    expect(isWorldwayDecisionContract(contract)).toBe(true);
  });

  it("fails closed without provenance or a usable decision", () => {
    expect(createWorldwayDecisionContract({
      decisionKind: "recommendation",
      decision: "Use it",
      confidence: 0.8,
      evidence: [],
      correlationId: "wwai-test",
    })).toBeNull();

    expect(createWorldwayDecisionContract({
      decisionKind: "recommendation",
      decision: "",
      confidence: 0.8,
      evidence,
      correlationId: "wwai-test",
    })).toBeNull();
  });

  it("sanitizes evidence and bounds decision metadata", () => {
    const contract = createWorldwayDecisionContract({
      decisionKind: "ranking",
      decision: "  choose option A  ",
      confidence: 7,
      evidence: [
        ...evidence,
        { source: "ignored", reference: "not valid ref!", observedAt: "2026-10-03T00:00:00Z", confidence: 0.5 },
      ],
      correlationId: "wwai-test",
      constraints: ["  first  ", 123, "", "  second  "],
    });

    expect(contract?.decision).toBe("choose option A");
    expect(contract?.confidence).toBe(1);
    expect(contract?.evidence).toHaveLength(1);
    expect(contract?.constraints).toEqual(["first", "second"]);
  });

  it("rejects structurally incomplete contracts", () => {
    expect(isWorldwayDecisionContract({
      contractVersion: "1.0",
      decisionKind: "recommendation",
      decision: "ok",
      confidence: 0.8,
      evidence: [],
      correlationId: "wwai-test",
      constraints: [],
    })).toBe(false);
  });
});
