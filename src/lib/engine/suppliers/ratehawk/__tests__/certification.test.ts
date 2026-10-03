import { describe, expect, it } from "vitest";
import {
  assertRateHawkProductionCertification,
  buildRateHawkCertificationReport,
  RATEHAWK_CERTIFICATION_REQUIREMENTS,
} from "../certification";

const now = "2026-10-03T00:00:00.000Z";

const evidence = RATEHAWK_CERTIFICATION_REQUIREMENTS.map((step) => ({
  step,
  passed: true,
  environment: "sandbox" as const,
  observedAt: now,
  detail: `validated ${step}`,
}));

describe("RateHawk certification harness", () => {
  it("requires the complete lifecycle before certification", () => {
    const report = buildRateHawkCertificationReport(evidence, "sandbox");
    expect(report.certified).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it("fails closed when a lifecycle step is missing", () => {
    const report = buildRateHawkCertificationReport(
      evidence.filter((item) => item.step !== "prebook"),
      "sandbox",
    );
    expect(report.certified).toBe(false);
    expect(report.missing).toContain("prebook");
  });

  it("never promotes sandbox evidence to production certification", () => {
    const report = buildRateHawkCertificationReport(evidence, "production");
    expect(report.certified).toBe(false);
    expect(report.missing).toEqual([...RATEHAWK_CERTIFICATION_REQUIREMENTS]);
    expect(() => assertRateHawkProductionCertification(report)).toThrow();
  });

  it("requires idempotency and failure/retry evidence in production", () => {
    const productionEvidence = RATEHAWK_CERTIFICATION_REQUIREMENTS
      .filter((step) => !["idempotency", "failure_retry"].includes(step))
      .map((step) => ({
        step,
        passed: true,
        environment: "production" as const,
        observedAt: now,
        detail: `validated ${step}`,
      }));
    const report = buildRateHawkCertificationReport(productionEvidence, "production");
    expect(report.certified).toBe(false);
    expect(report.missing).toEqual(["failure_retry", "idempotency"]);
    expect(() => assertRateHawkProductionCertification(report)).toThrow(/failure_retry/);
  });

  it("accepts a complete production lifecycle", () => {
    const productionEvidence = RATEHAWK_CERTIFICATION_REQUIREMENTS.map((step) => ({
      step,
      passed: true,
      environment: "production" as const,
      observedAt: now,
      reference: `evidence-${step}`,
      detail: `validated ${step}`,
    }));
    const report = buildRateHawkCertificationReport(productionEvidence, "production");
    expect(report.certified).toBe(true);
    expect(report.missing).toEqual([]);
    expect(() => assertRateHawkProductionCertification(report)).not.toThrow();
  });
});
