// Worldway AI cost governance. Pure policy: no billing API calls and no secrets.
// The default preserves the current routing behavior (cost tier <= 3).
export const DEFAULT_MAX_AI_COST_TIER = 3;
export const DEFAULT_MAX_AI_ROUTE_ATTEMPTS = 2;
export const DEFAULT_MAX_AI_REQUESTS_PER_MINUTE = 0;

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function maxAiCostTier(env: Record<string, string | undefined> = process.env): number {
  return boundedInteger(env["WORLDWAY_AI_MAX_COST_TIER"], DEFAULT_MAX_AI_COST_TIER, 1, 5);
}

export function allowsAiCostTier(costTier: number, env: Record<string, string | undefined> = process.env): boolean {
  return costTier <= maxAiCostTier(env);
}

/**
 * Hard upper bound on provider attempts for one logical AI request.
 * This protects against runaway fallback chains while preserving one normal
 * attempt plus one bounded fallback by default.
 */
export function maxAiRouteAttempts(env: Record<string, string | undefined> = process.env): number {
  return boundedInteger(env["WORLDWAY_AI_MAX_ROUTE_ATTEMPTS"], DEFAULT_MAX_AI_ROUTE_ATTEMPTS, 1, 4);
}

/**
 * Emergency process-local request budget. Zero means disabled.
 * The counter is keyed by the env object so tests and explicitly injected
 * environments remain isolated without introducing a shared billing service.
 */
export function maxAiRequestsPerMinute(env: Record<string, string | undefined> = process.env): number {
  return boundedInteger(env["WORLDWAY_AI_MAX_REQUESTS_PER_MINUTE"], DEFAULT_MAX_AI_REQUESTS_PER_MINUTE, 0, 10_000);
}

type BudgetState = { windowStart: number; attempts: number };
const budgets = new WeakMap<object, BudgetState>();
const WINDOW_MS = 60_000;

export function allowAiRequestAttempt(
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
): boolean {
  const max = maxAiRequestsPerMinute(env);
  if (max === 0) return true;

  let state = budgets.get(env);
  if (!state || now - state.windowStart >= WINDOW_MS) {
    state = { windowStart: now, attempts: 0 };
    budgets.set(env, state);
  }

  if (state.attempts >= max) return false;
  state.attempts += 1;
  return true;
}
