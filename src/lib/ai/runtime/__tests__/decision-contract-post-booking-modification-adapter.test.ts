import { describe, expect, it } from "vitest";
import { projectDecisionContractToPostBookingModification } from "../decision-contract-post-booking-modification-adapter";
import type { BookingComponent } from "../../../engine/booking-orchestration";
import type { WorldwayDecisionContract } from "../decision-contract";

const component: BookingComponent = {
  id: "flight-1",
  kind: "flight",
  supplierKey: "demo",
  externalId: "F1",
  title: "Demo flight",
  amount: 100,
  currency: "USD",
};

const contract = (constraints: string[], decisionKind: WorldwayDecisionContract["decisionKind"] = "recommendation"): WorldwayDecisionContract => ({
  contractVersion: "1.0",
  decisionKind,
  decision: "request a bounded booking modification",
  confidence: 0.9,
  evidence: [{ source: "engine", reference: "booking:1", observedAt: "2026-10-03T00:00:00Z", confidence: 1 }],
  correlationId: "corr-test",
  sourceTaskId: "task-test",
  constraints,
  expiresAt: "2026-10-03T23:59:59Z",
});

describe("post-booking modification decision boundary", () => {
  const capabilities = new Map([["demo", ["modify", "revalidate"] as const]]);

  it("projects only explicit allowlisted modification intent and keeps deterministic readiness authoritative", () => {
    const result = projectDecisionContractToPostBookingModification(contract([
      "postbooking.modification.component=flight-1",
      "postbooking.modification.date=2026-10-20",
      "postbooking.modification.time=14:30",
      "postbooking.modification.passengerCount=3",
      "postbooking.modification.notes=Window seat if available",
    ]), {
      bookingId: "WWB-t1-1",
      bookingStatus: "Ticketed",
      components: [component],
      capabilities,
    });

    expect(result.componentIds).toEqual(["flight-1"]);
    expect(result.changes).toEqual({
      date: "2026-10-20",
      time: "14:30",
      passengerCount: 3,
      notes: "Window seat if available",
    });
    expect(result.readiness.ready).toBe(true);
    expect(result.readiness.requiresRevalidation).toBe(true);
    expect(result.readiness.requiresCommercialRequote).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("ignores unsupported supplier/payment mutation fields", () => {
    const result = projectDecisionContractToPostBookingModification(contract([
      "postbooking.modification.component=flight-1",
      "postbooking.modification.date=2026-10-20",
      "postbooking.modification.amount=1",
      "postbooking.modification.currency=EUR",
      "postbooking.modification.refund=1000",
      "postbooking.modification.providerRef=evil-ref",
      "supplier.capability.modify=true",
    ]), {
      bookingId: "WWB-t1-1",
      bookingStatus: "Booked",
      components: [component],
      capabilities,
    });

    expect(result.changes).toEqual({ date: "2026-10-20" });
    expect(JSON.stringify(result)).not.toContain("evil-ref");
    expect(JSON.stringify(result)).not.toContain("1000");
    expect(result.readiness.ready).toBe(true);
  });

  it("blocks modification when booking state or supplier capabilities are not eligible", () => {
    const result = projectDecisionContractToPostBookingModification(contract([
      "postbooking.modification.component=flight-1",
      "postbooking.modification.date=2026-10-20",
    ]), {
      bookingId: "WWB-t1-1",
      bookingStatus: "Pending",
      components: [component],
      capabilities: new Map([["demo", ["book"] as const]]),
    });

    expect(result.readiness.ready).toBe(false);
    expect(result.readiness.blockers).toEqual(expect.arrayContaining([
      "Booking must be Booked or Ticketed before modification.",
      "flight-1: supplier modification capability missing",
      "flight-1: supplier revalidation capability missing",
    ]));
  });

  it("never turns a non-recommendation decision into a modification intent", () => {
    expect(() => projectDecisionContractToPostBookingModification(contract(
      ["postbooking.modification.date=2026-10-20"],
      "routing",
    ), {
      bookingId: "WWB-t1-1",
      bookingStatus: "Booked",
      components: [component],
      capabilities,
    })).toThrow("decision_contract_not_post_booking_modification_compatible");
  });
});
