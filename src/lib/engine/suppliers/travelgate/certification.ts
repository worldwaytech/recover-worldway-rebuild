export type TravelgateCertificationStep =
  | "credentials"
  | "search"
  | "quote"
  | "book"
  | "booking_read"
  | "cancel"
  | "failure_retry"
  | "idempotency";

export interface TravelgateStepEvidence {
  step: TravelgateCertificationStep;
  passed: boolean;
  environment: "test" | "production";
  reference?: string;
  observedAt: string;
  detail: string;
}

export interface TravelgateCertificationReport {
  supplierKey: "travelgate";
  environment: "test" | "production";
  certified: boolean;
  completed: readonly TravelgateCertificationStep[];
  missing: readonly TravelgateCertificationStep[];
  evidence: readonly TravelgateStepEvidence[];
  generatedAt: string;
}

const REQUIRED: readonly TravelgateCertificationStep[] = [
  "credentials",
  "search",
  "quote",
  "book",
  "booking_read",
  "cancel",
  "failure_retry",
  "idempotency",
];

export function buildTravelgateCertificationReport(
  evidence: readonly TravelgateStepEvidence[],
  environment: "test" | "production",
): TravelgateCertificationReport {
  const passed = new Set(
    evidence.filter((item) => item.passed && item.environment === environment).map((item) => item.step),
  );
  const completed = REQUIRED.filter((step) => passed.has(step));
  const missing = REQUIRED.filter((step) => !passed.has(step));

  return {
    supplierKey: "travelgate",
    environment,
    certified: missing.length === 0,
    completed,
    missing,
    evidence: evidence.filter((item) => item.environment === environment),
    generatedAt: new Date().toISOString(),
  };
}

export function assertTravelgateProductionCertification(
  report: TravelgateCertificationReport,
): void {
  if (report.environment !== "production" || !report.certified) {
    throw new Error(
      `Travelgate production certification incomplete: ${report.missing.join(", ") || "invalid environment"}`,
    );
  }
}

export const TRAVELGATE_CERTIFICATION_REQUIREMENTS = REQUIRED;
