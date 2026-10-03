export type GAdventuresCertificationStep =
  | "credentials"
  | "search"
  | "availability"
  | "booking_scope"
  | "booking"
  | "booking_read"
  | "confirmation_requirements"
  | "cancellation"
  | "failure_retry"
  | "idempotency";

export interface GAdventuresStepEvidence {
  step: GAdventuresCertificationStep;
  passed: boolean;
  environment: "sandbox" | "production";
  reference?: string;
  status?: number;
  observedAt: string;
  detail: string;
}

export interface GAdventuresCertificationReport {
  supplierKey: "gadventures";
  environment: "sandbox" | "production";
  certified: boolean;
  completed: readonly GAdventuresCertificationStep[];
  missing: readonly GAdventuresCertificationStep[];
  evidence: readonly GAdventuresStepEvidence[];
  generatedAt: string;
}

export const GADVENTURES_CERTIFICATION_REQUIREMENTS: readonly GAdventuresCertificationStep[] = [
  "credentials",
  "search",
  "availability",
  "booking_scope",
  "booking",
  "booking_read",
  "confirmation_requirements",
  "cancellation",
  "failure_retry",
  "idempotency",
];

export function buildGAdventuresCertificationReport(
  evidence: readonly GAdventuresStepEvidence[],
  environment: "sandbox" | "production",
): GAdventuresCertificationReport {
  const passed = new Set(
    evidence
      .filter((item) => item.passed && item.environment === environment)
      .map((item) => item.step),
  );
  const completed = GADVENTURES_CERTIFICATION_REQUIREMENTS.filter((step) => passed.has(step));
  const missing = GADVENTURES_CERTIFICATION_REQUIREMENTS.filter((step) => !passed.has(step));

  return {
    supplierKey: "gadventures",
    environment,
    certified: missing.length === 0,
    completed,
    missing,
    evidence: evidence.filter((item) => item.environment === environment),
    generatedAt: new Date().toISOString(),
  };
}

export function assertGAdventuresProductionCertification(
  report: GAdventuresCertificationReport,
): void {
  if (report.environment !== "production" || !report.certified) {
    throw new Error(
      `G Adventures production certification incomplete: ${report.missing.join(", ") || "invalid environment"}`,
    );
  }
}
