import { describe, expect, it } from "vitest";
import { buildSpecialistCoordinationEnvelope } from "./specialist-agents";
import { isSpecialistDecisionSynthesisContract, synthesizeSpecialistDecisions } from "./decision-synthesis";

const evidence = (reference: string, expiresAt?: string) => [{
  source: "test",
  reference,
  observedAt: "2026-10-03T08:00:00.000Z",
  confidence: 0.9,
  ...(expiresAt ? { expiresAt } : {}),
}];

function envelope(outputs: unknown[], withEvidence = true) {
  return buildSpecialistCoordinationEnvelope("corr-synthesis-1", outputs.map((output, index) => ({
    specialist: index === 0 ? "flight_intelligence" : "hotel_intelligence",
    taskId: `specialist-${index + 1}`,
    state: "completed" as const,
    output,
    evidence: withEvidence ? evidence(`ref-${index + 1}`) : [],
  })));
}

describe("context-aware specialist decision synthesis", () => {
  it("removes execution authority fields from specialist findings", () => {
    const result = synthesizeSpecialistDecisions(envelope([
      {
        recommendation: "review",
        executionAuthority: true,
        payment: { action: "charge", amount: 100 },
        nested: { booking: { execute: true }, safe: "kept" },
      },
    ])!, { expectedCorrelationId: "corr-synthesis-1" });
    expect(result?.status).toBe("ready");
    expect(result?.findings[0].output).toMatchObject({
      recommendation: "review",
      nested: { safe: "kept" },
    });
    expect(result?.findings[0].output).not.toHaveProperty("executionAuthority");
    expect(result?.findings[0].output).not.toHaveProperty("payment");
    expect(result?.findings[0].output).not.toHaveProperty("nested.booking");
  });

  it("produces a ready synthesis for compatible findings", () => {
    const result = synthesizeSpecialistDecisions(envelope([
      { recommendation: "keep", classification: "feasible" },
      { recommendation: "keep", classification: "feasible" },
    ])!, { expectedCorrelationId: "corr-synthesis-1" });

    expect(result?.status).toBe("ready");
    expect(result?.sourceTaskIds).toEqual(["specialist-1", "specialist-2"]);
    expect(result?.evidenceCoverage.ratio).toBe(1);
    expect(isSpecialistDecisionSynthesisContract(result)).toBe(true);
  });

  it("marks conflicting recommendations without selecting a winner", () => {
    const result = synthesizeSpecialistDecisions(envelope([
      { recommendation: "keep" },
      { recommendation: "reject" },
    ])!, { expectedCorrelationId: "corr-synthesis-1" });

    expect(result?.status).toBe("conflicted");
    expect(result?.conflicts[0]?.field).toBe("recommendation");
    expect(result?.conflicts[0]?.values.map((item) => item.value)).toEqual(["keep", "reject"]);
  });

  it("reports insufficient evidence when no member has usable evidence", () => {
    const result = synthesizeSpecialistDecisions(envelope([
      { recommendation: "keep" },
      { recommendation: "keep" },
    ], false)!, { expectedCorrelationId: "corr-synthesis-1" });

    expect(result?.status).toBe("insufficient_evidence");
    expect(result?.evidenceCoverage.membersWithEvidence).toBe(0);
  });

  it("rejects a correlation mismatch", () => {
    const result = synthesizeSpecialistDecisions(envelope([{ recommendation: "keep" }])!, {
      expectedCorrelationId: "different-correlation",
    });
    expect(result).toBeNull();
  });

  it("rejects expired evidence", () => {
    const source = buildSpecialistCoordinationEnvelope("corr-synthesis-1", [{
      specialist: "flight_intelligence",
      taskId: "specialist-1",
      state: "completed" as const,
      output: { recommendation: "keep" },
      evidence: evidence("expired-ref", "2026-10-03T07:00:00.000Z"),
    }])!;
    const result = synthesizeSpecialistDecisions(source, {
      expectedCorrelationId: "corr-synthesis-1",
      now: new Date("2026-10-03T08:00:00.000Z"),
    });
    expect(result).toBeNull();
  });

  it("rejects malformed member output", () => {
    const source = buildSpecialistCoordinationEnvelope("corr-synthesis-1", [{
      specialist: "flight_intelligence",
      taskId: "specialist-1",
      state: "completed" as const,
      output: "not-an-object",
      evidence: evidence("ref-1"),
    }]);
    expect(source).toBeNull();
  });
});
