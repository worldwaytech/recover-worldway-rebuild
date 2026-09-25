import { describe, expect, it } from "vitest";
import {
  extractTrackingId,
  isTracedViatorPath,
  pickCorrelationHeaders,
  sanitizeForTrace,
} from "@/lib/viator/diagnostics";

describe("viator diagnostics sanitizer", () => {
  it("removes secrets, payment tokens and PII", () => {
    const out = JSON.stringify(
      sanitizeForTrace({
        cartRef: "CR-1",
        paymentToken: "tok_live_123",
        paymentSessionToken: "sess",
        hostingUrl: "https://www.worldwaytravelsgroup.com",
        bookerInfo: { firstName: "Jane", lastName: "Doe" },
        communication: { email: "jane@example.com", phone: "+911234567890" },
        items: [{ bookingQuestionAnswers: [{ question: "FULL_NAMES_FIRST", answer: "Jane" }] }],
        note: "contact jane@example.com card 4111 1111 1111 1111",
      }),
    );
    expect(out).not.toMatch(/tok_live|sess"|Jane|Doe|jane@example|1234567890|4111/);
    expect(out).toContain("CR-1");
    expect(out).toContain("worldwaytravelsgroup.com");
    expect(out).toContain("FULL_NAMES_FIRST");
  });

  it("keeps correlation headers only", () => {
    const h = new Headers({ "x-unique-id": "abc", "exp-api-key": "secret", "content-type": "json" });
    expect(pickCorrelationHeaders(h)).toEqual({ "x-unique-id": "abc" });
  });

  it("extracts tracking ids and scopes to booking chain", () => {
    expect(extractTrackingId({ trackingId: "T1" })).toBe("T1");
    expect(isTracedViatorPath("/bookings/cart/hold")).toBe(true);
    expect(isTracedViatorPath("/products/search")).toBe(false);
  });
});
