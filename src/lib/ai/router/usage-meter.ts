// Bounded in-memory AI usage aggregation and optional emergency breaker.
// This is a local safety layer, not a billing source of truth.
export interface UsageEvent {
  provider: string;
  model: string;
  task: string;
  outcome: "started" | "ok" | "error" | "fallback";
  costTier?: number;
  inputTokens?: number;
  outputTokens?: number;
  costCredits?: number;
}

interface Bucket {
  windowStart: number;
  started: number;
  ok: number;
  error: number;
  fallback: number;
  inputTokens: number;
  outputTokens: number;
  costCredits: number;
}

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 512;
const buckets = new Map<string, Bucket>();
let windowStarted = Date.now();
let totalAttempts = 0;

function rotate(now: number) {
  if (now - windowStarted < WINDOW_MS) return;
  windowStarted = now;
  totalAttempts = 0;
  buckets.clear();
}

function key(e: UsageEvent) {
  return [e.provider, e.model, e.task].map((v) => v.slice(0, 80)).join("|");
}

export function maxAiRequestsPerMinute(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env["WORLDWAY_AI_MAX_REQUESTS_PER_MINUTE"] ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(10_000, Math.max(0, Math.floor(raw)));
}

export function allowAiAttempt(env: Record<string, string | undefined> = process.env, now = Date.now()): boolean {
  rotate(now);
  const max = maxAiRequestsPerMinute(env);
  if (max === 0) return true;
  if (totalAttempts >= max) return false;
  totalAttempts += 1;
  return true;
}

export function recordAiUsage(event: UsageEvent, now = Date.now()): void {
  rotate(now);
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key(event))) return;
  const k = key(event);
  const b = buckets.get(k) ?? {
    windowStart: windowStarted,
    started: 0,
    ok: 0,
    error: 0,
    fallback: 0,
    inputTokens: 0,
    outputTokens: 0,
    costCredits: 0,
  };
  if (event.outcome === "started") b.started += 1;
  if (event.outcome === "ok") b.ok += 1;
  if (event.outcome === "error") b.error += 1;
  if (event.outcome === "fallback") b.fallback += 1;
  b.inputTokens += Number.isFinite(event.inputTokens) ? Math.max(0, event.inputTokens ?? 0) : 0;
  b.outputTokens += Number.isFinite(event.outputTokens) ? Math.max(0, event.outputTokens ?? 0) : 0;
  b.costCredits += Number.isFinite(event.costCredits) ? Math.max(0, event.costCredits ?? 0) : 0;
  buckets.set(k, b);
}

export function usageSnapshot(now = Date.now()) {
  rotate(now);
  return {
    windowStart: windowStarted,
    attempts: totalAttempts,
    maxAttempts: maxAiRequestsPerMinute(),
    buckets: [...buckets.entries()].map(([key, value]) => ({ key, ...value })),
  };
}
