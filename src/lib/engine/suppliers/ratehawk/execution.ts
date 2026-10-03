import type { RatehawkCertificationReport as SandboxReport } from "@/lib/ratehawk/types";
import {
  buildRateHawkCertificationReport,
  type RateHawkCertificationReport,
  type RateHawkCertificationStep,
  type RateHawkStepEvidence,
} from "./certification";

const STEP_MAP: Readonly<Record<string, RateHawkCertificationStep>> = {
  "Sandbox authentication": "credentials",
  "Search (SERP by region)": "search",
  "Rooms and rates (hotelpage)": "price",
  Prebook: "prebook",
  "Start booking process": "book",
  "Booking status (authoritative resolution)": "booking_read",
  "Order info": "booking_read",
  Cancellation: "cancel",
};

function mapStep(
  step: SandboxReport["steps"][number],
  environment: "sandbox" | "test" | "production",
  observedAt: string,
): RateHawkStepEvidence | null {
  const mapped = STEP_MAP[step.step];
  if (!mapped) return null;

  return {
    step: mapped,
    passed: step.passed,
    environment: environment === "test" ? "sandbox" : environment,
    observedAt,
    detail: step.detail,
    ...(step.httpStatus != null ? { reference: `http:${step.httpStatus}` } : {}),
  };
}

/**
 * Converts the admin sandbox validation output into the central certification
 * evidence model. The source runner is deliberately sandbox-only.
 *
 * Test is normalized to the central sandbox evidence environment because the
 * central gate has only sandbox/production certification semantics.
 * Sandbox evidence can never satisfy production certification.
 */
export function buildRateHawkCertificationReportFromSandbox(
  report: SandboxReport,
): RateHawkCertificationReport {
  const evidence = report.steps
    .map((step) => mapStep(step, report.environment, report.finishedAt))
    .filter((item): item is RateHawkStepEvidence => item !== null);

  return buildRateHawkCertificationReport(evidence, "sandbox");
}
