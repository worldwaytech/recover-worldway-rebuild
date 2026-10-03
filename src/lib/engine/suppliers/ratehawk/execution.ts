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

function mapStep(step: SandboxReport["steps"][number]): RateHawkStepEvidence | null {
  const mapped = STEP_MAP[step.step];
  if (!mapped) return null;

  return {
    step: mapped,
    passed: step.passed,
    environment: step.environment,
    observedAt: new Date().toISOString(),
    detail: step.detail,
    ...(step.httpStatus != null ? { reference: `http:${step.httpStatus}` } : {}),
  };
}

/**
 * Converts the admin sandbox runner output into the central supplier
 * certification evidence model.
 *
 * Sandbox evidence is intentionally never promoted to production evidence.
 * Failure/retry and idempotency remain missing because the sandbox runner does
 * not prove those controls by itself.
 */
export function buildRateHawkCertificationReportFromSandbox(
  report: SandboxReport,
): RateHawkCertificationReport {
  const evidence = report.steps
    .map(mapStep)
    .filter((item): item is RateHawkStepEvidence => item !== null);

  return buildRateHawkCertificationReport(evidence, report.environment);
}
