import { describe, expect, it } from "vitest";
import {
  assertHbxTransfersProductionCertification,
  buildHbxTransfersCertificationReport,
  HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS,
  type HbxTransfersStepEvidence,
} from "../certification";

const now = "2026-10-03T00:00:00.000Z";

function evidence(
  step: HbxTransfersStepEvidence["step"],
  passed = true,
  environment: HbxTransfersStepEvidence["environment"] = "live",
): HbxTransfersStepEvidence {
  return { step, passed, environment, observedAt: now, detail: step };
}

describe("HBX Transfers certification gate", () => {
  it("requires the complete production lifecycle plus resilience evidence", () => {
    expect(HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS).toEqual([
      "credentials",
      "search",
      "price",
      "booking",
      "booking_read",
      "cancellation",
      "failure_retry",
      "idempotency",
    ]);

    const report = buildHbxTransfersCertificationReport(
      HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS.map((step) => evidence(step)),
      "live",
    );

    expect(report.certified).toBe(true);
    expect(report.missing).toEqual([]);
    expect(() => assertHbxTransfersProductionCertification(report)).not.toThrow();
  });

  it("fails closed when any required evidence is missing", () => {
    const report = buildHbxTransfersCertificationReport(
      HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS
        .filter((step) => step !== "idempotency")
        .map((step) => evidence(step)),
      "live",
    );

    expect(report.certified).toBe(false);
    expect(report.missing).toEqual(["idempotency"]);
    expect(() => assertHbxTransfersProductionCertification(report)).toThrow(
      "HBX Transfers production certification incomplete: idempotency",
    );
  });

  it("does not promote TEST evidence to production", () => {
    const report = buildHbxTransfersCertificationReport(
      HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS.map((step) => evidence(step, true, "test")),
      "test",
    );

    expect(report.certified).toBe(true);
    expect(() => assertHbxTransfersProductionCertification(report)).toThrow(
      "HBX Transfers production certification incomplete: invalid environment",
    );
  });

  it("ignores evidence from the wrong environment", () => {
    const evidenceSet = [
      ...HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS.map((step) => evidence(step)),
      evidence("idempotency", true, "test"),
    ];
    const report = buildHbxTransfersCertificationReport(evidenceSet, "live");

    expect(report.certified).toBe(true);
    expect(report.evidence.every((item) => item.environment === "live")).toBe(true);
  });
});
