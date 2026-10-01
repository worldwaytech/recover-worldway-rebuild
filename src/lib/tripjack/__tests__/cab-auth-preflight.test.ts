import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { cabAuthPreflight } from "../cabs.server";

const ok = (cid: string) => ({ ok: true as const, data: {}, correlationId: cid });
const err = (cid: string, status: number) => ({
  ok: false as const,
  correlationId: cid,
  error: { kind: "http" as const, status, message: `HTTP ${status}`, correlationId: cid },
});

describe("cabAuthPreflight", () => {
  it("passes on first success with one attempt", async () => {
    const call = vi.fn().mockResolvedValueOnce(ok("a"));
    const r = await cabAuthPreflight(0, call as never);
    expect(r.ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("retries exactly once on 401 and records both attempts", async () => {
    const call = vi.fn().mockResolvedValueOnce(err("a", 401)).mockResolvedValueOnce(ok("b"));
    const r = await cabAuthPreflight(0, call as never);
    expect(r.ok).toBe(true);
    expect(r.attempts.map((a) => a.correlationId)).toEqual(["a", "b"]);
  });
  it("stops after two 401s — never a third attempt", async () => {
    const call = vi.fn().mockResolvedValue(err("x", 401));
    const r = await cabAuthPreflight(0, call as never);
    expect(r.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
    expect(r.message).toMatch(/authentication unavailable/);
  });
  it("does not retry non-401 failures", async () => {
    const call = vi.fn().mockResolvedValue(err("x", 503));
    const r = await cabAuthPreflight(0, call as never);
    expect(r.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
