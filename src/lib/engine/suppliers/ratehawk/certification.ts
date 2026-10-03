export type RateHawkCertificationStep =
  | "credentials"
  | "search"
  | "price"
  | "prebook"
  | "book"
  | "booking_read"
  | "cancel"
  | "failure_retry"
  | "idempotency";

export interface RateHawkStepEvidence {
  step: RateHawkCertificationStep;
  passed: boolean;
  environment: "sandbox" | "production";
  reference?: string;
  observedAt: string;
  detail: string;
}

export interface RateHawkCertificationReport {
  supplierKey: "ratehawk";
  environment: "sandbox" | "production";
  certified: boolean;
  completed: readonly RateHawkCertificationStep[];
  missing: readonly RateHawkCertificationStep[];
  evidence: readonly RateHawkStepEvidence[];
  generatedAt: string;
}

export const RATEHAWK_CERTIFICATION_REQUIREMENTS: readonly RateHawkCertificationStep[] = [
  "credentials",
  "search",
  "price",
  "prebook",
  "book",
  "booking_read",
  "cancel",
  "failure_retry",
  "idempotency",
];

export function buildRateHawkCertificationReport(
  evidence: readonly RateHawkStepEvidence[],
  environment: "sandbox" | "production",
): RateHawkCertificationReport {
  const passed = new Set(
    evidence
      .filter((item) => item.passed && item.environment === environment)
      .map((item) => item.step),
  );
  const completed = RATEHAWK_CERTIFICATION_REQUIREMENTS.filter((step) => passed.has(step));
  const missing = RATEHAWK_CERTIFICATION_REQUIREMENTS.filter((step) => !passed.has(step));

  return {
    supplierKey: "ratehawk",
    environment,
    certified: missing.length === 0,
    completed,
    missing,
    evidence: evidence.filter((item) => item.environment === environment),
    generatedAt: new Date().toISOString(),
  };
}

export function assertRateHawkProductionCertification(
  report: RateHawkCertificationReport,
): void {
  if (report.environment !== "production" || !report.certified) {
    throw new Error(
      `RateHawk production certification incomplete: ${report.missing.join(", ") || "invalid environment"}`,
    );
  }
}
