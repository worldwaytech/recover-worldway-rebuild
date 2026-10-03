/**
 * Formal UP17 production certification gate.
 * Evidence-only; production promotion requires the complete lifecycle.
 */
export type Up17CertificationStep =
  | "credentials" | "search" | "availability" | "price"
  | "production_booking" | "booking_read" | "cancellation"
  | "modification" | "failure_resolution" | "idempotency";

export type Up17StepEvidence = {
  step: Up17CertificationStep;
  passed: boolean;
  environment: "test" | "production";
  reference?: string;
  observedAt: string;
  detail: string;
};

export type Up17CertificationReport = {
  supplierKey: "up17";
  environment: "test" | "production";
  certified: boolean;
  completed: Up17CertificationStep[];
  missing: Up17CertificationStep[];
  evidence: Up17StepEvidence[];
  generatedAt: string;
};

export const UP17_CERTIFICATION_REQUIREMENTS: readonly Up17CertificationStep[] = [
  "credentials","search","availability","price","production_booking",
  "booking_read","cancellation","modification","failure_resolution","idempotency",
];

export function buildUp17CertificationReport(
  evidence: readonly Up17StepEvidence[],
  environment: "test" | "production",
  generatedAt = new Date().toISOString(),
): Up17CertificationReport {
  const scoped = evidence.filter((item) => item.environment === environment);
  const completed = UP17_CERTIFICATION_REQUIREMENTS.filter((step) =>
    scoped.some((item) => item.step === step && item.passed),
  );
  const missing = UP17_CERTIFICATION_REQUIREMENTS.filter((step) => !completed.includes(step));
  return { supplierKey:"up17", environment, certified:environment === "production" && missing.length === 0,
    completed, missing, evidence:scoped, generatedAt };
}

export function assertUp17ProductionCertification(
  report: Up17CertificationReport,
): asserts report is Up17CertificationReport & { environment:"production"; certified:true } {
  if (report.environment !== "production") throw new Error("UP17 production certification requires production evidence.");
  if (!report.certified || report.missing.length > 0) throw new Error(`UP17 production certification incomplete: ${report.missing.join(", ")}`);
}
