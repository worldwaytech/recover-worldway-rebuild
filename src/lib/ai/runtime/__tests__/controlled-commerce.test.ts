import { describe, expect, it } from "vitest";
import {
  CommerceApprovalError,
  ControlledCommerceApprovalStore,
  assertControlledCommerceAction,
  assertNoAutonomousCommerce,
} from "../controlled-commerce";

describe("Controlled Agentic Commerce", () => {
  it("creates a pending, idempotent approval request", () => {
    const store = new ControlledCommerceApprovalStore();
    const first = store.request({
      tool: "book_trip",
      action: "BOOK",
      quoteId: "quote-1",
      idempotencyKey: "idem-1",
      principalUserId: "user-1",
    });
    const second = store.request({
      tool: "book_trip",
      action: "BOOK",
      quoteId: "quote-1",
      idempotencyKey: "idem-1",
      principalUserId: "user-1",
    });

    expect(first.status).toBe("pending");
    expect(second.id).toBe(first.id);
  });

  it("requires the same principal to approve and consume", () => {
    const store = new ControlledCommerceApprovalStore();
    const pending = store.request({
      tool: "pay_trip",
      action: "PAY",
      quoteId: "quote-2",
      idempotencyKey: "idem-2",
      principalUserId: "user-2",
    });

    expect(() => store.approve(pending.id, "user-3"))
      .toThrow("principal_mismatch");

    const approved = store.approve(pending.id, "user-2");
    expect(approved.status).toBe("approved");

    expect(() => store.toHighRiskGrant(pending.id, "user-2", false))
      .toThrow("booking_readiness_required");

    const grant = store.toHighRiskGrant(pending.id, "user-2", true);
    expect(grant).toEqual({ tool: "pay_trip", grantedBy: "booking_readiness" });

    const consumed = store.consume(pending.id, "user-2");
    expect(consumed.status).toBe("consumed");

    expect(() => store.toHighRiskGrant(pending.id, "user-2"))
      .toThrow("approval_required:consumed");
  });

  it("expires approval before it can be consumed", () => {
    const store = new ControlledCommerceApprovalStore();
    const pending = store.request({
      tool: "book_trip",
      action: "BOOK",
      quoteId: "quote-3",
      idempotencyKey: "idem-3",
      principalUserId: "user-3",
      expiresInMs: 1_000,
    });
    const approved = store.approve(pending.id, "user-3");
    expect(approved.status).toBe("approved");

    const originalNow = Date.now;
    Date.now = () => originalNow() + 2_000;
    try {
      expect(() => store.consume(pending.id, "user-3")).toThrow("approval_required:expired");
    } finally {
      Date.now = originalNow;
    }
  });

  it("blocks autonomous commerce metadata", () => {
    expect(() => assertNoAutonomousCommerce({ autonomousBooking: true }))
      .toThrow("autonomous_commerce_disabled");
    expect(() => assertNoAutonomousCommerce({ autonomousPayment: true }))
      .toThrow("autonomous_commerce_disabled");
  });

  it("allows only controlled high-risk commerce actions", () => {
    expect(() => assertControlledCommerceAction("BOOK")).not.toThrow();
    expect(() => assertControlledCommerceAction("DELETE_ACCOUNT"))
      .toThrow(CommerceApprovalError);
  });
});
