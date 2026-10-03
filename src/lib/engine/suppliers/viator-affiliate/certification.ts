export type ViatorAffiliateCertificationStep =
  | "credentials"
  | "search"
  | "availability"
  | "booking_entitlement"
  | "paid_production_booking"
  | "booking_status"
  | "cancellation"
  | "refund"
  | "failure_resolution"
  | "idempotency";

export interface ViatorAffiliateStepEvidence {
  step: ViatorAffiliateCertificationStep;
  passed: boolean;
  environment: "sandbox" | "production";
  reference?: string;
  status?: number;
  observedAt: string;
  detail: string;
}

export interface ViatorAffiliateCertificationReport {
  supplierKey: "viator-affiliate";
  environment: "sandbox" | "production";
  certified: boolean;
  completed: readonly ViatorAffiliateCertificationStep[];
  missing: readonly ViatorAffiliateCertificationStep[];
  evidence: readonly ViatorAffiliateStepEvidence[];
  generatedAt: string;
}

export const VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS: readonly ViatorAffiliateCertificationStep[] = [
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
];

export function buildViatorAffiliateCertificationReport(
  evidence: readonly ViatorAffiliateStepEvidence[],
  environment: "sandbox" | "production",
): ViatorAffiliateCertificationReport {
  const passed = new Set(
    evidence
      .filter((item) => item.passed && item.environment === environment)
      .map((item) => item.step),
  );
  const completed = VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS.filter((step) => passed.has(step));
  const missing = VIATOR_AFFILIATE_CERTIFICATION_REQUIREMENTS.filter((step) => !passed.has(step));

  return {
    supplierKey: "viator-affiliate",
    environment,
    certified: missing.length === 0,
    completed,
    missing,
    evidence: evidence.filter((item) => item.environment === environment),
    generatedAt: new Date().toISOString(),
  };
}

export function assertViatorAffiliateProductionCertification(
  report: ViatorAffiliateCertificationReport,
): void {
  if (report.environment !== "production" || !report.certified) {
    throw new Error(
      `Viator Affiliate production certification incomplete: ${report.missing.join(", ") || "invalid environment"}`,
    );
  }
}
