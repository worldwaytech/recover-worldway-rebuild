import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RatehawkResult } from "../types";

const mocked = vi.hoisted(() => ({
  calls: [] as Array<{ operation: string; body: Record<string, unknown> }>,
  ratehawkCall: vi.fn(),
}));

vi.mock("../client.server", async () => {
  const actual = await vi.importActual<typeof import("../client.server")>("../client.server");
  return {
    ...actual,
    ratehawkCall: mocked.ratehawkCall,
    ratehawkEnvironment: () => "sandbox",
  };
});

import {
  RATEHAWK_MAX_BOOKING_FORM_CALLS,
  RATEHAWK_MAX_BOOKING_STATUS_CALLS,
  createBookingForm,
  resolveBookingOutcome,
} from "../hotels.server";

function supplierError(
  operation: "bookingForm" | "bookingStatus",
  code: string,
  httpStatus = 200,
): RatehawkResult<unknown> {
  return {
    ok: false,
    error: { code, message: code, origin: "supplier", retryable: true },
    meta: {
      operation,
      environment: "sandbox",
      httpStatus,
      latencyMs: 1,
      attempts: 1,
      supplierStatus: null,
    },
  };
}

function ok(operation: "bookingForm" | "bookingStatus" | "orderInfo", data: unknown): RatehawkResult<unknown> {
  return {
    ok: true,
    data,
    meta: {
      operation,
      environment: "sandbox",
      httpStatus: 200,
      latencyMs: 1,
      attempts: 1,
      supplierStatus: operation === "bookingStatus" ? "ok" : null,
    },
  };
}

describe("RateHawk ETG certification retry guards", () => {
  beforeEach(() => {
    mocked.calls.length = 0;
    mocked.ratehawkCall.mockReset();
  });

  it("retries duplicate/unknown booking-form failures with a new partner_order_id", async () => {
    mocked.ratehawkCall
      .mockResolvedValueOnce(supplierError("bookingForm", "double_booking_form"))
      .mockResolvedValueOnce(supplierError("bookingForm", "duplicate_reservation"))
      .mockResolvedValueOnce(supplierError("bookingForm", "timeout"))
      .mockResolvedValueOnce(supplierError("bookingForm", "unknown"))
      .mockResolvedValueOnce(ok("bookingForm", { payment_types: [] }));

    const out = await createBookingForm({
      partnerOrderId: "first-id",
      bookHash: "p-hash",
      userIp: "203.0.113.10",
    });

    expect(out.ok).toBe(true);
    expect(out.attempts).toBe(5);
    expect(mocked.ratehawkCall).toHaveBeenCalledTimes(5);
    const ids = mocked.ratehawkCall.mock.calls.map(([, body]) => String(body.partner_order_id));
    expect(new Set(ids).size).toBe(3);
    expect(out.partnerOrderId).toBe(ids[2]);
  });

  it("retries HTTP 5xx booking-form failures and stops on success", async () => {
    mocked.ratehawkCall
      .mockResolvedValueOnce(supplierError("bookingForm", "http_500", 500))
      .mockResolvedValueOnce(supplierError("bookingForm", "http_503", 503))
      .mockResolvedValueOnce(ok("bookingForm", { payment_types: [] }));

    const out = await createBookingForm({
      partnerOrderId: "first-id",
      bookHash: "p-hash",
      userIp: "203.0.113.10",
    });

    expect(out.ok).toBe(true);
    expect(out.attempts).toBe(3);
    expect(mocked.ratehawkCall).toHaveBeenCalledTimes(3);
    expect(new Set(mocked.ratehawkCall.mock.calls.map(([, body]) => String(body.partner_order_id))).size).toBe(3);
  });

  it("does not retry a non-retryable booking-form failure", async () => {
    mocked.ratehawkCall.mockResolvedValue(supplierError("bookingForm", "rate_not_found", 400));

    const out = await createBookingForm({
      partnerOrderId: "first-id",
      bookHash: "p-hash",
      userIp: "203.0.113.10",
    });

    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(1);
    expect(mocked.ratehawkCall).toHaveBeenCalledTimes(1);
  });

  it("never exceeds ten booking-form calls", async () => {
    mocked.ratehawkCall.mockResolvedValue(supplierError("bookingForm", "unknown"));

    const out = await createBookingForm({
      partnerOrderId: "first-id",
      bookHash: "p-hash",
      userIp: "203.0.113.10",
    });

    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(RATEHAWK_MAX_BOOKING_FORM_CALLS);
    expect(mocked.ratehawkCall).toHaveBeenCalledTimes(10);
    expect(new Set(mocked.ratehawkCall.mock.calls.map(([, body]) => String(body.partner_order_id))).size).toBe(10);
  });

  it("keeps processing, unknown, timeout and 5xx status responses in progress", async () => {
    mocked.ratehawkCall
      .mockResolvedValueOnce({
        ok: true,
        data: { status: "processing" },
        meta: { operation: "bookingStatus", environment: "sandbox", httpStatus: 200, latencyMs: 1, attempts: 1, supplierStatus: "processing" },
      })
      .mockResolvedValueOnce(supplierError("bookingStatus", "unknown"))
      .mockResolvedValueOnce(supplierError("bookingStatus", "timeout"))
      .mockResolvedValueOnce(supplierError("bookingStatus", "http_503", 503))
      .mockResolvedValueOnce(ok("bookingStatus", { status: "ok" }))
      .mockResolvedValueOnce(ok("orderInfo", { orders: [{ order_id: 123, status: "completed" }] }));

    const out = await resolveBookingOutcome("order-1", { maxAttempts: 10, delayMs: 0 });

    expect(out.internalStatus).toBe("confirmed");
    expect(out.attempts).toBe(5);
    expect(out.orderId).toBe(123);
    expect(mocked.ratehawkCall.mock.calls.filter(([operation]) => operation === "bookingStatus")).toHaveLength(5);
  });

  it("caps status polling at ten calls and keeps a transient outcome pending", async () => {
    mocked.ratehawkCall.mockImplementation(async (operation: string) => {
      if (operation === "bookingStatus") return supplierError("bookingStatus", "unknown");
      return ok("orderInfo", { orders: [] });
    });

    const out = await resolveBookingOutcome("order-1", { maxAttempts: 99, delayMs: 0 });

    expect(out.attempts).toBe(RATEHAWK_MAX_BOOKING_STATUS_CALLS);
    expect(mocked.ratehawkCall.mock.calls.filter(([operation]) => operation === "bookingStatus")).toHaveLength(10);
    expect(out.internalStatus).toBe("pending");
  });

  it("stops immediately on final sold-out and book-limit outcomes", async () => {
    for (const errorCode of ["soldout", "book_limit"] as const) {
      mocked.ratehawkCall.mockReset();
      mocked.calls.length = 0;
      mocked.ratehawkCall
        .mockResolvedValueOnce(supplierError("bookingStatus", errorCode))
        .mockResolvedValueOnce(ok("orderInfo", { orders: [] }));

      const out = await resolveBookingOutcome("order-1", { maxAttempts: 10, delayMs: 0 });

      expect(out.internalStatus).toBe(errorCode === "soldout" ? "failed-soldout" : "failed-book-limit");
      expect(mocked.ratehawkCall.mock.calls.filter(([operation]) => operation === "bookingStatus")).toHaveLength(1);
    }
  });
});
