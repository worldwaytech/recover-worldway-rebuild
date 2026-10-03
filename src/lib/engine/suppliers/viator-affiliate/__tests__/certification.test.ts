import { describe, expect, it } from "vitest";
import {
  assertViatorAffiliateProductionCertification,
  buildViatorAffiliateCertificationReport,
  VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS,
  type ViatorAffiliateStepEvidence,
} from "../certification";

const now = "2026-10-03T00:00:00.000Z";

function evidence(
  step: ViatorAffiliateStepEvidence["step"],
  passed = true,
  environment: ViatorAffiliateStepEvidence["environment"] = "production",
): ViatorAffiliateStepEvidence {
  return { step, passed, environment, observedAt: now, detail: step };
}

describe("Viator Affiliate certification gate", () => {
  it("requires entitlement, paid booking, status, cancellation/refund and resilience evidence", () => {
    expect(VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS).toEqual([
      "credentials",
      "search",
      "availability",
      "booking_entitlement",
      "paid_production_booking",
      "booking_status",
      "cancellation",
      "refund",
      "failure_resolution",
      "idempotency",
    ]);

    const report = buildViatorAffiliateCertificationReport(
      VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS.map((step) => evidence(step)),
      "production",
    );

    expect(report.certified).toBe(true);
    expect(() => assertViatorAffiliateProductionCertification(report)).not.toThrow();
  });

  it("fails closed when affiliate booking entitlement is missing", () => {
    const report = buildViatorAffiliateCertificationReport(
      VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS
        .filter((step) => step !== "booking_entitlement")
        .map((step) => evidence(step)),
      "production",
    );

    expect(report.certified).toBe(false);
    expect(report.missing).toEqual(["booking_entitlement"]);
    expect(() => assertViatorAffiliateProductionCertification(report)).toThrow(
      "Viator Affiliate production certification incomplete: booking_entitlement",
    );
  });

  it("does not promote sandbox evidence to production", () => {
    const report = buildViatorAffiliateCertificationReport(
      VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS.map((step) => evidence(step, true, "sandbox")),
      "sandbox",
    );

    expect(report.certified).toBe(true);
    expect(() => assertViatorAffiliateProductionCertification(report)).toThrow(
      "Viator Affiliate production certification incomplete: invalid environment",
    );
  });

  it("keeps evidence scoped to the requested environment", () => {
    const report = buildViatorAffiliateCertificationReport(
      [
        ...VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS.map((step) => evidence(step)),
        evidence("refund", true, "sandbox"),
      ],
      "production",
    );

    expect(report.certified).toBe(true);
    expect(report.evidence.every((item) => item.environment === "production")).toBe(true);
  });
});
