import { describe, expect, it } from "vitest";
import { CUSTOMER_AI_FALLBACK, sanitizeCustomerAiReply } from "./customer-output";

describe("customer AI output boundary", () => {
  it("redacts supplier names and third-party URLs", () => {
    const result = sanitizeCustomerAiReply(
      "Viator has this tour: https://www.viator.com/tours/example. RateHawk also has an option.",
    );
    expect(result).toBe("Worldway has this tour: [worldway] Worldway also has an option.");
  });

  it("fails closed if a known supplier term survives redaction", () => {
    const result = sanitizeCustomerAiReply("HBX");
    expect(result).toBe(CUSTOMER_AI_FALLBACK);
  });

  it("preserves ordinary Worldway travel language", () => {
    expect(sanitizeCustomerAiReply("Your flight arrives in Delhi at 18:30 local time."))
      .toBe("Your flight arrives in Delhi at 18:30 local time.");
  });

  it("fails closed for empty or non-text model output", () => {
    expect(sanitizeCustomerAiReply("   ")).toBe(CUSTOMER_AI_FALLBACK);
    expect(sanitizeCustomerAiReply(null)).toBe(CUSTOMER_AI_FALLBACK);
  });
});
