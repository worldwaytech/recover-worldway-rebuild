import type { WorldwayDecisionContract } from "./decision-contract";
import type { RankingProfile, RankingWeights } from "../../engine/optimization";

const WEIGHT_KEYS: readonly (keyof RankingWeights)[] = [
  "feasibility", "luxury", "price", "budget", "flexibility",
  "reliability", "geography", "time", "margin", "preference",
];

/**
 * Projects only explicit, bounded optimization preferences into the existing
 * deterministic optimization profile. The optimizer remains authoritative for
 * Pareto selection, chronology, feasibility, limits and booking eligibility.
 */
export function projectDecisionContractToOptimizationProfile(
  contract: WorldwayDecisionContract,
): RankingProfile {
  if (contract.decisionKind !== "recommendation" && contract.decisionKind !== "ranking") {
    throw new Error("decision_contract_not_optimization_compatible");
  }

  const weights: Partial<RankingWeights> = {};
  for (const rawConstraint of contract.constraints) {
    const match = /^optimization\.weight\.([A-Za-z]+)=([0-9]+(?:\.[0-9]+)?)$/.exec(rawConstraint.trim());
    if (!match) continue;

    const key = match[1] as keyof RankingWeights;
    const value = Number(match[2]);
    if (!WEIGHT_KEYS.includes(key) || !Number.isFinite(value) || value < 0 || value > 1) continue;
    weights[key] = value;
  }

  return Object.keys(weights).length ? { weights } : {};
}
