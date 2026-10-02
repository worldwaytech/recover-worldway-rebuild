import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";

export class WorldwayRateLimitError extends Error {
  constructor(public retryAfterSeconds = 60) {
    super("Too many requests. Please try again shortly.");
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function rateLimitKey(...parts: string[]): string {
  return `wwrl:${digest(parts.join("|").slice(0, 2048))}`;
}

/**
 * Distributed, atomic limiter backed by Supabase. The database function is
 * service-role-only, so clients cannot forge counters or reset buckets.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds = 60): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("worldway_consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail closed for protected AI/commerce operations. A limiter outage must
    // not become an accidental unlimited-request bypass.
    throw new Error("Rate limiter unavailable");
  }
  if (data !== true) throw new WorldwayRateLimitError(windowSeconds);
}

export function requestFingerprint(request: Request | undefined): string {
  if (!request) return "unknown";
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  // These values are hashed and used only as a coarse abuse-control key.
  // Deployment infrastructure must ensure these headers are supplied by its
  // trusted proxy rather than directly by an untrusted client.
  return forwarded?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
}

export function currentRequest(): Request | undefined {
  return getRequest();
}
