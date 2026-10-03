import { describe, expect, it } from "vitest";
import {
  assertTravelgateProductionCertification,
  buildTravelgateCertificationReport,
  TRAVELGATE_CERTIFICATION_REQUIREMENTS,
} from "../certification";

const now = "2026-10-03T00:00:00.000Z";

const evidence = TRAVELGATE_CERTIFICATION_REQUIREMENTS.map((step) => ({
  step,
  passed: true,
  environment: "test" as const,
  observedAt: now,
  detail: `validated ${step}`,
}));

describe("Travelgate certification harness", () => {
  it("requires the complete lifecycle before certification", () => {
    const report = buildTravelgateCertificationReport(evidence, "test");
    expect(report.certified).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it("fails closed when a lifecycle step is missing", () => {
    const report = buildTravelgateCertificationReport(
      evidence.filter((item) => item.step !== "cancel"),
      "test",
    );
    expect(report.certified).toBe(false);
    expect(report.missing).toContain("cancel");
  });

  it("never promotes test evidence to production certification", () => {
    const report = buildTravelgateCertificationReport(evidence, "production");
    expect(report.certified).toBe(false);
    expect(report.missing).toEqual([...TRAVELGATE_CERTIFICATION_REQUIREMENTS]);
    expect(() => assertTravelgateProductionCertification(report)).toThrow();
  });

  it("rejects an incomplete production report", () => {
    const productionEvidence = TRAVELGATE_CERTIFICATION_REQUIREMENTS
      .filter((step) => step !== "idempotency")
      .map((step) => ({
        step,
        passed: true,
        environment: "production" as const,
        observedAt: now,
        detail: `validated ${step}`,
      }));
    const report = buildTravelgateCertificationReport(productionEvidence, "production");
    expect(report.certified).toBe(false);
    expect(() => assertTravelgateProductionCertification(report)).toThrow(/idempotency/);
  });

  it("accepts a complete production lifecycle", () => {
    const productionEvidence = TRAVELGATE_CERTIFICATION_REQUIREMENTS.map((step) => ({
      step,
      passed: true,
      environment: "production" as const,
      observedAt: now,
      reference: `evidence-${step}`,
      detail: `validated ${step}`,
    }));
    const report = buildTravelgateCertificationReport(productionEvidence, "production");
    expect(report.certified).toBe(true);
    expect(report.missing).toEqual([]);
    expect(() => assertTravelgateProductionCertification(report)).not.toThrow();
  });
});
