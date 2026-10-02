import { beforeEach, describe, expect, it } from "vitest";
import { allowAiAttempt, maxAiRequestsPerMinute, recordAiUsage, usageSnapshot } from "../usage-meter";

describe("AI usage meter", () => {
  beforeEach(() => {
    // The meter is process-local. Advancing time by one window resets it.
  });

  it("defaults the emergency request ceiling to disabled", () => {
    expect(maxAiRequestsPerMinute({})).toBe(0);
    expect(allowAiAttempt({})).toBe(true);
  });

  it("enforces a configured per-minute attempt ceiling and resets", () => {
    const env = { WORLDWAY_AI_MAX_REQUESTS_PER_MINUTE: "2" };
    const now = Date.now() + 120_000;
    expect(allowAiAttempt(env, now)).toBe(true);
    expect(allowAiAttempt(env, now + 1)).toBe(true);
    expect(allowAiAttempt(env, now + 2)).toBe(false);
    expect(allowAiAttempt(env, now + 60_001)).toBe(true);
  });

  it("aggregates only bounded model/task metadata", () => {
    const now = Date.now() + 240_000;
    recordAiUsage({ provider: "lovable", model: "model-a", task: "explanation", outcome: "started" }, now);
    recordAiUsage({ provider: "lovable", model: "model-a", task: "explanation", outcome: "ok", inputTokens: 10, outputTokens: 20, costCredits: 1.5 }, now + 1);
    const row = usageSnapshot(now + 2).buckets.find((x) => x.key === "lovable|model-a|explanation");
    expect(row).toMatchObject({ started: 1, ok: 1, inputTokens: 10, outputTokens: 20, costCredits: 1.5 });
  });
});
