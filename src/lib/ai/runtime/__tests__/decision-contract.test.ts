import { describe, expect, it } from "vitest";
import {
  bindSpecialistSynthesisToDecisionContract,
  createWorldwayDecisionContract,
  isWorldwayDecisionContract,
  validateWorldwayDecisionContract,
} from "../decision-contract";
import { buildSpecialistCoordinationEnvelope } from "../specialist-agents";
import { synthesizeSpecialistDecisions } from "../decision-synthesis";

const evidence = [{
  source: "travel-graph",
  reference: "edge:ist:123",
  observedAt: "2026-10-03T00:00:00Z",
  confidence: 0.9,
  expiresAt: "2026-10-04T00:00:00Z",
}];

describe("Worldway typed decision contract", () => {
  it("creates a bounded provenance-backed contract", () => {
    const contract = createWorldwayDecisionContract({
      decisionKind: "recommendation", decision: "Use the validated itinerary", confidence: 0.94,
      evidence, correlationId: "wwai-test", sourceTaskId: "model-step",
      expiresAt: "2026-10-04T00:00:00Z", constraints: ["deterministic-only"],
    });
    expect(contract).not.toBeNull();
    expect(contract).toMatchObject({
      contractVersion: "1.0", decisionKind: "recommendation", decision: "Use the validated itinerary",
      confidence: 0.94, correlationId: "wwai-test", sourceTaskId: "model-step",
      expiresAt: "2026-10-04T00:00:00Z", constraints: ["deterministic-only"],
    });
    expect(contract?.evidence[0]).toEqual(evidence[0]);
    expect(contract?.sourceTaskId).toBe("model-step");
    expect(contract?.expiresAt).toBeDefined();
    expect(isWorldwayDecisionContract(contract)).toBe(true);
  });

  it("fails closed without provenance or a usable decision", () => {
    expect(createWorldwayDecisionContract({
      decisionKind: "recommendation", decision: "Use it", confidence: 0.8, evidence: [],
      correlationId: "wwai-test", sourceTaskId: "model-step", expiresAt: "2026-10-04T00:00:00Z",
    })).toBeNull();
    expect(createWorldwayDecisionContract({
      decisionKind: "recommendation", decision: "", confidence: 0.8, evidence,
      correlationId: "wwai-test", sourceTaskId: "model-step", expiresAt: "2026-10-04T00:00:00Z",
    })).toBeNull();
  });

  it("sanitizes evidence and bounds decision metadata", () => {
    const contract = createWorldwayDecisionContract({
      decisionKind: "ranking", decision: "  choose option A  ", confidence: 7,
      evidence: [...evidence, { source: "ignored", reference: "not valid ref!", observedAt: "2026-10-03T00:00:00Z", confidence: 0.5 }],
      correlationId: "wwai-test", sourceTaskId: "model-step", expiresAt: "2026-10-04T00:00:00Z",
      constraints: ["  first  ", 123, "", "  second  "],
    });
    expect(contract?.decision).toBe("choose option A");
    expect(contract?.confidence).toBe(1);
    expect(contract?.evidence).toHaveLength(1);
    expect(contract?.constraints).toEqual(["first", "second"]);
  });

  it("rejects structurally incomplete contracts", () => {
    expect(isWorldwayDecisionContract({
      contractVersion: "1.0", decisionKind: "recommendation", decision: "ok",
      confidence: 0.8, evidence: [], correlationId: "wwai-test", constraints: [],
    })).toBe(false);
  });

  it("rejects structurally unsafe contracts before adapter consumption", () => {
    const base = createWorldwayDecisionContract({
      decisionKind: "recommendation",
      decision: "review",
      confidence: 0.9,
      evidence,
      correlationId: "wwai-test",
      sourceTaskId: "model-step",
      expiresAt: "2026-10-04T00:00:00Z",
      constraints: ["booking.readiness.check=true"],
    })!;

    expect(isWorldwayDecisionContract({ ...base, confidence: 1.01 })).toBe(false);
    expect(isWorldwayDecisionContract({ ...base, confidence: -0.01 })).toBe(false);
    expect(isWorldwayDecisionContract({ ...base, constraints: [123] })).toBe(false);
    expect(isWorldwayDecisionContract({ ...base, constraints: ["x".repeat(161)] })).toBe(false);
    expect(isWorldwayDecisionContract({ ...base, decision: "x".repeat(241) })).toBe(false);
    expect(isWorldwayDecisionContract({ ...base, decisionKind: "unexpected" })).toBe(false);
    expect(isWorldwayDecisionContract({ ...base, correlationId: "   " })).toBe(false);
    expect(isWorldwayDecisionContract({ ...base, sourceTaskId: "" })).toBe(false);
  });

  it("rejects supplier and execution-authority content at the contract boundary", () => {
    expect(createWorldwayDecisionContract({
      decisionKind: "recommendation",
      decision: "Book this supplier now",
      confidence: 0.9,
      evidence,
      correlationId: "wwai-test",
      sourceTaskId: "model-step",
      expiresAt: "2026-10-04T00:00:00Z",
    })).toBeNull();

    expect(createWorldwayDecisionContract({
      decisionKind: "recommendation",
      decision: "Use the validated itinerary",
      confidence: 0.9,
      evidence,
      correlationId: "wwai-test",
      sourceTaskId: "model-step",
      expiresAt: "2026-10-04T00:00:00Z",
      constraints: ["supplierAction=confirmed"],
    })).toBeNull();

    const safe = createWorldwayDecisionContract({
      decisionKind: "ranking",
      decision: "Prioritize the validated itinerary",
      confidence: 0.9,
      evidence,
      correlationId: "wwai-test",
      sourceTaskId: "model-step",
      expiresAt: "2026-10-04T00:00:00Z",
      constraints: ["ranking.weight.preference=0.8"],
    });
    expect(safe).not.toBeNull();
    expect(validateWorldwayDecisionContract(safe, {
      expectedCorrelationId: "wwai-test",
      expectedSourceTaskId: "model-step",
      acceptedDecisionKinds: ["ranking"],
      now: new Date("2026-10-03T12:00:00Z"),
    })).toEqual(safe);
  });

  it("accepts only a live contract bound to the active orchestration and source task", () => {
    const contract = createWorldwayDecisionContract({
      decisionKind: "recommendation", decision: "review", confidence: 0.9, evidence,
      correlationId: "wwai-test", sourceTaskId: "model-step", expiresAt: "2026-10-04T00:00:00Z",
    });
    expect(validateWorldwayDecisionContract(contract, {
      expectedCorrelationId: "wwai-test", expectedSourceTaskId: "model-step",
      acceptedDecisionKinds: ["recommendation"], now: new Date("2026-10-03T12:00:00Z"),
    })).toEqual(contract);
  });

  it("rejects replay, expiry, unsupported decision kinds, and malformed provenance", () => {
    const base = {
      decisionKind: "recommendation" as const, decision: "review", confidence: 0.9, evidence,
      correlationId: "wwai-test", sourceTaskId: "model-step", expiresAt: "2026-10-04T00:00:00Z",
    };
    const contract = createWorldwayDecisionContract(base);
    expect(validateWorldwayDecisionContract(contract, {
      expectedCorrelationId: "other-correlation", expectedSourceTaskId: "model-step",
      acceptedDecisionKinds: ["recommendation"], now: new Date("2026-10-03T12:00:00Z"),
    })).toBeNull();
    expect(validateWorldwayDecisionContract(contract, {
      expectedCorrelationId: "wwai-test", expectedSourceTaskId: "other-model",
      acceptedDecisionKinds: ["recommendation"], now: new Date("2026-10-03T12:00:00Z"),
    })).toBeNull();
    expect(validateWorldwayDecisionContract(contract, {
      expectedCorrelationId: "wwai-test", expectedSourceTaskId: "model-step",
      acceptedDecisionKinds: ["ranking"], now: new Date("2026-10-03T12:00:00Z"),
    })).toBeNull();
    expect(validateWorldwayDecisionContract({ ...contract!, expiresAt: "2026-10-03T11:59:59Z" }, {
      expectedCorrelationId: "wwai-test", expectedSourceTaskId: "model-step",
      acceptedDecisionKinds: ["recommendation"], now: new Date("2026-10-03T12:00:00Z"),
    })).toBeNull();
    expect(validateWorldwayDecisionContract({ ...contract!, evidence: [{ ...evidence[0], reference: "bad reference!" }] }, {
      expectedCorrelationId: "wwai-test", expectedSourceTaskId: "model-step",
      acceptedDecisionKinds: ["recommendation"], now: new Date("2026-10-03T12:00:00Z"),
    })).toBeNull();
  });

  it("binds ready specialist synthesis into the existing decision contract", () => {
    const synthesis = synthesizeSpecialistDecisions(buildSpecialistCoordinationEnvelope("wwai-test", [
      { specialist: "flight_intelligence", taskId: "flight-step", state: "completed", output: { recommendation: "review" }, evidence },
      { specialist: "hotel_intelligence", taskId: "hotel-step", state: "completed", output: { recommendation: "review" }, evidence },
    ])!, { expectedCorrelationId: "wwai-test", now: new Date("2026-10-03T12:00:00Z") })!;

    const contract = bindSpecialistSynthesisToDecisionContract({
      synthesis, decisionKind: "recommendation", decision: "Use the deterministic itinerary", confidence: 0.91,
      correlationId: "wwai-test", sourceTaskId: "decision-step", acceptedDecisionKinds: ["recommendation"],
      now: new Date("2026-10-03T12:00:00Z"),
    });

    expect(contract).toMatchObject({
      contractVersion: "1.0", decisionKind: "recommendation", decision: "Use the deterministic itinerary",
      correlationId: "wwai-test", sourceTaskId: "decision-step",
    });
    expect(contract?.evidence).toEqual(evidence);
  });

  it("rejects a forged ready synthesis before deterministic binding", () => {
    const synthesis = synthesizeSpecialistDecisions(buildSpecialistCoordinationEnvelope("wwai-test", [
      { specialist: "flight_intelligence", taskId: "flight-step", state: "completed", output: { recommendation: "review" }, evidence },
    ])!, { expectedCorrelationId: "wwai-test", now: new Date("2026-10-03T12:00:00Z") })!;

    const forged = {
      ...synthesis,
      status: "ready" as const,
      findings: [{ ...synthesis.findings[0], taskId: "" }],
    };

    const contract = bindSpecialistSynthesisToDecisionContract({
      synthesis: forged,
      decisionKind: "recommendation",
      decision: "Use the deterministic itinerary",
      confidence: 0.91,
      correlationId: "wwai-test",
      sourceTaskId: "decision-step",
      acceptedDecisionKinds: ["recommendation"],
      now: new Date("2026-10-03T12:00:00Z"),
    });

    expect(contract).toBeNull();
  });

  it("does not bind conflicted synthesis or infer a winner", () => {
    const synthesis = synthesizeSpecialistDecisions(buildSpecialistCoordinationEnvelope("wwai-test", [
      { specialist: "flight_intelligence", taskId: "flight-step", state: "completed", output: { recommendation: "keep" }, evidence },
      { specialist: "hotel_intelligence", taskId: "hotel-step", state: "completed", output: { recommendation: "reject" }, evidence },
    ])!, { expectedCorrelationId: "wwai-test", now: new Date("2026-10-03T12:00:00Z") })!;

    const contract = bindSpecialistSynthesisToDecisionContract({
      synthesis: synthesis!, decisionKind: "recommendation", decision: "keep", confidence: 0.9,
      correlationId: "wwai-test", sourceTaskId: "decision-step", acceptedDecisionKinds: ["recommendation"],
      now: new Date("2026-10-03T12:00:00Z"),
    });
    expect(contract).toBeNull();
  });
});
