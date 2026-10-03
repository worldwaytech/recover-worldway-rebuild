import { describe, expect, it } from "vitest";
import {
  assertHbxHotelsProductionCertification,
  buildHbxHotelsCertificationReport,
} from "../certification";
import { buildHbxHotelsCertificationReportFromTest } from "../execution";

const base = {
  environment: "test" as const,
  startedAt: "2026-10-03T10:00:00.000Z",
  passed: true,
  bookingReference: "HBX123",
  finalBookingStatus: "CANCELLED",
};

describe("HBX Hotels certification evidence", () => {
  it("maps the complete TEST lifecycle without certifying production", () => {
    const report = buildHbxHotelsCertificationReportFromTest({
      ...base,
      steps: [
        { step: "connectivity (/status)", ok: true, status: 200, durationMs: 10, detail: "ok" },
        { step: "availability", ok: true, status: 200, durationMs: 20, detail: "rates" },
        { step: "rate selection", ok: true, status: 200, durationMs: 0, detail: "selected" },
        { step: "checkRate", ok: true, status: 200, durationMs: 20, detail: "repriced" },
        { step: "test booking", ok: true, status: 200, durationMs: 30, detail: "booked" },
        { step: "booking detail", ok: true, status: 200, durationMs: 10, detail: "confirmed" },
        { step: "cancellation", ok: true, status: 200, durationMs: 20, detail: "cancelled" },
        { step: "post-cancellation verification", ok: true, status: 200, durationMs: 10, detail: "cancelled" },
      ],
    });

    expect(report.environment).toBe("test");
    expect(report.certified).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.completed).toEqual([
      "credentials",
      "availability",
      "checkRate",
      "book",
      "booking_read",
      "cancel",
      "reconfirmation",
    ]);
    expect(report.evidence.find((item) => item.step === "book")?.reference).toBe("HBX123");
  });

  it("does not count a presentation-only rate-selection step", () => {
    const report = buildHbxHotelsCertificationReportFromTest({
      ...base,
      steps: [
        { step: "rate selection", ok: true, status: 200, durationMs: 0, detail: "selected" },
      ],
    });
    expect(report.completed).toEqual([]);
    expect(report.missing.length).toBe(7);
    expect(report.certified).toBe(false);
  });

  it("fails closed for production assertions", () => {
    const testReport = buildHbxHotelsCertificationReport(
      [
        {
          step: "credentials",
          passed: true,
          environment: "test",
          observedAt: "2026-10-03T10:00:00.000Z",
          detail: "test",
        },
      ],
      "test",
    );
    expect(() => assertHbxHotelsProductionCertification(testReport)).toThrow(
      "HBX Hotels production certification incomplete",
    );
  });
});
