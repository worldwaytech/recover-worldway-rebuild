// Worldway AI cost governance. Pure policy: no billing API calls and no secrets.
// The default preserves the current routing behavior (cost tier <= 3).
export const DEFAULT_MAX_AI_COST_TIER = 3;

export function maxAiCostTier(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env["WORLDWAY_AI_MAX_COST_TIER"] ?? DEFAULT_MAX_AI_COST_TIER);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_AI_COST_TIER;
  return Math.min(5, Math.max(1, Math.floor(raw)));
}

export function allowsAiCostTier(costTier: number, env: Record<string, string | undefined> = process.env): boolean {
  return costTier <= maxAiCostTier(env);
}
