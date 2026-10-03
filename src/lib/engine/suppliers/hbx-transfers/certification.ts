export type HbxTransfersCertificationStep =
  | "credentials"
  | "search"
  | "price"
  | "booking"
  | "booking_read"
  | "cancellation"
  | "failure_retry"
  | "idempotency";

export interface HbxTransfersStepEvidence {
  step: HbxTransfersCertificationStep;
  passed: boolean;
  environment: "test" | "live";
  reference?: string;
  status?: number;
  observedAt: string;
  detail: string;
}

export interface HbxTransfersCertificationReport {
  supplierKey: "hbx-transfers";
  environment: "test" | "live";
  certified: boolean;
  completed: readonly HbxTransfersCertificationStep[];
  missing: readonly HbxTransfersCertificationStep[];
  evidence: readonly HbxTransfersStepEvidence[];
  generatedAt: string;
}

export const HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS: readonly HbxTransfersCertificationStep[] = [
  "credentials",
  "search",
  "price",
  "booking",
  "booking_read",
  "cancellation",
  "failure_retry",
  "idempotency",
];

export function buildHbxTransfersCertificationReport(
  evidence: readonly HbxTransfersStepEvidence[],
  environment: "test" | "live",
): HbxTransfersCertificationReport {
  const passed = new Set(
    evidence
      .filter((item) => item.passed && item.environment === environment)
      .map((item) => item.step),
  );
  const completed = HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS.filter((step) => passed.has(step));
  const missing = HBX_TRANSFERS_CERTIFICATION_REQUIREMENTS.filter((step) => !passed.has(step));

  return {
    supplierKey: "hbx-transfers",
    environment,
    certified: missing.length === 0,
    completed,
    missing,
    evidence: evidence.filter((item) => item.environment === environment),
    generatedAt: new Date().toISOString(),
  };
}

export function assertHbxTransfersProductionCertification(
  report: HbxTransfersCertificationReport,
): void {
  if (report.environment !== "live" || !report.certified) {
    throw new Error(
      `HBX Transfers production certification incomplete: ${report.missing.join(", ") || "invalid environment"}`,
    );
  }
}
