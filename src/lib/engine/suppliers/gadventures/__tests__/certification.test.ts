import { describe, expect, it } from "vitest";
import {
  assertGAdventuresProductionCertification,
  buildGAdventuresCertificationReport,
  GADVENTURES_CERTIFICATION_REQUIREMENTS,
} from "../certification";

const now = "2026-10-03T00:00:00.000Z";

describe("G Adventures certification gate", () => {
  it("requires the complete booking lifecycle", () => {
    const evidence = GADVENTURES_CERTIFICATION_REQUIREMENTS.map((step) => ({
      step,
      passed: true,
      environment: "sandbox" as const,
      observedAt: now,
      detail: `validated ${step}`,
    }));
    const report = buildGAdventuresCertificationReport(evidence, "sandbox");
    expect(report.certified).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it("fails closed when supplier booking scope is missing", () => {
    const evidence = GADVENTURES_CERTIFICATION_REQUIREMENTS
      .filter((step) => step !== "booking_scope")
      .map((step) => ({
        step,
        passed: true,
        environment: "production" as const,
        observedAt: now,
        detail: `validated ${step}`,
      }));
    const report = buildGAdventuresCertificationReport(evidence, "production");
    expect(report.certified).toBe(false);
    expect(report.missing).toEqual(["booking_scope"]);
    expect(() => assertGAdventuresProductionCertification(report)).toThrow(/booking_scope/);
  });

  it("does not promote sandbox evidence to production", () => {
    const evidence = GADVENTURES_CERTIFICATION_REQUIREMENTS.map((step) => ({
      step,
      passed: true,
      environment: "sandbox" as const,
      observedAt: now,
      detail: `validated ${step}`,
    }));
    const report = buildGAdventuresCertificationReport(evidence, "production");
    expect(report.certified).toBe(false);
    expect(report.missing).toEqual([...GADVENTURES_CERTIFICATION_REQUIREMENTS]);
  });

  it("requires confirmation requirements to be supplier-validated", () => {
    const evidence = GADVENTURES_CERTIFICATION_REQUIREMENTS
      .filter((step) => step !== "confirmation_requirements")
      .map((step) => ({
        step,
        passed: true,
        environment: "production" as const,
        observedAt: now,
        detail: `validated ${step}`,
      }));
    const report = buildGAdventuresCertificationReport(evidence, "production");
    expect(report.missing).toEqual(["confirmation_requirements"]);
  });

  it("accepts a complete production lifecycle", () => {
    const evidence = GADVENTURES_CERTIFICATION_REQUIREMENTS.map((step) => ({
      step,
      passed: true,
      environment: "production" as const,
      observedAt: now,
      reference: `evidence-${step}`,
      detail: `validated ${step}`,
    }));
    const report = buildGAdventuresCertificationReport(evidence, "production");
    expect(report.certified).toBe(true);
    expect(() => assertGAdventuresProductionCertification(report)).not.toThrow();
  });
});
