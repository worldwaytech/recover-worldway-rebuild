import type { WorldwayDecisionContract } from "./decision-contract";
import type { ComponentKind } from "../../engine/types";
import type { RankingProfile, RankingWeights } from "../../engine/optimization";

const COMPONENT_KINDS: readonly ComponentKind[] = [
  "flight", "stay", "activity", "transfer", "rail", "cruise", "aviation", "insurance", "visa",
];

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
  const kindPreferences: Partial<Record<ComponentKind, number>> = {};

  for (const rawConstraint of contract.constraints) {
    const trimmed = rawConstraint.trim();
    const match = /^optimization\.weight\.([A-Za-z]+)=([0-9]+(?:\.[0-9]+)?)$/.exec(trimmed);
    const preferenceMatch = /^optimization\.preference\.kind\.([A-Za-z]+)=([0-9]+(?:\.[0-9]+)?)$/.exec(trimmed);

    if (match) {
      const key = match[1] as keyof RankingWeights;
      const value = Number(match[2]);
      if (WEIGHT_KEYS.includes(key) && Number.isFinite(value) && value >= 0 && value <= 1) {
        weights[key] = value;
      }
      continue;
    }

    if (preferenceMatch) {
      const kind = preferenceMatch[1] as ComponentKind;
      const value = Number(preferenceMatch[2]);
      if (COMPONENT_KINDS.includes(kind) && Number.isFinite(value) && value >= 0 && value <= 1) {
        kindPreferences[kind] = value;
      }
    }
  }

  return Object.keys(weights).length || Object.keys(kindPreferences).length
    ? {
        ...(Object.keys(weights).length ? { weights } : {}),
        ...(Object.keys(kindPreferences).length ? { kindPreferences } : {}),
      }
    : {};
}
