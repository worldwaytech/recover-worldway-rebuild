import { describe, expect, it } from "vitest";
import { rateLimitKey, requestFingerprint } from "../rate-limit.server";

describe("Worldway rate-limit primitives", () => {
  it("produces deterministic non-PII keys", () => {
    const a = rateLimitKey("concierge", "user-123");
    const b = rateLimitKey("concierge", "user-123");
    expect(a).toBe(b);
    expect(a).toMatch(/^wwrl:[a-f0-9]{64}$/);
    expect(a).not.toContain("user-123");
  });

  it("distinguishes operations", () => {
    expect(rateLimitKey("search", "u")).not.toBe(rateLimitKey("concierge", "u"));
  });

  it("prefers the first forwarded IP value", () => {
    const request = new Request("https://worldway.test", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1", "x-real-ip": "198.51.100.4" },
    });
    expect(requestFingerprint(request)).toBe("203.0.113.10");
  });
});
