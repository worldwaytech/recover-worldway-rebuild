import { describe, expect, it } from "vitest";
import { buildRateHawkCertificationReportFromSandbox } from "../execution";

describe("RateHawk certification execution bridge", () => {
  it("maps sandbox lifecycle evidence without promoting it to production", () => {
    const report = buildRateHawkCertificationReportFromSandbox({
      environment: "sandbox",
      passed: true,
      startedAt: "2026-10-03T10:00:00.000Z",
      finishedAt: "2026-10-03T10:05:00.000Z",
      partnerOrderId: "wwl-sbx-123",
      orderId: "RH-123",
      message: "sandbox lifecycle complete",
      steps: [
        {
          step: "Sandbox authentication",
          endpoint: "/multicomplete/",
          httpStatus: 200,
          passed: true,
          detail: "Credentials accepted.",
          latencyMs: 100,
        },
        {
          step: "Search (SERP by region)",
          endpoint: "/search/serp/region/",
          httpStatus: 200,
          passed: true,
          detail: "Hotels returned.",
          latencyMs: 200,
        },
        {
          step: "Rooms and rates (hotelpage)",
          endpoint: "/search/hp/",
          httpStatus: 200,
          passed: true,
          detail: "Rates returned.",
          latencyMs: 200,
        },
        {
          step: "Prebook",
          endpoint: "/search/hp/prebook/",
          httpStatus: 200,
          passed: true,
          detail: "Rate revalidated.",
          latencyMs: 200,
        },
        {
          step: "Start booking process",
          endpoint: "/hotel/order/finish/",
          httpStatus: 200,
          passed: true,
          detail: "Booking submitted.",
          latencyMs: 300,
        },
        {
          step: "Booking status (authoritative resolution)",
          endpoint: "/hotel/order/booking/finish/",
          httpStatus: 200,
          passed: true,
          detail: "Confirmed.",
          latencyMs: 300,
        },
        {
          step: "Order info",
          endpoint: "/hotel/order/partner/",
          httpStatus: 200,
          passed: true,
          detail: "Order returned.",
          latencyMs: 200,
        },
        {
          step: "Cancellation",
          endpoint: "/hotel/order/cancel/",
          httpStatus: 200,
          passed: true,
          detail: "Cancelled.",
          latencyMs: 200,
        },
      ],
    });

    expect(report.environment).toBe("sandbox");
    expect(report.certified).toBe(false);
    expect(report.missing).toEqual(["failure_retry", "idempotency"]);
    expect(report.completed).toEqual([
      "credentials",
      "search",
      "price",
      "prebook",
      "book",
      "booking_read",
      "cancel",
    ]);
  });

  it("ignores non-certification presentation steps", () => {
    const report = buildRateHawkCertificationReportFromSandbox({
      environment: "sandbox",
      passed: true,
      startedAt: "2026-10-03T10:00:00.000Z",
      finishedAt: "2026-10-03T10:01:00.000Z",
      partnerOrderId: null,
      orderId: null,
      message: "read-only validation",
      steps: [
        {
          step: "Worldway customer voucher",
          endpoint: "internal",
          httpStatus: null,
          passed: true,
          detail: "No voucher.",
          latencyMs: 0,
        },
      ],
    });

    expect(report.completed).toEqual([]);
    expect(report.missing.length).toBe(9);
    expect(report.certified).toBe(false);
  });
});
