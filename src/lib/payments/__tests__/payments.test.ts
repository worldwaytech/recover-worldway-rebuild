/**
 * Payment security tests: signature verification, amount/currency validation,
 * webhook verification and idempotent reconciliation guards.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";

beforeAll(() => {
  process.env["RAZORPAY_KEY_ID"] = "rzp_test_unit";
  process.env["RAZORPAY_KEY_SECRET"] = "unit_secret";
  process.env["RAZORPAY_WEBHOOK_SECRET"] = "unit_webhook_secret";
});

describe("checkout signature verification", () => {
  it("accepts a genuine Razorpay handoff signature", async () => {
    const { verifyCheckoutSignature } = await import("../razorpay.server");
    const orderId = "order_ABC123";
    const paymentId = "pay_XYZ789";
    const signature = createHmac("sha256", "unit_secret")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    expect(verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(true);
  });

  it("rejects a forged or replayed signature", async () => {
    const { verifyCheckoutSignature } = await import("../razorpay.server");
    const good = createHmac("sha256", "unit_secret")
      .update("order_A|pay_A")
      .digest("hex");
    // Same signature, different payment id → must fail.
    expect(
      verifyCheckoutSignature({ orderId: "order_A", paymentId: "pay_B", signature: good }),
    ).toBe(false);
    expect(
      verifyCheckoutSignature({ orderId: "order_A", paymentId: "pay_A", signature: "deadbeef" }),
    ).toBe(false);
  });
});

describe("webhook signature verification", () => {
  it("accepts a body signed with the webhook secret", async () => {
    const { verifyWebhookSignature } = await import("../razorpay.server");
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = createHmac("sha256", "unit_webhook_secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and missing signatures", async () => {
    const { verifyWebhookSignature } = await import("../razorpay.server");
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = createHmac("sha256", "unit_webhook_secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body + " ", sig)).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
    expect(
      verifyWebhookSignature(body, createHmac("sha256", "other").update(body).digest("hex")),
    ).toBe(false);
  });
});

describe("amount and currency validation", () => {
  it("uses server-owned membership pricing and ignores client amounts", async () => {
    const { resolvePaymentAmount } = await import("../checkout.server");
    const { MEMBERSHIP_PLANS } = await import("../plans");
    const resolved = resolvePaymentAmount({
      purpose: "membership",
      planId: "elite",
      currency: "INR",
      amount: 1,
    });
    expect(resolved.amountMinor).toBe(MEMBERSHIP_PLANS.elite.amountMinor);
    expect(resolved.currency).toBe("USD");
    expect(resolved.planId).toBe("elite");
  });

  it("rejects unknown membership plans", async () => {
    const { resolvePaymentAmount } = await import("../checkout.server");
    expect(() =>
      resolvePaymentAmount({ purpose: "membership", planId: "free_forever", currency: "USD" }),
    ).toThrow();
  });

  it("converts major units to minor units and enforces bounds", async () => {
    const { resolvePaymentAmount } = await import("../checkout.server");
    expect(resolvePaymentAmount({ purpose: "flight", amount: 5975.5, currency: "INR" }).amountMinor).toBe(
      597550,
    );
    expect(() => resolvePaymentAmount({ purpose: "flight", amount: 0.5, currency: "INR" })).toThrow();
    expect(() => resolvePaymentAmount({ purpose: "flight", currency: "INR" })).toThrow();
  });

  it("treats zero-decimal currencies without multiplying", async () => {
    const { resolvePaymentAmount } = await import("../checkout.server");
    expect(resolvePaymentAmount({ purpose: "tour", amount: 50_000, currency: "JPY" }).amountMinor).toBe(
      50_000,
    );
  });
});

describe("payment-before-UP17 enforcement contract", () => {
  it("requires an order id and payment id on the ticketing input", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/up17/up17.functions.ts", "utf8"),
    );
    const book = src.slice(src.indexOf("up17BookFlightTicket"));
    expect(book).toContain("orderId");
    expect(book).toContain("paymentId");
    // The supplier call must be preceded by the fulfilment claim.
    expect(book.indexOf("claimVerifiedPaymentForFulfilment")).toBeLessThan(
      book.indexOf("up17BookFlight("),
    );
  });
});
