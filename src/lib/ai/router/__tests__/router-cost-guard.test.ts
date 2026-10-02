import { describe, expect, it, vi } from "vitest";
import { HealthBook } from "../health";
import { POLICIES } from "../registry";
import { AiEmergencyCircuitOpenError, route, withRoute, type RouterDeps } from "../router";
import type { ModelSpec } from "../types";

const primary: ModelSpec = {
  id: "test-primary",
  provider: "lovable",
  capabilities: ["chat", "tools", "structured", "reasoning", "vision", "pdf"],
  costTier: 3,
  latencyMs: 100,
  rpm: 60,
  enabled: true,
};

const fallback: ModelSpec = {
  ...primary,
  id: "test-fallback",
};

describe("AI router cost and attempt guards", () => {
  it("blocks a model above the configured cost ceiling", () => {
    const deps: RouterDeps = {
      models: [{ ...primary, id: "openai/gpt-6-astra", costTier: 4 }],
      env: { LOVABLE_API_KEY: "test", WORLDWAY_AI_MAX_COST_TIER: "3" },
    };

    expect(() => route("explanation", deps)).toThrowError(/No healthy model/);
    try {
      route("explanation", deps);
    } catch (error) {
      expect((error as { skipped?: { why: string }[] }).skipped).toEqual([
        { model: "openai/gpt-6-astra", why: "cost_ceiling" },
      ]);
    }
  });

  it("never exceeds the configured provider-attempt ceiling", async () => {
    const policies = {
      ...POLICIES,
      explanation: {
        ...POLICIES.explanation,
        preferred: [primary.id],
        fallback: [fallback.id],
      },
    };
    const health = new HealthBook({ failureThreshold: 10, openMs: 30_000, windowMs: 60_000 });
    const deps: RouterDeps = {
      models: [primary, fallback],
      health,
      policies,
      env: { LOVABLE_API_KEY: "test", WORLDWAY_AI_MAX_ROUTE_ATTEMPTS: "2" },
    };
    const call = vi.fn(async () => {
      const error = new Error("upstream unavailable") as Error & { status: number };
      error.status = 503;
      throw error;
    });

    await expect(withRoute("explanation", call, deps)).rejects.toMatchObject({ status: 503 });
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("opens the emergency request circuit before a fallback can exceed the global ceiling", async () => {
    const policies = {
      ...POLICIES,
      explanation: {
        ...POLICIES.explanation,
        preferred: [primary.id],
        fallback: [fallback.id],
      },
    };
    const health = new HealthBook({ failureThreshold: 10, openMs: 30_000, windowMs: 60_000 });
    const deps: RouterDeps = {
      models: [primary, fallback],
      health,
      policies,
      env: {
        LOVABLE_API_KEY: "test",
        WORLDWAY_AI_MAX_ROUTE_ATTEMPTS: "2",
        WORLDWAY_AI_MAX_REQUESTS_PER_MINUTE: "1",
      },
    };
    const error = Object.assign(new Error("upstream unavailable"), { status: 503 });
    const call = vi.fn(async () => { throw error; });

    await expect(withRoute("explanation", call, deps)).rejects.toBeInstanceOf(AiEmergencyCircuitOpenError);
    expect(call).toHaveBeenCalledTimes(1);
  });

});
