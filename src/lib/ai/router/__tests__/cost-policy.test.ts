import { describe, expect, it } from "vitest";
import { allowAiRequestAttempt, allowsAiCostTier, maxAiCostTier, maxAiRequestsPerMinute, maxAiRouteAttempts } from "../cost-policy";

describe("AI cost policy", () => {
  it("defaults to the current tier ceiling", () => {
    expect(maxAiCostTier({})).toBe(3);
    expect(allowsAiCostTier(3, {})).toBe(true);
    expect(allowsAiCostTier(4, {})).toBe(false);
  });

  it("honors a configured ceiling and clamps invalid values", () => {
    expect(maxAiCostTier({ WORLDWAY_AI_MAX_COST_TIER: "2" })).toBe(2);
    expect(allowsAiCostTier(2, { WORLDWAY_AI_MAX_COST_TIER: "2" })).toBe(true);
    expect(allowsAiCostTier(3, { WORLDWAY_AI_MAX_COST_TIER: "2" })).toBe(false);
    expect(maxAiCostTier({ WORLDWAY_AI_MAX_COST_TIER: "99" })).toBe(5);
    expect(maxAiCostTier({ WORLDWAY_AI_MAX_COST_TIER: "invalid" })).toBe(3);
  });

  it("bounds provider attempts per logical request", () => {
    expect(maxAiRouteAttempts({})).toBe(2);
    expect(maxAiRouteAttempts({ WORLDWAY_AI_MAX_ROUTE_ATTEMPTS: "3" })).toBe(3);
    expect(maxAiRouteAttempts({ WORLDWAY_AI_MAX_ROUTE_ATTEMPTS: "99" })).toBe(4);
    expect(maxAiRouteAttempts({ WORLDWAY_AI_MAX_ROUTE_ATTEMPTS: "0" })).toBe(1);
    expect(maxAiRouteAttempts({ WORLDWAY_AI_MAX_ROUTE_ATTEMPTS: "invalid" })).toBe(2);
  });

  it("defaults the emergency request budget to disabled and enforces configured limits", () => {
    expect(maxAiRequestsPerMinute({})).toBe(0);
    expect(allowAiRequestAttempt({})).toBe(true);

    const env = { WORLDWAY_AI_MAX_REQUESTS_PER_MINUTE: "2" };
    const now = Date.now() + 600_000;
    expect(allowAiRequestAttempt(env, now)).toBe(true);
    expect(allowAiRequestAttempt(env, now + 1)).toBe(true);
    expect(allowAiRequestAttempt(env, now + 2)).toBe(false);
    expect(allowAiRequestAttempt(env, now + 60_001)).toBe(true);
    expect(maxAiRequestsPerMinute({ WORLDWAY_AI_MAX_REQUESTS_PER_MINUTE: "99999" })).toBe(10_000);
  });
});
