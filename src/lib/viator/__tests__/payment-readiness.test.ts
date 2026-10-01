import { describe, expect, it } from "vitest";
import { cardFormShouldBeMounted, paymentBlocker, safeDiagnostic } from "../payment-readiness";

const ready = {
  hasHandler: true,
  formLoaded: true,
  formValid: true,
  submitting: false,
  postalCode: "10001",
  missingAnswer: null,
};

describe("Viator card form readiness", () => {
  it("allows pay only when fully ready", () => {
    expect(paymentBlocker(ready)).toBeNull();
  });
  it("blocks before FORM_LOADED even if the card looks valid", () => {
    expect(paymentBlocker({ ...ready, formLoaded: false })).toBe("FORM_NOT_LOADED");
  });
  it("blocks without a handler, incomplete card, missing postcode or answer", () => {
    expect(paymentBlocker({ ...ready, hasHandler: false })).toBe("HANDLER_MISSING");
    expect(paymentBlocker({ ...ready, formValid: false })).toBe("CARD_INCOMPLETE");
    expect(paymentBlocker({ ...ready, postalCode: " " })).toBe("POSTAL_CODE_MISSING");
    expect(paymentBlocker({ ...ready, missingAnswer: "Weight" })).toBe("ANSWER_MISSING");
  });
  it("blocks a second submit while one is in flight", () => {
    expect(paymentBlocker({ ...ready, submitting: true })).toBe("SUBMIT_IN_FLIGHT");
  });
  it("keeps the card form mounted through tokenisation and booking", () => {
    expect(cardFormShouldBeMounted("paying")).toBe(true);
    expect(cardFormShouldBeMounted("booking")).toBe(true);
    expect(cardFormShouldBeMounted("done")).toBe(false);
    expect(cardFormShouldBeMounted("details")).toBe(false);
  });
  it("redacts card numbers and payment tokens from diagnostics", () => {
    const d = safeDiagnostic(new Error("bad 4242424242424242 pm_123abc pi_9XyZ"));
    expect(d).not.toContain("4242424242424242");
    expect(d).not.toContain("pm_123abc");
    expect(d).not.toContain("pi_9XyZ");
  });
});
