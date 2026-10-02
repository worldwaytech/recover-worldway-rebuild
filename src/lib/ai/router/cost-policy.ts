// Worldway AI cost governance. Pure policy: no billing API calls and no secrets.
// The default preserves the current routing behavior (cost tier <= 3).
export const DEFAULT_MAX_AI_COST_TIER = 3;
export const DEFAULT_MAX_AI_ROUTE_ATTEMPTS = 2;

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
