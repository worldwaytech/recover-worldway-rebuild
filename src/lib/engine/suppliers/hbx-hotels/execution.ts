import type { CertificationReport as HbxSandboxReport } from "@/lib/hbx/hotel-booking.server";
import {
  buildHbxHotelsCertificationReport,
  type HbxHotelsCertificationReport,
  type HbxHotelsCertificationStep,
  type HbxHotelsStepEvidence,
} from "./certification";

const STEP_MAP: Readonly<Record<string, HbxHotelsCertificationStep>> = {
  "connectivity (/status)": "credentials",
  availability: "availability",
  checkRate: "checkRate",
  "test booking": "book",
  "booking detail": "booking_read",
  cancellation: "cancel",
  "post-cancellation verification": "reconfirmation",
};

/**
 * Converts the existing admin-only HBX TEST certification runner output into
 * the central supplier certification model. The source runner is test-only;
 * this bridge deliberately emits test evidence and can never certify
 * production.
 */
export function buildHbxHotelsCertificationReportFromTest(
  report: HbxSandboxReport,
): HbxHotelsCertificationReport {
  const observedAt = report.startedAt;
  const evidence = report.steps
    .map((step): HbxHotelsStepEvidence | null => {
      const mapped = STEP_MAP[step.step];
      if (!mapped) return null;

      return {
        step: mapped,
        passed: step.ok,
        environment: "test",
        ...(step.step === "test booking" && report.bookingReference
          ? { reference: report.bookingReference }
          : {}),
        observedAt,
        detail: step.detail,
      };
    })
    .filter((item): item is HbxHotelsStepEvidence => item !== null);

  return buildHbxHotelsCertificationReport(evidence, "test");
}
