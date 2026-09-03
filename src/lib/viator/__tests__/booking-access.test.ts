import { describe, expect, it } from "vitest";
import { isViatorEndpointDenied } from "@/lib/viator.server";

describe("Viator booking entitlement detection", () => {
  it("recognises the supplier's 403 entitlement response", () => {
    expect(isViatorEndpointDenied(403, "Endpoint access denied")).toBe(true);
    expect(isViatorEndpointDenied(403, "FORBIDDEN")).toBe(true);
  });
  it("does not misclassify other failures", () => {
    expect(isViatorEndpointDenied(401, "Invalid API Key")).toBe(false);
    expect(isViatorEndpointDenied(400, "Endpoint access denied")).toBe(false);
    expect(isViatorEndpointDenied(403, undefined)).toBe(false);
    expect(isViatorEndpointDenied(503, "Viator API key not configured.")).toBe(false);
  });
});
