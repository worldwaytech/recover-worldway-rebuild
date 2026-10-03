import { describe, expect, it } from "vitest";
import { authorizePaymentRequest, type PaymentAuthority } from "../payment-authority.server";

const authority: PaymentAuthority = {
  userId: "user",
  tenantId: "tenant",
  accountType: "b2b",
  policyId: "policy",
  creditEnabled: true,
  creditLimitMinor: 5_000_000,
  invoiceTermsDays: 30,
  maxTransactionMinor: 20_000_000,
  approvalAboveMinor: 10_000_000,
  allowedMethods: ["razorpay", "wallet", "bank_transfer", "credit"],
  currency: "INR",
};

describe("unified payment authority", () => {
  it("allows configured Razorpay payments below the account limit", () => {
    expect(authorizePaymentRequest(authority, {
      method: "razorpay", amountMinor: 250_000, currency: "INR",
    })).toEqual({ ok: true, requiresApproval: false });
  });

  it("requires authorization above the configured approval threshold", () => {
    expect(authorizePaymentRequest(authority, {
      method: "razorpay", amountMinor: 12_000_000, currency: "INR",
    })).toEqual({ ok: true, requiresApproval: true });
  });

  it("rejects amounts above the account limit", () => {
    expect(authorizePaymentRequest(authority, {
      method: "razorpay", amountMinor: 20_000_001, currency: "INR",
    })).toEqual({ ok: false, error: "This transaction exceeds the account's configured payment limit." });
  });

  it("rejects methods not enabled for the account", () => {
    const restricted = { ...authority, allowedMethods: ["razorpay"] as const };
    expect(authorizePaymentRequest(restricted, {
      method: "wallet", amountMinor: 100_000, currency: "INR",
    })).toEqual({ ok: false, error: "Payment method is not enabled for this account." });
  });

  it("enforces credit enablement and limit", () => {
    expect(authorizePaymentRequest(authority, {
      method: "credit", amountMinor: 5_000_000, currency: "INR",
    })).toEqual({ ok: true, requiresApproval: false });

    expect(authorizePaymentRequest(authority, {
      method: "credit", amountMinor: 5_000_001, currency: "INR",
    })).toEqual({ ok: false, error: "Credit terms are not enabled for this account or the requested amount exceeds its approved credit limit." });
  });

  it("keeps approval separate from provider execution", () => {
    const pending = authorizePaymentRequest(authority, {
      method: "razorpay", amountMinor: 12_000_000, currency: "INR",
    });
    expect(pending.ok).toBe(true);
    if (pending.ok) expect(pending.requiresApproval).toBe(true);

    const approved = authorizePaymentRequest(authority, {
      method: "razorpay", amountMinor: 12_000_000, currency: "INR", approved: true,
    });
    expect(approved).toEqual({ ok: true, requiresApproval: false });
  });
});
