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

  it("does not share idempotency records across principals", () => {
    const store = new ControlledCommerceApprovalStore();
    const first = store.request({
      tool: "book_trip",
      action: "BOOK",
      quoteId: "quote-1",
      idempotencyKey: "shared-looking-key",
      principalUserId: "user-1",
    });
    const other = store.request({
      tool: "book_trip",
      action: "BOOK",
      quoteId: "quote-2",
      idempotencyKey: "shared-looking-key",
      principalUserId: "user-2",
    });

    expect(other.id).not.toBe(first.id);
    expect(other.principalUserId).toBe("user-2");
    expect(other.quoteId).toBe("quote-2");
  });

  it("rejects idempotency reuse for a different commerce request", () => {
    const store = new ControlledCommerceApprovalStore();
    store.request({
      tool: "book_trip",
      action: "BOOK",
      quoteId: "quote-original",
      idempotencyKey: "idem-conflict",
      principalUserId: "user-conflict",
    });

    expect(() => store.request({
      tool: "pay_trip",
      action: "PAY",
      quoteId: "quote-different",
      idempotencyKey: "idem-conflict",
      principalUserId: "user-conflict",
    })).toThrow("idempotency_conflict");
  });

  it("does not expose an approval to another principal", () => {
    const store = new ControlledCommerceApprovalStore();
    const pending = store.request({
      tool: "book_trip",
      action: "BOOK",
      quoteId: "quote-private",
      idempotencyKey: "idem-private",
      principalUserId: "owner",
    });

    expect(() => store.get(pending.id, "other")).toThrow("principal_mismatch");
    expect(store.get(pending.id, "owner")?.quoteId).toBe("quote-private");
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
    expect(grant).toEqual({ tool: "pay_trip", action: "PAY", grantedBy: "booking_readiness", principalUserId: "user-2", expiresAt: expect.any(String) });

    const consumed = store.consume(pending.id, "user-2");
    expect(consumed.status).toBe("consumed");

    expect(() => store.toHighRiskGrant(pending.id, "user-2", true))
      .toThrow("approval_required:consumed");
  });

  it("binds a high-risk grant to the exact approved action", () => {
    const store = new ControlledCommerceApprovalStore();
    const pending = store.request({
      tool: "pay_trip",
      action: "PAY",
      quoteId: "quote-action",
      idempotencyKey: "idem-action",
      principalUserId: "user-action",
    });
    store.approve(pending.id, "user-action");

    const grant = store.toHighRiskGrant(pending.id, "user-action", true);
    expect(grant).toEqual({ tool: "pay_trip", action: "PAY", grantedBy: "booking_readiness", principalUserId: "user-action", expiresAt: expect.any(String) });
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
