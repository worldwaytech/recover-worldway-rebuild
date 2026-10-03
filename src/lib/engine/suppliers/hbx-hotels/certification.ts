export type HbxHotelsCertificationStep =
  | "credentials"
  | "availability"
  | "checkRate"
  | "book"
  | "booking_read"
  | "cancel"
  | "reconfirmation";

export interface HbxHotelsStepEvidence {
  step: HbxHotelsCertificationStep;
  passed: boolean;
  environment: "test" | "production";
  reference?: string;
  observedAt: string;
  detail: string;
}

export interface HbxHotelsCertificationReport {
  supplierKey: "hbx-hotels";
  environment: "test" | "production";
  certified: boolean;
  completed: readonly HbxHotelsCertificationStep[];
  missing: readonly HbxHotelsCertificationStep[];
  evidence: readonly HbxHotelsStepEvidence[];
  generatedAt: string;
}

const REQUIRED: readonly HbxHotelsCertificationStep[] = [
  "credentials",
  "availability",
  "checkRate",
  "book",
  "booking_read",
  "cancel",
  "reconfirmation",
];

export function buildHbxHotelsCertificationReport(
  evidence: readonly HbxHotelsStepEvidence[],
  environment: "test" | "production",
): HbxHotelsCertificationReport {
  const passed = new Set(
    evidence.filter((item) => item.passed && item.environment === environment).map((item) => item.step),
  );
  const completed = REQUIRED.filter((step) => passed.has(step));
  const missing = REQUIRED.filter((step) => !passed.has(step));

  return {
    supplierKey: "hbx-hotels",
    environment,
    certified: missing.length === 0,
    completed,
    missing,
    evidence: evidence.filter((item) => item.environment === environment),
    generatedAt: new Date().toISOString(),
  };
}

export function assertHbxHotelsProductionCertification(
  report: HbxHotelsCertificationReport,
): void {
  if (report.environment !== "production" || !report.certified) {
    throw new Error(
      `HBX Hotels production certification incomplete: ${report.missing.join(", ") || "invalid environment"}`,
    );
  }
}

export const HBX_HOTELS_CERTIFICATION_REQUIREMENTS = REQUIRED;
