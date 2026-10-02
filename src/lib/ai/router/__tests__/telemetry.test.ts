import { afterEach, describe, expect, it, vi } from "vitest";
import { emit, scrubMeta } from "../telemetry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AI telemetry hardening", () => {
  it("drops sensitive keys and bounds metadata", () => {
    const meta: Record<string, unknown> = {
      password: "secret",
      customerEmail: "customer@example.com",
      safe: "x".repeat(200),
    };
    for (let i = 0; i < 30; i++) meta[`field${i}`] = i;

    const out = scrubMeta(meta);

    expect(out?.password).toBeUndefined();
    expect(out?.customerEmail).toBeUndefined();
    expect(out?.safe).toHaveLength(80);
    expect(Object.keys(out ?? {})).toHaveLength(24);
  });

  it("bounds correlation ids and reasons before emitting", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    emit({
      type: "model.failure",
      correlationId: "c".repeat(300),
      reason: "r".repeat(300),
      outcome: "error",
    });

    const payload = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(payload.correlationId).toHaveLength(120);
    expect(payload.reason).toHaveLength(160);
  });
});
